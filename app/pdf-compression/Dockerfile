# Passo 1: Use uma imagem base oficial do Python.
# A versão 'slim' é menor e ideal para produção.
FROM python:3.10-slim

# Passo 2: Instale as dependências do sistema.
# Neste caso, o Ghostscript é o mais importante.
# -y confirma a instalação automaticamente.
# && rm -rf /var/lib/apt/lists/* limpa o cache para manter a imagem pequena.
RUN apt-get update && apt-get install -y ghostscript && rm -rf /var/lib/apt/lists/*

# Passo 3: Defina o diretório de trabalho dentro do container.
WORKDIR /app

# Passo 4: Copie o arquivo de dependências e instale-as.
# Copiar requirements.txt primeiro aproveita o cache do Docker.
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Passo 5: Copie todo o código da sua aplicação para o diretório de trabalho.
COPY . .

# Passo 6: Exponha a porta que o gunicorn usará.
EXPOSE 5000

# Passo 7: Comando para executar a aplicação quando o container iniciar.
# 'app:app' significa: no arquivo app.py, encontre a variável app.
# -b 0.0.0.0 torna a aplicação acessível de fora do container.
CMD ["gunicorn", "--workers", "4", "--bind", "0.0.0.0:5000", "app:app"]