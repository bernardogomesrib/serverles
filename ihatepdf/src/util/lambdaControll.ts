"use server";

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
type lambdaResponse = {
  message: string;
  url?: string;
  error?: string;
};
type responsePayload = {
    statusCode: number;
    body: string;
}
const lambdaClient = new LambdaClient({
  region: "us-east-1",
  endpoint: `http://${process.env.PUBLIC_IP}:4566`,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
});

export async function converter(imagemBase64: string): Promise<lambdaResponse> {
  const command = new InvokeCommand({
    FunctionName: "image-processor",
    Payload: Buffer.from(JSON.stringify({ image: imagemBase64 })),
  });

  const response = await lambdaClient.send(command);
  if (!response.Payload) {
    throw new Error("Payload da resposta está vazio.");
  }

  const payload: responsePayload = JSON.parse(
    Buffer.from(response.Payload).toString()
  );
  
  return JSON.parse(payload.body);
}
