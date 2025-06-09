# Usamos o Debian 11 "Bullseye", que é estável e compatível com a versão que vamos fixar do ocrmypdf.
FROM python:3.10-slim-bullseye

# Instala o Ghostscript 9.53.3 e outras dependências do repositório oficial do Debian.
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-por \
    ghostscript \
    unpaper \
    pngquant \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia e instala as dependências Python (com a versão do ocrmypdf fixada)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código da aplicação
COPY app.py .

# Define o comando para iniciar a API com Gunicorn
CMD ["gunicorn", "--workers", "2", "--timeout", "120", "--bind", "0.0.0.0:5000", "app:app"]