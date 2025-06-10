import os
import boto3
import base64
import uuid
import zipfile
from io import BytesIO
import fitz  # PyMuPDF

# --- Configuração ---
BUCKET_NAME = os.environ.get('BUCKET_NAME')
PUBLIC_HOSTNAME = os.environ.get('PUBLIC_HOSTNAME', 'localhost')
s3_endpoint_url = f"http://localstack:4566"
s3_client = boto3.client(
    's3',
    endpoint_url=s3_endpoint_url,
    aws_access_key_id='test',
    aws_secret_access_key='test',
    region_name=os.environ.get('AWS_REGION', 'us-east-1')
)

def handler(event, context):
    try:
        files_data = event.get('files', [])
        password = event.get('password')

        if not files_data or not password:
            return {
                'statusCode': 400,
                'body': '{"message": "Payload inválido. \'files\' e \'password\' são obrigatórios."}'
            }

        zip_buffer = BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file_obj:
            for file_data in files_data:
                pdf_base64 = file_data['pdf']
                original_name = file_data['originalName'] # Vamos assumir que o front-end envia o nome
                rotation = file_data.get('rotation', 0)

                input_pdf_bytes = base64.b64decode(pdf_base64)
                doc = fitz.open("pdf", input_pdf_bytes)

                # 1. Aplica a rotação se necessário
                if rotation != 0:
                    for page in doc:
                        page.set_rotation(page.rotation + rotation)
                
                # 2. Guarda o PDF com encriptação
                # PyMuPDF usa permissões para controlar o que o utilizador pode fazer.
                # Aqui, permitimos tudo (imprimir, copiar, modificar) após inserir a senha.
                perm = fitz.PDF_PERM_PRINT | fitz.PDF_PERM_COPY | fitz.PDF_PERM_MODIFY
                
                encrypted_pdf_bytes = doc.tobytes(
                    encryption=fitz.PDF_ENCRYPT_AES_256,  # Algoritmo de encriptação forte
                    owner_pw=password,
                    user_pw=password,
                    permissions=perm
                )
                doc.close()
                
                # Adiciona o PDF protegido ao ficheiro zip
                protected_name = f"protegido-{original_name}"
                zip_file_obj.writestr(protected_name, encrypted_pdf_bytes)
        
        zip_buffer.seek(0)
        zip_key = f"protected-pdfs-{uuid.uuid4()}.zip"

        s3_client.put_object(
            Bucket=BUCKET_NAME, Key=zip_key, Body=zip_buffer, ContentType='application/zip'
        )
        zip_url = f"http://{PUBLIC_HOSTNAME}:4566/{BUCKET_NAME}/{zip_key}"

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': {
                "message": "Ficheiros protegidos com sucesso!",
                "zipUrl": zip_url
            }
        }

    except Exception as e:
        import traceback
        print(f"Erro detalhado na função Lambda: {e}\n{traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': f'{{"message": "Erro interno no servidor.", "error": "{str(e)}"}}'
        }
