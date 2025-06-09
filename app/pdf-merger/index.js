const { S3 } = require("aws-sdk");
const { PDFDocument, degrees } = require("pdf-lib"); // Importa a função 'degrees'
const { v4: uuidv4 } = require("uuid");

const BUCKET_NAME = process.env.BUCKET_NAME;
const PUBLIC_HOSTNAME = process.env.PUBLIC_HOSTNAME || "localhost";

const s3 = new S3({
  endpoint: "http://localstack:4566",
  s3ForcePathStyle: true,
});

exports.handler = async (event) => {
  try {
    // A carga agora é um objeto com a chave "files"
    const { files } = event;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Nenhum ficheiro PDF fornecido." }),
      };
    }

    const mergedPdf = await PDFDocument.create();

    // Itera sobre cada objeto de ficheiro (pdf + rotação)
    for (const file of files) {
      const pdfBytes = Buffer.from(file.pdf, "base64");
      const rotationAngle = file.rotation || 0; // Padrão para 0 se não for fornecido

      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Gira cada página do documento antes de a copiar
      const pages = pdfDoc.getPages();
      pages.forEach((page) => {
        page.setRotation(degrees(rotationAngle));
      });

      const copiedPages = await mergedPdf.copyPages(
        pdfDoc,
        pdfDoc.getPageIndices()
      );
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();
    const key = `${uuidv4()}.pdf`;

    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: Buffer.from(mergedPdfBytes),
      ContentType: "application/pdf",
    };

    await s3.putObject(params).promise();
    const publicUrl = `http://${PUBLIC_HOSTNAME}:4566/${BUCKET_NAME}/${key}`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "PDFs juntados com sucesso!",
        url: publicUrl,
      }),
    };
  } catch (error) {
    console.error("Erro ao juntar PDFs:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Erro interno no servidor",
        error: error.message,
      }),
    };
  }
};
