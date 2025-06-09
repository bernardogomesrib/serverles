const { S3 } = require("aws-sdk");
const { PDFDocument } = require("pdf-lib");
const { v4: uuidv4 } = require("uuid");

// --- Configuração ---
const BUCKET_NAME = process.env.BUCKET_NAME;
const PUBLIC_HOSTNAME = process.env.PUBLIC_HOSTNAME || "localhost";
const s3 = new S3({
  endpoint: "http://localstack:4566",
  s3ForcePathStyle: true,
});

// --- Função Auxiliar para guardar um PDF no S3 ---
async function savePdfToS3(pdfBytes, originalName, suffix) {
  const key = `${originalName.replace(".pdf", "")}-${suffix}-${uuidv4()}.pdf`;
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: Buffer.from(pdfBytes),
    ContentType: "application/pdf",
  };
  await s3.putObject(params).promise();
  return `http://${PUBLIC_HOSTNAME}:4566/${BUCKET_NAME}/${key}`;
}

// --- Lógica de Divisão por Intervalos (Ranges) ---
async function handleSplitByRange(pdf, ranges, merge, originalName) {
  const urls = [];
  const mergedPdf = await PDFDocument.create();

  for (const range of ranges) {
    const docToProcess = await PDFDocument.create();
    const start = Math.max(0, range.from - 1);
    const end = Math.min(pdf.getPageCount(), range.to);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);

    if (indices.length > 0) {
      const copiedPages = await docToProcess.copyPages(pdf, indices);
      copiedPages.forEach((page) => docToProcess.addPage(page));

      if (merge) {
        const pagesToMerge = await mergedPdf.copyPages(
          docToProcess,
          docToProcess.getPageIndices()
        );
        pagesToMerge.forEach((page) => mergedPdf.addPage(page));
      } else {
        const pdfBytes = await docToProcess.save();
        urls.push(
          await savePdfToS3(
            pdfBytes,
            originalName,
            `range-${range.from}-${range.to}`
          )
        );
      }
    }
  }

  if (merge && mergedPdf.getPageCount() > 0) {
    const pdfBytes = await mergedPdf.save();
    urls.push(await savePdfToS3(pdfBytes, originalName, "merged"));
  }
  return urls;
}

// --- Lógica de Extração de Páginas ---
async function handleExtractPages(pdf, pages, merge, originalName) {
  const urls = [];
  const mergedPdf = await PDFDocument.create();

  // Converte os números de página para índices baseados em zero
  const pageIndices = pages
    .map((p) => p - 1)
    .filter((p) => p >= 0 && p < pdf.getPageCount());

  if (merge) {
    const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
    copiedPages.forEach((page) => mergedPdf.addPage(page));
    const pdfBytes = await mergedPdf.save();
    urls.push(await savePdfToS3(pdfBytes, originalName, "extracted-merged"));
  } else {
    for (const index of pageIndices) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdf, [index]);
      newPdf.addPage(copiedPage);
      const pdfBytes = await newPdf.save();
      urls.push(await savePdfToS3(pdfBytes, originalName, `page-${index + 1}`));
    }
  }
  return urls;
}

// --- Handler Principal da Lambda ---
exports.handler = async (event) => {
  try {
    const { pdfBase64, mode, options, originalName } = event;
    if (!pdfBase64 || !mode || !options) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Payload inválido." }),
      };
    }

    const pdfBytes = Buffer.from(pdfBase64, "base64");
    const pdf = await PDFDocument.load(pdfBytes);
    let urls = [];

    if (mode === "range") {
      urls = await handleSplitByRange(
        pdf,
        options.ranges,
        options.merge,
        originalName
      );
    } else if (mode === "extract") {
      urls = await handleExtractPages(
        pdf,
        options.pages,
        options.merge,
        originalName
      );
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Modo de divisão inválido." }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "PDF dividido com sucesso!",
        urls: urls,
      }),
    };
  } catch (error) {
    console.error("Erro ao dividir PDF:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Erro interno no servidor",
        error: error.message,
      }),
    };
  }
};
