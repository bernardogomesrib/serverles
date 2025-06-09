'use client';

import { converterImagem } from "@/util/lambdaControll";
import { useState, useRef } from "react";
import { UploadCloud, FileImage, CheckCircle2, XCircle, Trash2, AlertTriangle } from "lucide-react";

// Define a estrutura para cada arquivo que será processado
type ProcessFile = {
    id: string;
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
    const [showClearModal, setShowClearModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            };
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    };

    // Lida com a seleção de arquivos, agora com verificação de duplicatas
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (selectedFiles) {
            const existingFileIds = new Set(filesToProcess.map(f => f.id));
            const newFiles: ProcessFile[] = Array.from(selectedFiles)
                .map(file => ({
                    id: `${file.name}-${file.lastModified}`,
                    file: file,
                    status: 'pending' as const,
                    progress: 0,
                }))
                .filter(file => !existingFileIds.has(file.id)); // Filtra arquivos que já existem

            setFilesToProcess(prevFiles => [...prevFiles, ...newFiles]);
            // Limpa o valor do input para permitir selecionar o mesmo arquivo novamente após a remoção
            event.target.value = '';
        }
    };

    const removeFile = (id: string) => {
        setFilesToProcess(prev => prev.filter(f => f.id !== id));
    }

    // Limpa todos os arquivos da lista
    const handleClearList = () => {
        setFilesToProcess([]);
        setShowClearModal(false);
    }

    const handleConvertAll = async () => {
        setIsConverting(true);
        for (const file of filesToProcess) {
            if (file.status !== 'pending') continue;
            let progressInterval: NodeJS.Timeout | null = null;
            try {
                setFilesToProcess(prev => prev.map(f => f.id === file.id ? { ...f, status: 'reading', progress: 10 } : f));
                const base64 = await fileToBase64(file.file);
                setFilesToProcess(prev => prev.map(f => f.id === file.id ? { ...f, status: 'uploading', progress: 30 } : f));
                progressInterval = setInterval(() => {
                    setFilesToProcess(prev =>
                        prev.map(f => f.id === file.id && f.progress < 95 ? { ...f, progress: f.progress + 5 } : f)
                    );
                }, 800);
                const result = await converterImagem(base64);
                if (progressInterval) clearInterval(progressInterval);
                if (result.url) {
                    setFilesToProcess(prev => prev.map(f => f.id === file.id ? { ...f, status: 'completed', progress: 100, convertedUrl: result.url } : f));
                } else {
                    throw new Error(result.error || 'Erro desconhecido na conversão.');
                }
            } catch (error: unknown) {
                if (progressInterval) clearInterval(progressInterval);
                const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido na conversão.';
                setFilesToProcess(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error', progress: 100, errorMessage } : f));
            }
        }
        setIsConverting(false);
    };

    // Variável para determinar se o processo de conversão foi concluído para todos os arquivos
    const allDone = filesToProcess.length > 0 && filesToProcess.every(f => f.status === 'completed' || f.status === 'error');

    return (
        <>
            <div className="bg-gray-50 min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg border border-gray-200">
                    <div className="text-center p-6 border-b border-gray-200">
                        <h1 className="text-3xl font-bold text-gray-800">Converter Imagem para Preto e Branco</h1>
                        <p className="text-gray-500 mt-2">Envie uma ou mais imagens para converter em escala de cinza.</p>
                    </div>

                    <div className="p-8">
                        <div
                            className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-red-500 hover:bg-red-50 transition-all"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-2 text-lg font-semibold text-gray-600">Clique ou arraste seus arquivos aqui</p>
                            <p className="text-sm text-gray-500">Imagens duplicadas serão ignoradas</p>
                            <input type="file" ref={fileInputRef} multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
                        </div>
                    </div>

                    {filesToProcess.length > 0 && (
                        <div className="p-6">
                            <h2 className="text-lg font-semibold mb-4 text-gray-700">Arquivos para converter</h2>
                            <div className="space-y-4">
                                {filesToProcess.map(item => (
                                    <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center space-x-4">
                                        <FileImage className="h-8 w-8 text-gray-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-gray-800 truncate">{item.file.name}</span>
                                                <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{(item.file.size / 1024).toFixed(1)} KB</span>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                                                <div
                                                    className={`h-2.5 rounded-full transition-all duration-300 ${item.status === 'error' ? 'bg-red-500' : 'bg-green-500'}`}
                                                    style={{ width: `${item.progress}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        {/* Lógica de botões de ação por item */}
                                        <div className="flex items-center space-x-3 w-auto">
                                            {item.status === 'completed' && (
                                                <>
                                                    <a href={item.convertedUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 font-semibold text-sm inline-flex items-center hover:text-green-700">
                                                        <CheckCircle2 className="h-4 w-4 mr-1" /> Baixar
                                                    </a>
                                                    <button onClick={() => removeFile(item.id)} className="text-gray-400 hover:text-red-600">
                                                        <Trash2 className="h-5 w-5" />
                                                    </button>
                                                </>
                                            )}
                                            {item.status === 'error' && (
                                                <button onClick={() => removeFile(item.id)} className="text-red-500 font-semibold text-sm inline-flex items-center hover:text-red-700">
                                                    <XCircle className="h-4 w-4 mr-1" /> Remover
                                                </button>
                                            )}
                                            {item.status === 'pending' && !isConverting && (
                                                <button onClick={() => removeFile(item.id)} className="text-gray-400 hover:text-red-600">
                                                    <Trash2 className="h-5 w-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Lógica do botão principal (Converter ou Limpar) */}
                            <div className="mt-8 flex justify-end">
                                {allDone ? (
                                    <button
                                        onClick={() => setShowClearModal(true)}
                                        className="bg-gray-700 text-white font-semibold px-8 py-3 rounded-lg hover:bg-gray-800 transition-colors"
                                    >
                                        Limpar Lista
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleConvertAll}
                                        disabled={isConverting || filesToProcess.every(f => f.status !== 'pending')}
                                        className="bg-red-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isConverting ? 'Convertendo...' : `Converter ${filesToProcess.filter(f => f.status === 'pending').length} Arquivos`}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Confirmação */}
            {showClearModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                        <div className="flex items-center">
                            <div className="bg-yellow-100 p-3 rounded-full">
                                <AlertTriangle className="h-6 w-6 text-yellow-500" />
                            </div>
                            <div className="ml-4">
                                <h3 className="text-lg font-semibold text-gray-800">Limpar lista?</h3>
                                <p className="text-sm text-gray-600 mt-1">Todos os arquivos serão removidos da tela. Esta ação não pode ser desfeita.</p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end space-x-3">
                            <button onClick={() => setShowClearModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancelar</button>
                            <button onClick={handleClearList} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
