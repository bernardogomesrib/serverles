import os
import subprocess
import uuid
import zipfile
import base64
import boto3
import json
from flask import Flask, request, jsonify, after_this_request

# --- Configuração da Aplicação Flask ---
app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
PROCESSED_FOLDER = 'processed'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

# --- Configuração do Cliente S3 (Boto3) ---
S3_BUCKET = os.environ.get('BUCKET_NAME')
S3_ENDPOINT_URL = os.environ.get('S3_ENDPOINT_URL')
PUBLIC_HOSTNAME = os.environ.get('PUBLIC_HOSTNAME', 'localhost')

s3_client = boto3.client(
    's3',
    endpoint_url=S3_ENDPOINT_URL,
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
    region_name=os.environ.get('AWS_DEFAULT_REGION')
)

# --- Funções de Negócio ---

def compress_and_rotate_pdf(input_path, output_path, compression_level, rotation):
    """Comprime e rotaciona um único PDF com Ghostscript."""
    gs_command = [
        'gs',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dAutoRotatePages=/None',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        f'-sOutputFile={output_path}'
    ]
    compression_settings = {
        'extreme': '/screen', 'recommended': '/ebook', 'less': '/printer'
    }
    gs_command.append(f'-dPDFSETTINGS={compression_settings.get(compression_level, "/ebook")}')
    
    # A sua lógica de rotação, que agora funcionará de forma confiável.
    if rotation in [90, 180, 270]:
        orientation_map = {90: 1, 180: 2, 270: 3}
        gs_command.extend(['-c', f'<</Orientation {orientation_map.get(rotation)}>> setpagedevice', '-f'])
    
    gs_command.append(input_path)
    subprocess.run(gs_command, check=True)


def create_api_response(status_code, body_dict):
    """Cria uma resposta no formato esperado (similar ao AWS Lambda Proxy)."""
    # A verificação de erro agora é feita diretamente no corpo do dicionário
    body_content = body_dict

    response = jsonify({
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps(body_content)
    })
    response.status_code = status_code
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

# --- Endpoint da API ---

@app.route('/process_pdfs', methods=['POST', 'OPTIONS'])
def process_pdfs_api():
    if request.method == 'OPTIONS':
        return jsonify(success=True), 200, {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST'}

    session_id = str(uuid.uuid4())
    session_upload_folder = os.path.join(UPLOAD_FOLDER, session_id)
    session_processed_folder = os.path.join(PROCESSED_FOLDER, session_id)
    os.makedirs(session_upload_folder)
    os.makedirs(session_processed_folder)

    @after_this_request
    def cleanup(response):
        """Limpa arquivos e pastas temporárias após a requisição."""
        try:
            for folder in [session_upload_folder, session_processed_folder]:
                for file in os.listdir(folder):
                    os.remove(os.path.join(folder, file))
                os.rmdir(folder)
        except Exception as e:
            app.logger.error(f"Erro na limpeza da sessão {session_id}: {e}")
        return response

    try:
        data = request.get_json()
        if not data or 'filesPayload' not in data:
            return create_api_response(400, {"error": "Payload JSON inválido ou ausente."})

        files_payload = data['filesPayload']
        compression_level = data.get('compressionLevel', 'recommended')
        
        # ### NOVA LÓGICA: INICIALIZAÇÃO DOS CONTADORES DE TAMANHO ###
        total_original_size = 0
        total_compressed_size = 0
        processed_file_paths = []

        for file_data in files_payload:
            # Acumula o tamanho original a partir do payload
            total_original_size += file_data.get('originalSize', 0)
            
            original_name = file_data.get('originalName', f"{uuid.uuid4()}.pdf")
            pdf_bytes = base64.b64decode(file_data['pdfBase64'])
            rotation = file_data.get('rotation', 0)

            input_path = os.path.join(session_upload_folder, original_name)
            with open(input_path, 'wb') as f:
                f.write(pdf_bytes)

            output_filename = f"processed_{original_name}"
            output_path = os.path.join(session_processed_folder, output_filename)
            compress_and_rotate_pdf(input_path, output_path, compression_level, rotation)
            
            # ### NOVA LÓGICA: ACUMULA O TAMANHO DO ARQUIVO PROCESSADO ###
            total_compressed_size += os.path.getsize(output_path)
            processed_file_paths.append(output_path)

        # ### NOVA LÓGICA: PROCESSAMENTO CONDICIONAL (UM ARQUIVO vs MÚLTIPLOS) ###
        final_url_key = 'url' # Chave padrão para um arquivo
        content_type = 'application/pdf'
        
        if len(files_payload) > 1:
            # Múltiplos arquivos: criar e fazer upload do ZIP
            final_url_key = 'zipUrl'
            content_type = 'application/zip'
            object_key = f"{uuid.uuid4()}.zip"
            file_to_upload_path = os.path.join(session_processed_folder, object_key)
            with zipfile.ZipFile(file_to_upload_path, 'w') as zipf:
                for file_path in processed_file_paths:
                    zipf.write(file_path, os.path.basename(file_path))
        else:
            # Um único arquivo: fazer upload do PDF diretamente
            object_key = f"{uuid.uuid4()}.pdf"
            file_to_upload_path = processed_file_paths[0]

        # Upload do arquivo final (PDF ou ZIP) para o S3
        s3_client.upload_file(
            file_to_upload_path,
            S3_BUCKET,
            object_key,
            ExtraArgs={'ACL': 'public-read', 'ContentType': content_type}
        )
        
        final_s3_url = f"http://{PUBLIC_HOSTNAME}:4566/{S3_BUCKET}/{object_key}"

        # ### NOVA LÓGICA: MONTAGEM DA RESPOSTA FINAL ###
        response_body = {
            "message": "Arquivos processados com sucesso!",
            final_url_key: final_s3_url,
            "totalOriginalSize": total_original_size,
            "totalCompressedSize": total_compressed_size
        }
        
        return create_api_response(200, response_body)

    except Exception as e:
        app.logger.error(f"Ocorreu um erro: {e}", exc_info=True)
        return create_api_response(500, {"error": f"Erro interno no servidor: {str(e)}"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)