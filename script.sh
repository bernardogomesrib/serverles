#!/bin/bash

docker-compose up -d --build

set -e

echo "Aguardando LocalStack iniciar Lambda..."
until aws --endpoint-url=http://localhost:4566 lambda list-functions; do
  sleep 2
done

echo "Criando função Lambda bw-converter..."
aws --endpoint-url=http://localhost:4566 lambda create-function \
  --function-name bw-converter \
  --runtime nodejs18.x \
  --handler index.handler \
  --role arn:aws:iam::000000000000:role/lambda-role \
  --zip-file fileb://app/function.zip \
  --region us-east-1

echo "Função Lambda criada!"

echo "Iniciando front-end..."


if [ ! -d "front/node_modules" ]; then
  cd front
  npm install
fi

cd ..

node front/index.js

# Cria bucket público
#aws --endpoint-url=http://localhost:4566 s3api create-bucket --bucket meu-bucket-publico --region us-east-1

# Deixa o bucket público (no LocalStack, é só para simular)
#aws --endpoint-url=http://localhost:4566 s3api put-bucket-acl --bucket meu-bucket-publico --acl public-read


# Cria função Lambda para converter imagem em PDF
#aws --endpoint-url=http://localhost:4566 lambda create-function \
#  --function-name img-to-pdf \
#  --runtime nodejs18.x \
#  --handler index.handler \
#  --role arn:aws:iam::000000000000:role/lambda-role \
#  --zip-file fileb:///app/img-to-pdf.zip \
#  --region us-east-1

# Cria função Lambda para deletar objeto
#aws --endpoint-url=http://localhost:4566 lambda create-function \
#  --function-name delete-object \
#  --runtime nodejs18.x \
#  --handler index.handler \
#  --role arn:aws:iam::000000000000:role/lambda-role \
#  --zip-file fileb:///app/delete-object.zip \
#  --region us-east-1

# (Opcional) Configura trigger S3 -> Lambda (exemplo para upload)
#aws --endpoint-url=http://localhost:4566 lambda create-event-source-mapping \
#  --function-name img-to-pdf \
#  --event-source-arn arn:aws:s3:::meu-bucket-publico \
#  --starting-position LATEST
