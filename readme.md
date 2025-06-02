# Requisitos:
aws-cli/1.22.34 Python/3.10.12 Linux/6.8.0-60-generic botocore/1.23.34
Docker version 28.2.2, build e6534b4
node v22.16.0

# Depois de instalar o aws-cli
use o comando:
```
aws configure

```

e preencha:
AWS Access Key ID: test
AWS Secret Access Key: test
Default region name: us-east-1
Default output format: json

após isso execute o script na pasta raiz script.sh
ele irá levantar o docker, esperar o localstack ter inciado e enviar a função que estão em function.zip para o localstack, depois disso irá entrar checar se o front tem a pasta node_modules e se não tiver irá instalar as dependencias do front e inciar o mesmo.