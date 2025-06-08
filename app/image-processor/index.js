const Jimp = require("jimp");
const { S3 } = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

// Pega as variáveis de ambiente da Lambda.
const BUCKET_NAME = process.env.BUCKET_NAME;
// Pega o hostname público (seu IP ou 'localhost') ou usa 'localhost' como padrão.
const PUBLIC_HOSTNAME = process.env.PUBLIC_HOSTNAME || "localhost";

// Configura o cliente S3 para apontar para o LocalStack (para comunicação INTERNA do Docker)
const s3 = new S3({
  endpoint: "http://localstack:4566",
  s3ForcePathStyle: true,
});

exports.handler = async (event) => {
  try {
    const imageB64 = event.image;

    if (!imageB64) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "No image provided in the event payload",
        }),
      };
    }

    const buffer = Buffer.from(imageB64, "base64");
    const image = await Jimp.read(buffer);

    image.grayscale();

    const outBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
    const key = `${uuidv4()}`;

    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: outBuffer,
      ContentType: Jimp.MIME_PNG,
    };

    // A Lambda faz o upload para o S3 usando o endpoint INTERNO.
    await s3.putObject(params).promise();

    // ############ CORREÇÃO AQUI! ############
    // Constrói a URL PÚBLICA usando a variável de ambiente, que é acessível pelo seu navegador.
    const publicUrl = `http://${PUBLIC_HOSTNAME}:4566/${BUCKET_NAME}/${key}`;

    // Retorna a URL pública correta para o front-end.
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "Image processed successfully!",
        url: publicUrl,
      }),
    };
  } catch (error) {
    console.error("Error processing image:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error",
        error: error.message,
      }),
    };
  }
};
