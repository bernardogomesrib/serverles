/* eslint-disable @next/next/no-img-element */
'use client';
import { protectPDFs } from "@/util/lambdaControll";
import { Download, FileSymlink, Loader2, Plus, RotateCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
// --- Tipos ---
type PdfFile = {
    id: string;
    file: File;
    rotation: 0 | 90 | 180 | 270;
    thumbnailUrl: string | null; // Adicionado para a miniatura
};

type UiState = 'initial' | 'filesSelected' | 'compressing' | 'completed';
type CompressionResult = { zipUrl: string; totalOriginalSize: number; totalCompressedSize: number; };

// --- Componente ---
export default function ProtectPdfPdfPage() {
    const [files, setFiles] = useState<PdfFile[]>([]);
    const [uiState, setUiState] = useState<UiState>('initial');
    const [senha, setSenha] = useState<string>('');
    const [senhaConfirmada,setSenhaConfirmada] = useState<string>('');
    const [result, setResult] = useState<CompressionResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfjsLibRef = useRef<typeof import('pdfjs-dist') | null>(null);

    // --- LÓGICA DE MINIATURAS ADICIONADA AQUI ---

    // 1. Carregamento dinâmico do PDF.js (Apenas no Navegador)
    useEffect(() => {
        const loadPdfJs = async () => {
            try {
                const pdfjs = await import('pdfjs-dist');
                pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
                pdfjsLibRef.current = pdfjs;
            } catch (error) { console.error("Falha ao carregar pdf.js:", error); }
        };
        loadPdfJs();
    }, []);

    // 2. Função para gerar a imagem da miniatura
    const generateThumbnail = useCallback(async (file: File): Promise<string> => {
        if (!pdfjsLibRef.current) throw new Error("pdf.js não carregado.");
        const fileReader = new FileReader();
        return new Promise((resolve, reject) => {
            fileReader.onload = async (e) => {
                try {
                    if (!pdfjsLibRef.current) throw new Error("pdf.js não carregado.");
                    const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
                    const pdf = await pdfjsLibRef.current.getDocument(typedarray).promise;
                    const page = await pdf.getPage(1);
                    const viewport = page.getViewport({ scale: 0.5 });
                    const canvas = document.createElement('canvas');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    const context = canvas.getContext('2d');
                    if (!context) throw new Error("Contexto do canvas não encontrado.");
                    await page.render({ canvasContext: context, viewport }).promise;
                    resolve(canvas.toDataURL());
                } catch (error) { reject(error); }
            };
            fileReader.readAsArrayBuffer(file);
        });
    }, []);

    // 3. Efeito que gera as miniaturas quando novos arquivos são adicionados
    useEffect(() => {
        if (!pdfjsLibRef.current) return;
        files.forEach(f => {
            if (!f.thumbnailUrl) { // Gera apenas se ainda não tiver uma miniatura
                generateThumbnail(f.file).then(thumbnailUrl => {
                    setFiles(prev => prev.map(pf => pf.id === f.id ? { ...pf, thumbnailUrl } : pf));
                });
            }
        });
    }, [files, generateThumbnail]);

    // --- Resto das Funções ---
    
    const handleReset = () => { setFiles([]); setUiState('initial'); setResult(null); setSenha(''); setSenhaConfirmada(''); if (fileInputRef.current) fileInputRef.current.value = ''; };
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files; if (!selectedFiles) return;
        const existingFileIds = new Set(files.map(f => `${f.file.name}-${f.file.lastModified}`));
        const newFiles = Array.from(selectedFiles)
            .filter(file => file.type === 'application/pdf' && !existingFileIds.has(`${file.name}-${file.lastModified}`))
            .map(file => ({ id: `${file.name}-${file.lastModified}`, file, rotation: 0 as const, thumbnailUrl: null })); // Inicia com thumbnailUrl nulo
        if (newFiles.length > 0) { setFiles(prev => [...prev, ...newFiles]); setUiState('filesSelected'); }
    };
    const removeFile = (id: string) => { const newFiles = files.filter(f => f.id !== id); setFiles(newFiles); if (newFiles.length === 0) handleReset(); };
    const rotateFile = (id: string) => { setFiles(prev => prev.map(f => f.id === id ? { ...f, rotation: (f.rotation + 90) % 360 as PdfFile['rotation'] } : f)); };
    const handleCompress = async () => {
        setUiState('compressing');
        try {
            const filesPayload = await Promise.all(
                files.map(f => new Promise<{ pdf: string, originalName: string, originalSize: number, rotation: number }>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ pdf: (reader.result as string).split(',')[1], originalName: f.file.name, originalSize: f.file.size, rotation: f.rotation });
                    reader.onerror = reject;
                    reader.readAsDataURL(f.file);
                }))
            );
            const res = await protectPDFs(filesPayload, senha);
            console.log("Resposta da compressão:", res);
            if (res.zipUrl) {
                setResult({ zipUrl: res.zipUrl, totalOriginalSize: res.totalOriginalSize!, totalCompressedSize: res.totalCompressedSize! }); setUiState('completed');
            }
            else { throw new Error(res.error || "A resposta da Lambda foi inválida."); }
        } catch (error) { console.error(error); alert("Falha ao comprimir os PDFs."); setUiState('filesSelected'); }
    };

    // --- Renderização ---
    const renderContent = () => {
        switch (uiState) {
            case 'initial': return (<div className="text-center"><h1 className="text-4xl font-bold text-gray-800">Proteger arquivo PDF</h1><p className="text-xl text-gray-500 mt-4">Proteja o seu arquivo pdf com uma senha!</p><button onClick={() => fileInputRef.current?.click()} className="mt-8 bg-red-600 text-white font-bold px-8 py-4 rounded-lg hover:bg-red-700">Selecionar Arquivos PDF</button></div>);
            case 'filesSelected': return (
                <div className="flex w-full h-full">
                    <div className="flex-1 p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 overflow-y-auto">
                        {files.map(f => (
                            <div key={f.id} className="group relative border-2 bg-white p-1 rounded-lg flex flex-col items-center justify-between aspect-[3/4] transition-all shadow-md hover:shadow-xl border-gray-200">
                                <div className="absolute top-1 right-1 z-10 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button title="Rodar PDF" onClick={() => rotateFile(f.id)} className="bg-white/80 backdrop-blur-sm p-2 rounded-full text-gray-700 hover:bg-gray-200"><RotateCw size={18} /></button>
                                    <button title="excluir PDF" onClick={() => removeFile(f.id)} className="bg-white/80 backdrop-blur-sm p-2 rounded-full text-gray-700 hover:bg-gray-200"><Trash2 size={18} /></button>
                                </div>
                                <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-md bg-gray-100">
                                    {f.thumbnailUrl ? (
                                        <img src={f.thumbnailUrl} alt={f.file.name} className="w-full h-full object-contain" style={{ transform: `rotate(${f.rotation}deg)` }} />
                                    ) : (
                                        <Loader2 className="animate-spin text-gray-400" />
                                    )}
                                </div>
                                <p className="mt-2 text-xs font-semibold text-gray-700 w-full text-center truncate px-1" title={f.file.name}>{f.file.name}</p>
                            </div>
                        ))}
                        <button title="adicionar pdf" onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 text-gray-500 rounded-lg flex flex-col items-center justify-center aspect-[3/4] hover:border-red-500 hover:bg-red-50 transition-all">
                            <Plus size={40} />
                        </button>
                    </div>
                    <aside className="w-80 border-l p-4 flex flex-col text-gray-800"  style={{ minHeight: '80vh' }}>
                        <h3 className="text-lg font-bold text-center">Coloque a sua senha!</h3>
                        <div className="my-4 space-y-2">
                            <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} className="w-full mb-2 border border-red-800 p-2 rounded-[5px]" />
                            <input type="password" placeholder="Confirmar Senha" value={senhaConfirmada} onChange={(e) => setSenhaConfirmada(e.target.value)} className="w-full mb-2 border border-red-800 p-2 rounded-[5px]" />
                            {senha && senhaConfirmada && senha !== senhaConfirmada && (
                                <p className="text-red-600 text-sm">As senhas não coincidem!</p>
                            )}
                            {senha && senhaConfirmada && senha === senhaConfirmada && (
                                <p className="text-green-600 text-sm">As senhas coincidem!</p>
                            )}
                        </div>
                        <button onClick={handleCompress} disabled={senha != "" &&senha && senhaConfirmada && senha === senhaConfirmada?false :true } className="w-full mt-auto bg-red-600 text-white font-bold py-3 rounded-lg disabled:opacity-50">Proteger PDFs</button>
                    </aside>
                </div>
            );
            case 'compressing': return <div className="flex justify-center items-center h-full text-gray-800"><Loader2 className="animate-spin" size={48} /><p className="ml-4 text-lg">A proteger...</p></div>;
            case 'completed':
                if (!result) return null;
                const { zipUrl } = result;

                return (
                    <div className="text-center text-gray-800">
                        <h1 className="text-4xl font-bold">PDFs protegidos!</h1>
                        <a href={zipUrl} download target="_blank" rel="noopener noreferrer" className="bg-red-600 text-white font-bold px-8 py-4 rounded-lg inline-block mb-4 hover:bg-red-700"><Download className="inline-block mr-2" />Baixar PDFs Protegidos</a>
                        <button onClick={handleReset} className="block mx-auto text-red-600 font-semibold"><FileSymlink className="inline-block mr-1" size={16} />proteger mais PDFs</button>
                    </div>
                );
        }
    }
    return (<div className="w-full bg-white flex flex-col items-center justify-center min-h-[80vh] p-4"><input type="file" ref={fileInputRef} multiple accept="application/pdf" className="hidden" onChange={handleFileChange} />{renderContent()}</div>);
}

