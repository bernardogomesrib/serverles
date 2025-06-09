/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

// --- Tipos ---
// Resposta genérica da Lambda, agora com todos os campos possíveis
type LambdaResponse = {
  message: string;
  url?: string;
  urls?: string[];
  zipUrl?: string;
  totalOriginalSize?: number;
  totalCompressedSize?: number;
  error?: string;
};

type ResponsePayload = {
  statusCode: number;
  body: string| ObjectResponse;
};
type ObjectResponse ={
  message: string;
  zipUrl?: string;
  totalCompressedSize?: number;
  totalOriginalSize?: number;
  error?: string;
}
// Tipos para as diferentes funções
export type PdfFilePayload = { pdf: string; rotation: number };
type SplitRange = { from: number; to: number };
type SplitOptions = { merge: boolean; ranges?: SplitRange[]; pages?: number[] };
export type CompressionLevel = "extreme" | "recommended" | "less";
export type CompressFilePayload = {
  pdfBase64: string;
  originalName: string;
  originalSize: number;
  rotation: number;
};

// --- Cliente Lambda ---
const lambdaClient = new LambdaClient({
  region: "us-east-1",
  endpoint: `http://${process.env.PUBLIC_HOSTNAME || "localhost"}:4566`,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
});

// --- Função Genérica de Invocação ---
async function invokeLambda(
  functionName: string,
  payload: object
): Promise<LambdaResponse> {
  const command = new InvokeCommand({
    FunctionName: functionName,
    Payload: Buffer.from(JSON.stringify(payload)),
  });

  const response = await lambdaClient.send(command);
  if (!response.Payload) throw new Error("Payload da resposta está vazio.");

  const responsePayload: ResponsePayload = JSON.parse(
    Buffer.from(response.Payload).toString()
  );
  console.log(`Resposta da Lambda [${functionName}]:`, responsePayload);

  if (responsePayload.body && typeof responsePayload.body === "string") {
    try {
      return JSON.parse(responsePayload.body);
    } catch (e) {
      return {
        message: "Resposta da Lambda com formato inválido.",
        error: responsePayload.body,
      };
    }
  } else if (responsePayload.statusCode === 200 && typeof responsePayload.body === "object" && responsePayload.body !== null) {
    return {
      message: responsePayload.body.message || "Resposta da Lambda sem corpo.",
      zipUrl: responsePayload.body.zipUrl,
      totalCompressedSize: responsePayload.body.totalCompressedSize,
      totalOriginalSize: responsePayload.body.totalOriginalSize,
    };
  }
  return { message: "Resposta da Lambda sem corpo.", error: "Payload vazio." };
}

// --- Funções de API existentes ---
export async function converterImagem(
  imagemBase64: string
): Promise<LambdaResponse> {
  return invokeLambda("image-processor", { image: imagemBase64 });
}

export async function juntarPdfs(
  files: PdfFilePayload[]
): Promise<LambdaResponse> {
  return invokeLambda("pdf-merger", { files });
}

export async function splitPdf(
  pdfBase64: string,
  originalName: string,
  mode: "range" | "extract",
  options: SplitOptions
): Promise<LambdaResponse> {
  return invokeLambda("pdf-splitter", {
    pdfBase64,
    originalName,
    mode,
    options,
  });
}

/**
 * Invoca a função Lambda 'pdf-compressor'.
 * @param files Um array de objetos, cada um contendo o PDF, nome, tamanho e rotação.
 * @param compressionLevel O nível de compressão selecionado pelo utilizador.
 * @returns Uma promessa que resolve para a resposta da Lambda, contendo o URL do ZIP e as estatísticas de compressão.
 */
export async function compressPdfs(
  files: CompressFilePayload[],
  compressionLevel: CompressionLevel
): Promise<LambdaResponse> {
  // O payload corresponde exatamente ao que a função `pdf-compressor/index.js` espera.
  const payload = {
    files,
    compressionLevel,
  };
  return invokeLambda("pdf-compression", payload);
}
