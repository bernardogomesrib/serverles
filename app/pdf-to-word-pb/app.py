import os
import uuid
import zipfile
import base64
import boto3
import json
import ocrmypdf
import time
import threading
from flask import Flask, request, Response
from pdf2docx import Converter

app = Flask(__name__)
PROCESSING_DIR = '/tmp'

# --- Configuração do Cliente S3 ---
S3_BUCKET = os.environ.get('S3_BUCKET_NAME', 'processing-results')
S3_ENDPOINT_URL = os.environ.get('S3_ENDPOINT_URL', 'http://localstack:4566')
PUBLIC_HOSTNAME = os.environ.get('PUBLIC_HOSTNAME', 'localhost')
s3_client = boto3.client('s3', endpoint_url=S3_ENDPOINT_URL)

# --- Gerenciador de Tarefas (Simplificado) ---
# ATENÇÃO: Em produção, use Celery/Redis. Este dicionário não é seguro para múltiplos workers.
jobs = {}

def update_job_status(job_id, status, progress, data=None):
    """Atualiza o status de uma tarefa."""
    jobs[job_id] = {"status": status, "progress": progress, "data": data}
    print(f"Job {job_id}: {status} - {progress}%")

def conversion_task(job_id, files_to_process, ocr_enabled):
    """A função que executa a conversão em background."""
    try:
        total_files = len(files_to_process)
        docx_output_paths = []

        for index, file_data in enumerate(files_to_process):
            # --- Atualiza Progresso: Início do processamento do arquivo ---
            progress_percent = int(((index) / total_files) * 100)
            update_job_status(job_id, f"Processando arquivo {index + 1}/{total_files}", progress_percent)

            pdf_bytes = base64.b64decode(file_data['pdf'])
            input_path = os.path.join(PROCESSING_DIR, f"{job_id}_{index}_input.pdf")
            with open(input_path, 'wb') as f:
                f.write(pdf_bytes)

            pdf_for_conversion = input_path
            if ocr_enabled:
                update_job_status(job_id, f"Aplicando OCR no arquivo {index + 1}", progress_percent + 5)
                ocr_pdf_path = os.path.join(PROCESSING_DIR, f"{job_id}_{index}_ocr.pdf")
                ocrmypdf.ocr(input_path, ocr_pdf_path, language='por', skip_text=True)
                pdf_for_conversion = ocr_pdf_path

            update_job_status(job_id, f"Convertendo para Word o arquivo {index + 1}", progress_percent + 10)
            docx_path = os.path.join(PROCESSING_DIR, f"output_{job_id}_{index}.docx")
            cv = Converter(pdf_for_conversion)
            cv.convert(docx_path, start=0, end=None)
            cv.close()
            docx_output_paths.append(docx_path)
            
            if pdf_for_conversion != input_path:
                os.remove(pdf_for_conversion)
            os.remove(input_path)

        # --- Atualiza Progresso: Compactação ---
        update_job_status(job_id, "Compactando arquivos...", 90)
        zip_filename = f"{job_id}.zip"
        zip_path = os.path.join(PROCESSING_DIR, zip_filename)
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for docx_file in docx_output_paths:
                zipf.write(docx_file, os.path.basename(docx_file))
                os.remove(docx_file)

        # --- Atualiza Progresso: Upload para o S3 ---
        update_job_status(job_id, "Enviando para o S3...", 95)
        s3_client.upload_file(zip_path, S3_BUCKET, zip_filename, ExtraArgs={'ACL': 'public-read', 'ContentType': 'application/zip'})
        os.remove(zip_path)

        final_url = f"http://{PUBLIC_HOSTNAME}:4566/{S3_BUCKET}/{zip_filename}"
        
        # --- Atualiza Progresso: Concluído ---
        update_job_status(job_id, "Concluído", 100, {"url": final_url})

    except Exception as e:
        print(f"Erro na tarefa {job_id}: {e}")
        update_job_status(job_id, "Erro", 100, {"error": str(e)})


# --- Endpoints da API ---

@app.route('/start-conversion', methods=['POST'])
def start_conversion_api():
    """Endpoint para iniciar a tarefa de conversão."""
    job_id = str(uuid.uuid4())
    data = request.get_json()
    
    files = data.get('files', [])
    ocr_enabled = data.get('ocrEnabled', False)

    if not files:
        return {"error": "Nenhum arquivo enviado"}, 400

    # Armazena o estado inicial da tarefa
    jobs[job_id] = {"status": "Iniciando...", "progress": 0}
    
    # Inicia a tarefa em uma thread separada para não bloquear a resposta
    thread = threading.Thread(target=conversion_task, args=(job_id, files, ocr_enabled))
    thread.start()
    
    # Retorna o ID da tarefa imediatamente
    return {"job_id": job_id}, 202

@app.route('/stream/<job_id>')
def stream_status_api(job_id):
    """Endpoint de streaming (SSE) para o progresso da tarefa."""
    def generate():
        last_status = None
        while True:
            job = jobs.get(job_id)
            if job and job != last_status:
                # Formato do Server-Sent Event: "data: <json_string>\n\n"
                yield f"data: {json.dumps(job)}\n\n"
                last_status = job
                if job.get("progress") == 100:
                    break # Encerra o stream se a tarefa terminou (sucesso ou erro)
            time.sleep(1) # Espera 1 segundo antes de checar novamente
        
        # Limpa a tarefa do dicionário após o stream terminar
        if job_id in jobs:
            del jobs[job_id]

    # Retorna uma resposta de streaming
    return Response(generate(), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)