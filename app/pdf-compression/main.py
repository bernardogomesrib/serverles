import os
import boto3
import base64
import uuid
import subprocess
import zipfile
from io import BytesIO

# --- Configuração ---
BUCKET_NAME = os.environ.get('BUCKET_NAME')
PUBLIC_HOSTNAME = os.environ.get('PUBLIC_HOSTNAME', 'localhost')
s3_client = boto3.client(
    's3',
    endpoint_url=f"http://{os.environ.get('LOCALSTACK_HOSTNAME')}:{os.environ.get('EDGE_PORT')}",
    aws_access_key_id='test',
    aws_secret_access_key='test',
    region_name=os.environ.get('AWS_REGION', 'us-east-1')
)

# Mapeia os níveis para as configurações predefinidas do Ghostscript
# /screen -> Baixa qualidade, alta compressão (72 dpi)
# /ebook -> Boa qualidade, boa compressão (150 dpi)
# /printer -> Alta qualidade, baixa compressão (300 dpi)
GHOSTSCRIPT_SETTINGS = {
    'extreme': '/screen',
    'recommended': '/ebook',
    'less': '/printer'
}

def handler(event, context):
    try:
        files_data = event.get('files', [])
        compression_level_key = event.get('compressionLevel', 'recommended')

        if not files_data:
            return {'statusCode': 400, 'body': '{"message": "Nenhum ficheiro fornecido."}'}

        zip_buffer = BytesIO()
        total_original_size = 0
        total_compressed_size = 0

        # O Ghostscript precisa de caminhos de ficheiro, então usamos o diretório /tmp da Lambda
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file_obj:
            for file_data in files_data:
                pdf_base64 = file_data['pdfBase64']
                original_name = file_data['originalName']
                original_size_bytes = file_data['originalSize']
                total_original_size += original_size_bytes

                input_pdf_bytes = base64.b64decode(pdf_base64)
                
                # Cria ficheiros temporários para entrada e saída do Ghostscript
                tmp_input_path = f"/tmp/{uuid.uuid4()}-{original_name}"
                tmp_output_path = f"/tmp/compressed-{uuid.uuid4()}-{original_name}"

                with open(tmp_input_path, 'wb') as f_in:
                    f_in.write(input_pdf_bytes)

                # Constrói o comando do Ghostscript
                gs_command = [
                    'gs',
                    '-sDEVICE=pdfwrite',
                    '-dCompatibilityLevel=1.4',
                    '-dNOPAUSE',
                    '-dBATCH',
                    '-dQUIET',
                    f'-dPDFSETTINGS={GHOSTSCRIPT_SETTINGS.get(compression_level_key)}',
                    f'-sOutputFile={tmp_output_path}',
                    tmp_input_path
                ]

                try:
                    # Executa o comando e espera que termine
                    subprocess.run(gs_command, check=True, timeout=30)
                    with open(tmp_output_path, 'rb') as f_out:
                        compressed_pdf_bytes = f_out.read()
                    
                    zip_file_obj.writestr(original_name, compressed_pdf_bytes)
                    total_compressed_size += len(compressed_pdf_bytes)
                except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
                    print(f"Erro ou timeout do Ghostscript ao processar {original_name}: {e}. A usar o ficheiro original.")
                    zip_file_obj.writestr(original_name, input_pdf_bytes)
                    total_compressed_size += len(input_pdf_bytes)
                finally:
                    # Limpa os ficheiros temporários
                    if os.path.exists(tmp_input_path): os.remove(tmp_input_path)
                    if os.path.exists(tmp_output_path): os.remove(tmp_output_path)
            
        zip_buffer.seek(0)
        zip_key = f"compressed-pdfs-{uuid.uuid4()}.zip"

        s3_client.put_object(
            Bucket=BUCKET_NAME, Key=zip_key, Body=zip_buffer, ContentType='application/zip'
        )
        zip_url = f"http://{PUBLIC_HOSTNAME}:4566/{BUCKET_NAME}/{zip_key}"
        r = {
                "message": "Ficheiros processados com sucesso!",
                "zipUrl": zip_url,
                "totalOriginalSize": total_original_size,
                "totalCompressedSize": total_compressed_size
            }
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': str(r)
        }

    except Exception as e:
        import traceback
        print(f"Erro detalhado na função Lambda: {e}\n{traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': f'{{"message": "Erro interno no servidor.", "error": "{str(e)}"}}'
        }
