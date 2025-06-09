import os
import subprocess
import uuid
import zipfile
import base64
import boto3
import json
import ocrmypdf
from flask import Flask, request
from pdf2docx import Converter
# --- Configuração da Aplicação Flask ---
app = Flask(__name__)
PROCESSING_DIR = '/tmp'

# --- Configuração do Cliente S3 (Boto3) ---
S3_BUCKET = os.environ.get('S3_BUCKET_NAME', 'processing-results')
S3_ENDPOINT_URL = os.environ.get('S3_ENDPOINT_URL', 'http://localstack:4566')
PUBLIC_HOSTNAME = os.environ.get('PUBLIC_HOSTNAME', 'localhost')

s3_client = boto3.client('s3', endpoint_url=S3_ENDPOINT_URL)

def create_api_response(status_code, body_dict):
    """Cria uma resposta JSON padronizada."""
    response = app.response_class(
        response=json.dumps(body_dict),
        status=status_code,
        mimetype='application/json'
    )
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

# --- Endpoint da API ---
@app.route('/convert', methods=['POST', 'OPTIONS'])
def convert_pdf_to_word_api():
    if request.method == 'OPTIONS':
        return app.response_class(status=200, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST'})

    try:
        data = request.get_json()
        if not data or 'files' not in data:
            return create_api_response(400, {"error": "Payload JSON inválido ou 'files' ausente."})

        files_to_process = data['files']
        ocr_enabled = data.get('ocrEnabled', False)
        
        docx_output_paths = []

        for index, file_data in enumerate(files_to_process):
            pdf_bytes = base64.b64decode(file_data['pdf'])
            
            input_path = os.path.join(PROCESSING_DIR, f"{uuid.uuid4()}_input.pdf")
            with open(input_path, 'wb') as f:
                f.write(pdf_bytes)

            pdf_for_conversion = input_path

            if ocr_enabled:
                print(f"OCR HABILITADO. Processando arquivo {index+1} com OCR...")
                ocr_pdf_path = os.path.join(PROCESSING_DIR, f"{uuid.uuid4()}_ocr.pdf")
                
                # --- AJUSTE FINAL PARA O BUG DO GHOSTSCRIPT 10.0.0 ---
                ocrmypdf.ocr(
                    input_path,
                    ocr_pdf_path,
                    language='por',
                    skip_text=True
                )
                print("Processamento com OCR concluído.")
                
                pdf_for_conversion = ocr_pdf_path
            else:
                print(f"OCR DESABILITADO. Pulando etapa de OCR para o arquivo {index+1}.")


            # 3. A etapa de conversão agora usa a variável 'pdf_for_conversion'
            print(f"Convertendo arquivo '{os.path.basename(pdf_for_conversion)}' para DOCX...")
            docx_path = os.path.join(PROCESSING_DIR, f"output_{index}.docx")
            cv = Converter(pdf_for_conversion)
            cv.convert(docx_path, start=0, end=None)
            cv.close()
            print("Conversão para DOCX concluída.")

            docx_output_paths.append(docx_path)
            
            # Limpa os arquivos intermediários
            if pdf_for_conversion != input_path:
                os.remove(pdf_for_conversion) # Remove o arquivo _ocr.pdf
            os.remove(input_path) # Remove o arquivo _input.pdf original

        # 4. Compacta os resultados
        zip_filename = f"{uuid.uuid4()}.zip"
        zip_path = os.path.join(PROCESSING_DIR, zip_filename)
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for docx_file in docx_output_paths:
                zipf.write(docx_file, os.path.basename(docx_file))
                os.remove(docx_file)

        # 5. Upload para o S3
        s3_client.upload_file(zip_path, S3_BUCKET, zip_filename, ExtraArgs={'ACL': 'public-read', 'ContentType': 'application/zip'})
        os.remove(zip_path)

        # 6. Retorna a URL
        final_url = f"http://{PUBLIC_HOSTNAME}:4566/{S3_BUCKET}/{zip_filename}"
        return create_api_response(200, {'message': 'Conversão concluída com sucesso!', 'url': final_url})

    except Exception as e:
        app.logger.error(f"Erro no processo de conversão: {e}", exc_info=True)
        return create_api_response(500, {"error": f"Erro interno no servidor: {str(e)}"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)