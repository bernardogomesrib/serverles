'use client';

import { converter } from "@/util/lambdaControll";
import { useState, useRef } from "react";
import { UploadCloud, FileImage, CheckCircle2, XCircle, Trash2 } from "lucide-react";

// Define a estrutura para cada arquivo que será processado
type ProcessFile = {
    id: string; // ID único para a chave do React
    file: File;
    status: 'pending' | 'reading' | 'uploading' | 'completed' | 'error';
    progress: number;
    convertedUrl?: string;
    errorMessage?: string;
};

// Componente da página principal
export default function BlackAndWhiteConverterPage() {
    const [filesToProcess, setFilesToProcess] = useState<ProcessFile[]>([]);
    const [isConverting, setIsConverting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Converte um arquivo para uma string base64
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                // Remove o prefixo "data:image/xxx;base64," para enviar só o dado puro
                resolve(result.split(',')[1]);
            };
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    };

    // Lida com a seleção de arquivos
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (selectedFiles) {
            const newFiles: ProcessFile[] = Array.from(selectedFiles).map(file => ({
                id: `${file.name}-${file.lastModified}`,
                file: file,
                status: 'pending',
                progress: 0,
            }));
            setFilesToProcess(prevFiles => [...prevFiles, ...newFiles]);
        }
    };

    // Remove um arquivo da lista
    const removeFile = (id: string) => {
        setFilesToProcess(prev => prev.filter(f => f.id !== id));
    }

    // Inicia o processo de conversão para todos os arquivos pendentes
    const handleConvertAll = async () => {
        setIsConverting(true);

        // Itera sobre cada arquivo da lista para processá-lo
        for (const file of filesToProcess) {
            // Pula arquivos que não estão pendentes
            if (file.status !== 'pending') continue;

            let progressInterval: NodeJS.Timeout | null = null;

            try {
                // --- Etapa 1: Lendo o arquivo ---
                setFilesToProcess(prev => prev.map(f => f.id === file.id ? { ...f, status: 'reading', progress: 10 } : f));
                const base64 = await fileToBase64(file.file);

                // --- Etapa 2: Enviando para a Lambda ---
                setFilesToProcess(prev => prev.map(f => f.id === file.id ? { ...f, status: 'uploading', progress: 30 } : f));

                // Simula o progresso enquanto espera a resposta da Lambda
                progressInterval = setInterval(() => {
                    setFilesToProcess(prev =>
                        prev.map(f => {
                            if (f.id === file.id && f.progress < 95) {
                                return { ...f, progress: f.progress + 5 };
                            }
                            return f;
                        })
                    );
                }, 1000); // a cada 1 segundo, aumenta 5%

                const result = await converter(base64);

                if (progressInterval) clearInterval(progressInterval);

                if (result.url) {
                    // --- Etapa 3: Concluído com sucesso ---
                    setFilesToProcess(prev => prev.map(f => f.id === file.id ? { ...f, status: 'completed', progress: 100, convertedUrl: result.url } : f));
                } else {
                    throw new Error(result.error || 'Erro desconhecido na conversão.');
                }

            } catch (error: any) {
                if (progressInterval) clearInterval(progressInterval);
                // --- Etapa 4: Erro no processo ---
                setFilesToProcess(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error', progress: 100, errorMessage: error.message } : f));
            }
        }

        setIsConverting(false);
    };

    return (
        <div className="bg-gray-50 min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
            <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg border border-gray-200">
                {/* Cabeçalho */}
                <div className="text-center p-6 border-b border-gray-200">
                    <h1 className="text-3xl font-bold text-gray-800">Converter Imagem para Preto e Branco</h1>
                    <p className="text-gray-500 mt-2">Envie uma ou mais imagens para converter em escala de cinza.</p>
                </div>

                {/* Área de Upload */}
                <div className="p-8">
                    <div
                        className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-red-500 hover:bg-red-50 transition-all"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-2 text-lg font-semibold text-gray-600">Clique ou arraste seus arquivos aqui</p>
                        <p className="text-sm text-gray-500">PNG, JPG, GIF, etc.</p>
                        <input
                            type="file"
                            ref={fileInputRef}
                            multiple
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                    </div>
                </div>

                {/* Lista de Arquivos e Botão de Conversão */}
                {filesToProcess.length > 0 && (
                    <div className="p-6">
                        <h2 className="text-lg font-semibold mb-4 text-gray-700">Arquivos para converter</h2>
                        <div className="space-y-4">
                            {filesToProcess.map(item => (
                                <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center space-x-4">
                                    <FileImage className="h-8 w-8 text-gray-500" />
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-sm font-medium text-gray-800 truncate w-40 sm:w-auto">{item.file.name}</span>
                                            <span className="text-xs text-gray-500">{(item.file.size / 1024).toFixed(1)} KB</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                                            <div
                                                className={`h-2.5 rounded-full transition-all duration-300 ${item.status === 'error' ? 'bg-red-500' : 'bg-green-500'}`}
                                                style={{ width: `${item.progress}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                    <div className="w-28 text-right">
                                        {item.status === 'completed' && <a href={item.convertedUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 font-semibold text-sm inline-flex items-center"><CheckCircle2 className="h-4 w-4 mr-1" /> Baixar</a>}
                                        {item.status === 'error' && <span className="text-red-600 font-semibold text-sm inline-flex items-center"><XCircle className="h-4 w-4 mr-1" /> Falhou</span>}
                                        {(item.status === 'pending' || item.status === 'uploading' || item.status === 'reading') && !isConverting && (
                                            <button onClick={() => removeFile(item.id)} disabled={isConverting} className="text-gray-400 hover:text-red-600 disabled:opacity-50">
                                                <Trash2 className="h-5 w-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={handleConvertAll}
                                disabled={isConverting || filesToProcess.every(f => f.status !== 'pending')}
                                className="bg-red-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isConverting ? 'Convertendo...' : `Converter ${filesToProcess.filter(f => f.status === 'pending').length} Arquivos`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
