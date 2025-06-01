const Jimp = require("jimp");

exports.handler = async (event) => {
  const imageB64 = event.image;
  if (!imageB64) {
    return { statusCode: 400, body: "No image provided" };
  }

  const buffer = Buffer.from(imageB64, "base64");
  const image = await Jimp.read(buffer);

  image.grayscale();

  const outBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
  const outB64 = outBuffer.toString("base64");

  return {
    statusCode: 200,
    body: outB64,
  };
};

console.log("typeof Jimp.read:", typeof Jimp.read); // Deve ser 'function'
