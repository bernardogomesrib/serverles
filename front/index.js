const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Configuração do cliente Lambda para LocalStack
const lambdaClient = new LambdaClient({
  region: "us-east-1",
  endpoint: "http://localhost:4566",
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
});

app.post("/process", async (req, res) => {
  try {
    const command = new InvokeCommand({
      FunctionName: "bw-converter",
      Payload: Buffer.from(JSON.stringify(req.body)),
    });
    const response = await lambdaClient.send(command);
    const payload = JSON.parse(Buffer.from(response.Payload).toString());
    res.status(payload.statusCode).send(payload.body);
  } catch (err) {
    res.status(500).send(err.toString());
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
