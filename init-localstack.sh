#!/bin/bash
set -e

ENDPOINT_URL=http://localhost:4566


echo "Waiting for AWS services to be ready..."
until awslocal s3api list-buckets --endpoint-url="$ENDPOINT_URL" >/dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo -e "\nServices are ready."

echo "Starting AWS resources creation..."

# --- 1. Criação do Bucket S3 ---
echo "--- Creating S3 bucket ---"
awslocal s3 mb "s3://${BUCKET_NAME:-processing-results}" --endpoint-url="$ENDPOINT_URL"
awslocal s3api put-bucket-policy --bucket "${BUCKET_NAME:-processing-results}" --endpoint-url="$ENDPOINT_URL" --policy '{
    "Version": "2012-10-17",
    "Statement": [ { "Sid": "PublicReadGetObject", "Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::'"${BUCKET_NAME:-processing-results}"'/*" } ]
}'

cd "/app/pdf-protector"
rm -rf package function.zip
mkdir -p package

echo "Installing Python dependencies ..."
pip install -r requirements.txt -t ./package --quiet

cp main.py ./package/
cd package
zip -qr ../function.zip .
cd ..

awslocal lambda create-function \
    --function-name pdf-protector \
    --runtime python3.11 \
    --role arn:aws:iam::000000000000:role/lambda-ex \
    --handler main.handler \
    --zip-file fileb://function.zip \
    --timeout 90 \
    --memory-size 1024 \
    --environment "Variables={BUCKET_NAME=${BUCKET_NAME:-processing-results},PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME},LOCALSTACK_HOSTNAME=${LOCALSTACK_HOSTNAME:-localhost},EDGE_PORT=${EDGE_PORT:-4566}}" \
    --endpoint-url="$ENDPOINT_URL"
rm -rf package function.zip


echo "Creating image processor Lambda function..."
cd /app/image-processor
zip -r function.zip . > /dev/null
awslocal lambda create-function \
    --function-name image-processor \
    --runtime nodejs18.x \
    --role arn:aws:iam::000000000000:role/lambda-ex \
    --handler index.handler \
    --zip-file fileb://function.zip \
    --environment "Variables={BUCKET_NAME=$BUCKET_NAME,PUBLIC_HOSTNAME=$PUBLIC_HOSTNAME}" \
    --endpoint-url="$ENDPOINT_URL"

cd /app/pdf-merger
zip -r function.zip . > /dev/null
awslocal lambda create-function \
    --function-name pdf-merger \
    --runtime nodejs18.x \
    --role arn:aws:iam::000000000000:role/lambda-ex \
    --handler index.handler \
    --zip-file fileb://function.zip \
    --environment "Variables={BUCKET_NAME=$BUCKET_NAME,PUBLIC_HOSTNAME=$PUBLIC_HOSTNAME}" \
    --endpoint-url="$ENDPOINT_URL"

cd /app/pdf-splitter
zip -r function.zip . > /dev/null
awslocal lambda create-function \
    --function-name pdf-splitter \
    --runtime nodejs18.x \
    --role arn:aws:iam::000000000000:role/lambda-ex \
    --handler index.handler \
    --zip-file fileb://function.zip \
    --environment "Variables={BUCKET_NAME=$BUCKET_NAME,PUBLIC_HOSTNAME=$PUBLIC_HOSTNAME}" \
    --endpoint-url="$ENDPOINT_URL"



echo "Creating file cleaner Lambda function..."
cd /app/file-cleaner
zip -r function.zip . > /dev/null
awslocal lambda create-function \
    --function-name file-cleaner \
    --runtime nodejs18.x \
    --role arn:aws:iam::000000000000:role/lambda-ex \
    --handler index.handler \
    --zip-file fileb://function.zip \
    --environment "Variables={BUCKET_NAME=$BUCKET_NAME}" \
    --endpoint-url="$ENDPOINT_URL"

echo "Creating EventBridge rule to trigger cleaner..."
RULE_ARN=$(awslocal events put-rule --name every-one-minute --schedule-expression "rate(1 minute)" --query 'RuleArn' --output text --endpoint-url="$ENDPOINT_URL")

echo "Setting cleaner Lambda as target for the rule..."
CLEANER_LAMBDA_ARN=$(awslocal lambda get-function --function-name file-cleaner --query 'Configuration.FunctionArn' --output text --endpoint-url="$ENDPOINT_URL")
awslocal events put-targets --rule every-one-minute --targets "Id"="1","Arn"="$CLEANER_LAMBDA_ARN" --endpoint-url="$ENDPOINT_URL"

echo "Granting EventBridge permission to invoke cleaner Lambda..."
awslocal lambda add-permission --function-name file-cleaner --statement-id "EventBridgeInvoke" --action "lambda:InvokeFunction" --principal events.amazonaws.com --source-arn "$RULE_ARN" --endpoint-url="$ENDPOINT_URL"

echo "AWS resources setup complete! 🚀"
