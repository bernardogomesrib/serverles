/* eslint-disable @next/next/no-img-element */
'use client';

import { juntarPdfs } from '@/util/lambdaControll';
import { Download, Loader2, Plus, RotateCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
// Importa apenas os TIPOS estaticamente, o que é seguro no servidor.
import type { PDFDocumentProxy } from 'pdfjs-dist';

// --- Tipos de Estado ---
type PdfFile = {
    id: string;
    file: File;
    rotation: 0 | 90 | 180 | 270;
    thumbnailUrl: string | null;
};
type UiState = 'initial' | 'filesSelected' | 'merging' | 'completed';

// --- Componente da Página ---
export default function MergePdfPage() {
    const [files, setFiles] = useState<PdfFile[]>([]);
    const [uiState, setUiState] = useState<UiState>('initial');
    const [mergedUrl, setMergedUrl] = useState<string | null>(null);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfjsLibRef = useRef<typeof import('pdfjs-dist') | null>(null); // Ref para guardar a biblioteca carregada dinamicamente
    const handleReset = () => {
        setFiles([]);
        setUiState('initial');
        setMergedUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }
    // --- Carregamento dinâmico da biblioteca PDF.js ---
    useEffect(() => {
        const loadPdfJs = async () => {
            try {
                const pdfjs = await import('pdfjs-dist');
                // A configuração do worker agora é feita aqui, após a importação.
                pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
                pdfjsLibRef.current = pdfjs;
            } catch (error) {
                console.error("Falha ao carregar pdf.js:", error);
            }
        };
        loadPdfJs();
    }, []); // Executa apenas uma vez, quando o componente é montado.

    // --- Função para gerar miniaturas ---
    const generateThumbnail = useCallback(async (file: File): Promise<string> => {
        if (!pdfjsLibRef.current) {
            throw new Error("pdf.js ainda não foi carregado.");
        }
        const pdfjs = pdfjsLibRef.current;

        const fileReader = new FileReader();
        return new Promise((resolve, reject) => {
            fileReader.onload = async (e) => {
                try {
                    const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
                    const pdf: PDFDocumentProxy = await pdfjs.getDocument(typedarray).promise;
                    const page = await pdf.getPage(1);

                    const viewport = page.getViewport({ scale: 0.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    if (context) {
                        await page.render({ canvasContext: context, viewport }).promise;
                        resolve(canvas.toDataURL());
                    } else {
                        reject(new Error('Não foi possível obter o contexto do canvas.'));
                    }
                } catch (error) {
                    console.error("Erro ao gerar a miniatura:", error);
                    reject(error);
                }
            };
            fileReader.onerror = reject;
            fileReader.readAsArrayBuffer(file);
        });
    }, []); // useCallback para memoizar a função

    // --- Efeito para gerar miniaturas quando novos arquivos são adicionados ---
    useEffect(() => {
        // Só executa se a biblioteca pdf.js já tiver sido carregada.
        if (!pdfjsLibRef.current) return;

        files.forEach(f => {
            if (!f.thumbnailUrl) {
                generateThumbnail(f.file)
                    .then(thumbnailUrl => {
                        setFiles(prevFiles => prevFiles.map(prevFile =>
                            prevFile.id === f.id ? { ...prevFile, thumbnailUrl } : prevFile
                        ));
                    })
                    .catch(() => {
                        // Pode tratar o erro aqui se a geração da miniatura falhar.
                    });
            }
        });
    }, [files, generateThumbnail]);

    // --- Restante das funções (sem alterações) ---
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (!selectedFiles) return;
        const existingFileIds = new Set(files.map(f => `${f.file.name}-${f.file.lastModified}`));
        const newFiles: PdfFile[] = Array.from(selectedFiles)
            .filter(file => file.type === 'application/pdf' && !existingFileIds.has(`${file.name}-${file.lastModified}`))
            .map(file => ({ id: `${file.name}-${file.lastModified}`, file, rotation: 0, thumbnailUrl: null }));
        if (newFiles.length > 0) {
            setFiles(prev => [...prev, ...newFiles]);
            setUiState('filesSelected');
        }
        event.target.value = '';
    };
    const removeFile = (id: string) => {
        const newFiles = files.filter(f => f.id !== id);
        setFiles(newFiles);
        if (newFiles.length === 0) setUiState('initial');
    };
    const rotateFile = (id: string) => {
        setFiles(prev => prev.map(f =>
            f.id === id ? { ...f, rotation: (f.rotation + 90) % 360 as PdfFile['rotation'] } : f
        ));
    };
    const handleDragStart = (index: number) => setDraggedIndex(index);
    const handleDragEnter = (index: number) => {
        if (draggedIndex === null || draggedIndex === index) return;
        const newList = [...files];
        const [draggedItem] = newList.splice(draggedIndex, 1);
        newList.splice(index, 0, draggedItem);
        setFiles(newList);
        setDraggedIndex(index);
    };
    const handleDragEnd = () => setDraggedIndex(null);
    const handleMerge = async () => {
        setUiState('merging');
        try {
            const filesPayload = await Promise.all(
                files.map(f => new Promise<{ pdf: string, rotation: number }>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ pdf: (reader.result as string).split(',')[1], rotation: f.rotation });
                    reader.onerror = reject;
                    reader.readAsDataURL(f.file);
                }))
            );
            const result = await juntarPdfs(filesPayload);
            if (result.url) {
                setMergedUrl(result.url);
                setUiState('completed');
            } else {
                throw new Error(result.error || "Falha ao juntar PDFs.");
            }
        } catch (error) {
            console.error(error);
            alert("Ocorreu um erro. Por favor, tente novamente.");
            setUiState('filesSelected');
        }
    };

    // --- Renderização (sem alterações no JSX) ---
    return (
        <div className="w-full bg-white flex flex-col items-center justify-center p-4 sm:p-10 text-center min-h-[80vh]">
            <input type="file" ref={fileInputRef} multiple accept="application/pdf" className="hidden" onChange={handleFileSelect} />
            {uiState === 'initial' && (
                <div>
                    <h1 className="text-4xl font-bold text-gray-800">Juntar arquivos PDF</h1>
                    <p className="text-xl text-gray-500 mt-4 max-w-2xl">Combine múltiplos PDFs na ordem que quiser com a ferramenta de junção de PDFs mais fácil de usar.</p>
                    <button onClick={() => fileInputRef.current?.click()} className="mt-8 bg-red-600 text-white font-bold text-lg px-8 py-4 rounded-lg hover:bg-red-700 transition-transform hover:scale-105">
                        Selecionar arquivos PDF
                    </button>
                </div>
            )}
            {(uiState === 'filesSelected' || uiState === 'merging' || uiState === 'completed') && (
                <div className="w-full h-full flex flex-col">
                    <div className="flex-grow w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 p-4 overflow-y-auto" onDragEnd={handleDragEnd}>
                        {files.map((pdf, index) => (
                            <div key={pdf.id} draggable onDragStart={() => handleDragStart(index)} onDragEnter={() => handleDragEnter(index)}
                                className={`group relative border-2 bg-white p-1 rounded-lg flex flex-col items-center justify-between aspect-[3/4] transition-all cursor-grab shadow-md hover:shadow-xl ${draggedIndex === index ? 'border-red-500 scale-105 shadow-2xl' : 'border-gray-200'}`}>
                                <div className="absolute top-1 right-1 z-10 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button title="Girar PDF" onClick={() => rotateFile(pdf.id)} className="bg-white/80 backdrop-blur-sm p-2 rounded-full text-gray-700 hover:bg-gray-200"><RotateCw size={18} /></button>
                                    <button title="Remover PDF" onClick={() => removeFile(pdf.id)} className="bg-white/80 backdrop-blur-sm p-2 rounded-full text-gray-700 hover:bg-gray-200"><Trash2 size={18} /></button>
                                </div>
                                <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-md bg-gray-100">
                                    {pdf.thumbnailUrl ? (
                                        <img src={pdf.thumbnailUrl} alt={`Miniatura de ${pdf.file.name}`} className="w-full h-full object-contain" style={{ transform: `rotate(${pdf.rotation}deg)` }} />
                                    ) : (
                                        <Loader2 className="animate-spin text-gray-400" size={32} />
                                    )}
                                </div>
                                <p className="mt-2 text-xs font-semibold text-gray-700 w-full text-center truncate px-1" title={pdf.file.name}>{pdf.file.name}</p>
                            </div>
                        ))}
                        {uiState === 'filesSelected' && (
                            <button title="Adicionar pdf" onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 text-gray-500 rounded-lg flex flex-col items-center justify-center aspect-[3/4] hover:border-red-500 hover:bg-red-50 transition-all">
                                <Plus size={40} />
                            </button>
                        )}
                    </div>
                    <div className="flex-shrink-0 w-full bg-white p-4 border-t sticky bottom-0">
                        <div className="max-w-7xl mx-auto flex justify-end">
                            {uiState === 'filesSelected' && (<button onClick={handleMerge} disabled={files.length < 2} className="bg-red-600 text-white font-bold text-lg px-8 py-4 rounded-lg hover:bg-red-700 disabled:opacity-50">Juntar PDF</button>)}
                            {uiState === 'merging' && (<div className="flex items-center justify-center bg-gray-700 text-white font-bold text-lg px-8 py-4 rounded-lg"><Loader2 className="animate-spin mr-3" size={24} />A juntar PDFs...</div>)}
                            {uiState === 'completed' && mergedUrl && (<div>
                                <button className='bg-red-600 text-white font-bold text-lg px-8 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50' onClick={handleReset}>Juntar outros</button>
                                <a href={mergedUrl}   download
                                target="_blank"
                                rel="noopener noreferrer" className="bg-green-600 text-white font-bold text-lg px-8 py-4 rounded-lg hover:bg-green-700"><Download className="inline-block mr-2" /> Baixar PDF</a>
                            </div>
                                )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
