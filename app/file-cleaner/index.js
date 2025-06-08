const { S3 } = require("aws-sdk");

const BUCKET_NAME = process.env.BUCKET_NAME;
const EXPIRATION_MINUTES = 3;

const s3 = new S3({
  endpoint: "http://localstack:4566",
  s3ForcePathStyle: true,
});

exports.handler = async () => {
  console.log(`Starting cleanup for bucket: ${BUCKET_NAME}`);

  try {
    const listParams = { Bucket: BUCKET_NAME };
    const listedObjects = await s3.listObjectsV2(listParams).promise();

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      console.log("Bucket is empty. Nothing to do.");
      return { statusCode: 200, body: "Bucket is empty." };
    }

    const now = new Date();
    const filesToDelete = listedObjects.Contents.filter((obj) => {
      // Calcula a diferença em milissegundos
      const fileAge = now - new Date(obj.LastModified);
      // Converte a idade para minutos
      const ageInMinutes = fileAge / 1000 / 60;
      return ageInMinutes > EXPIRATION_MINUTES;
    }).map((obj) => ({ Key: obj.Key }));

    if (filesToDelete.length === 0) {
      console.log("No files are old enough to be deleted.");
      return { statusCode: 200, body: "No expired files found." };
    }

    console.log(`Found ${filesToDelete.length} files to delete.`);

    const deleteParams = {
      Bucket: BUCKET_NAME,
      Delete: { Objects: filesToDelete },
    };

    await s3.deleteObjects(deleteParams).promise();

    console.log("Successfully deleted old files.");
    return { statusCode: 200, body: `Deleted ${filesToDelete.length} files.` };
  } catch (error) {
    console.error("Error cleaning up files:", error);
    return { statusCode: 500, body: JSON.stringify(error) };
  }
};
