/* eslint-disable @next/next/no-img-element */
'use client';
import { splitPdf } from '@/util/lambdaControll';
import { Check, Download, FileSymlink, Loader2, Plus, Scissors, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useMemo, useRef, useState } from 'react';

// --- Tipos ---
type PageInfo = { pageNumber: number; thumbnailUrl: string; };
type SplitMode = 'range' | 'extract';
type Range = { from: number; to: number; id: number };
// Novo estado para controlar o fluxo da UI
type UiState = 'initial' | 'loading' | 'editing' | 'processing' | 'completed';

// --- Componente Principal ---
export default function SplitPdfPage() {
    const [file, setFile] = useState<File | null>(null);
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
    const [pages, setPages] = useState<PageInfo[]>([]);
    const [uiState, setUiState] = useState<UiState>('initial');
    const [mode, setMode] = useState<SplitMode>('range');
    const [resultUrls, setResultUrls] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfjsLibRef = useRef<typeof import('pdfjs-dist') | null>(null);
    const [ranges, setRanges] = useState<Range[]>([{ from: 1, to: 1, id: Date.now() }]);
    const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
    const [mergeOutput, setMergeOutput] = useState(false);

    // --- Carregamento do PDF.js ---
    useEffect(() => {
        const loadPdfJs = async () => {
            const pdfjs = await import('pdfjs-dist');
            pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
            pdfjsLibRef.current = pdfjs;
        };
        loadPdfJs();
    }, []);

    // --- Função de Reset ---
    const handleReset = () => {
        setFile(null);
        setPdf(null);
        setPages([]);
        setMode('range');
        setResultUrls([]);
        setRanges([{ from: 1, to: 1, id: Date.now() }]);
        setSelectedPages(new Set());
        setMergeOutput(false);
        setUiState('initial'); // Volta ao estado inicial
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile || selectedFile.type !== 'application/pdf') return;

        handleReset(); // Reseta estados anteriores antes de carregar um novo arquivo
        setFile(selectedFile);
        setUiState('loading');

        if (!pdfjsLibRef.current) { alert("PDF.js ainda não carregou."); setUiState('initial'); return; }
        const fileReader = new FileReader();
        fileReader.onload = async (e) => {
            try {
                const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
                if (!pdfjsLibRef.current) {
                    alert("PDF.js ainda não carregou.");
                    setUiState('initial');
                    return;
                }
                const pdfDoc: PDFDocumentProxy = await pdfjsLibRef.current.getDocument(typedarray).promise;
                setPdf(pdfDoc);
                const numPages = pdfDoc.numPages;
                const pagePromises = Array.from({ length: numPages }, (_, i) =>
                    pdfDoc.getPage(i + 1).then(page => {
                        const viewport = page.getViewport({ scale: 0.4 });
                        const canvas = document.createElement('canvas');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        return page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise.then(() => ({
                            pageNumber: i + 1,
                            thumbnailUrl: canvas.toDataURL(),
                        }));
                    })
                );
                const pagesInfo = await Promise.all(pagePromises);
                setPages(pagesInfo);
                setRanges([{ from: 1, to: numPages, id: Date.now() }]);
                setUiState('editing'); // Transita para o estado de edição
            } catch (error) {
                console.error("Erro ao carregar PDF", error);
                handleReset();
            }
        };
        fileReader.readAsArrayBuffer(selectedFile);
    };

    // --- Lógica de Controlo ---
    const addRange = () => setRanges([...ranges, { from: 1, to: pdf?.numPages || 1, id: Date.now() }]);
    const removeRange = (id: number) => setRanges(ranges.filter(r => r.id !== id));
    const updateRange = (id: number, field: 'from' | 'to', value: number) => {
        const numPages = pdf?.numPages || 1;
        if (value < 1 || value > numPages) return;
        setRanges(ranges.map(r => r.id === id ? { ...r, [field]: value } : r));
    };
    const togglePageSelection = (pageNumber: number) => {
        setSelectedPages(prev => {
            const newSet = new Set(prev);
            if (newSet.has(pageNumber)) newSet.delete(pageNumber); else newSet.add(pageNumber);
            return newSet;
        });
    };

    const pagesToExtract = useMemo(() => {
        if (mode === 'range') {
            const allPages = new Set<number>();
            ranges.forEach(range => { for (let i = range.from; i <= range.to; i++) allPages.add(i); });
            return allPages;
        }
        return selectedPages;
    }, [mode, ranges, selectedPages]);

    const handleSplit = async () => {
        if (!file || !pdf || pagesToExtract.size === 0) return;
        setUiState('processing');
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                const base64 = (reader.result as string).split(',')[1];
                const options = mode === 'range' ? { merge: mergeOutput, ranges: ranges } : { merge: mergeOutput, pages: Array.from(selectedPages).sort((a, b) => a - b) };
                const result = await splitPdf(base64, file.name, mode, options);
                if (result.urls) {
                    setResultUrls(result.urls);
                    setUiState('completed'); // Transita para o estado de conclusão
                } else {
                    throw new Error(result.error || "A resposta da Lambda não continha URLs.");
                }
            } catch (error) {
                console.error("Falha ao dividir PDF", error);
                alert("Ocorreu um erro ao dividir o PDF.");
                setUiState('editing');
            }
        }
    };

    const PageThumbnail = ({ pageNumber }: { pageNumber: number }) => {
        const page = pages.find(p => p.pageNumber === pageNumber);
        if (!page) return <div className="w-full h-full bg-gray-200 animate-pulse rounded-md" />;
        return (
            <div className="relative w-full h-full">
                <img src={page.thumbnailUrl} alt={`Página ${pageNumber}`} className="w-full h-full object-contain shadow-md" />
                <span className="absolute bottom-1 right-1 bg-white/70 px-2 py-0.5 text-xs rounded-full">{pageNumber}</span>
            </div>
        );
    };

    // --- Renderização Principal baseada no Estado da UI ---
    const renderContent = () => {
        switch (uiState) {
            case 'initial':
                return (
                    <div className="flex flex-col items-center justify-center h-full">
                        <h1 className="text-gray-800 text-4xl font-bold">Dividir arquivo PDF</h1>
                        <p className="text-xl text-gray-500 mt-4">Separe uma ou várias páginas do seu PDF.</p>
                        <button onClick={() => fileInputRef.current?.click()} className="mt-8 bg-red-600 text-white font-bold px-8 py-4 rounded-lg hover:bg-red-700">Selecionar arquivo PDF</button>
                    </div>
                );
            case 'loading':
                return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin" size={48} /></div>;
            case 'completed':
                return (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <h1 className="text-4xl font-bold text-green-600">PDFs divididos com sucesso!</h1>
                        <p className="text-xl text-gray-500 mt-4">Os seus arquivos estão prontos para serem baixados.</p>
                        <div className="my-8 flex flex-wrap justify-center gap-4 max-h-64 overflow-y-auto">
                            {resultUrls.map((url, i) => (
                                <a
                                    key={i}
                                    href={url}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-green-600 text-white py-3 px-6 rounded-lg flex items-center justify-center text-md hover:bg-green-700"
                                    style={{ minWidth: 220 }}
                                >
                                    <Download size={18} className="mr-2" /> Baixar Arquivo {i + 1}
                                </a>
                            ))}
                        </div>
                        <button onClick={handleReset} className="bg-red-600 text-white font-bold px-8 py-4 rounded-lg hover:bg-red-700 flex items-center">
                            <FileSymlink size={20} className="mr-2" />
                            Dividir outro PDF
                        </button>
                    </div>
                );
            case 'editing':
            case 'processing':
                return (
                    <div className="flex h-full w-full">
                        {/* Visualizador de Páginas */}
                        <div className="flex-1 p-4 overflow-y-auto bg-gray-100 h-full">
                            {mode === 'extract' && (
                                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {pages.map(({ pageNumber }) => (
                                        <div key={pageNumber} onClick={() => togglePageSelection(pageNumber)} className={`relative border-2 rounded-lg aspect-[3/4] p-1 transition-all cursor-pointer ${selectedPages.has(pageNumber) ? 'border-red-500' : 'border-transparent'}`}>
                                            <PageThumbnail pageNumber={pageNumber} />
                                            {selectedPages.has(pageNumber) && (<div className="absolute top-2 left-2 bg-red-500 text-white rounded-full p-1"><Check size={16} /></div>)}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {mode === 'range' && (
                                <div className="space-y-6 h-full">
                                    {ranges.map((range, index) => (
                                        <div key={range.id} className="p-4 border-2 border-dashed rounded-lg">
                                            <h3 className="font-semibold mb-4 text-left">Intervalo {index + 1}</h3>
                                            <div className="flex items-center justify-center space-x-4">
                                                <div className="w-40 aspect-[3/4]"><PageThumbnail pageNumber={range.from} /></div>
                                                {range.from < range.to && <span className="text-2xl font-bold text-gray-400">...</span>}
                                                {range.from < range.to && <div className="w-40 aspect-[3/4]"><PageThumbnail pageNumber={range.to} /></div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Painel de Controle */}
                        <aside className="w-80 border-l bg-white flex flex-col p-4" style={{ minHeight: '80vh' }}>
                            <h2 className="text-4xl font-bold text-gray-800 text-center">Dividir PDF</h2>
                            <div className="flex justify-center my-4 border border-gray-200 rounded-lg p-1 text-gray-800">
                                <button onClick={() => setMode('range')} className={`flex-1 py-2 text-sm rounded-md ${mode === 'range' ? 'bg-gray-200 font-semibold' : ''}`}>Por Intervalo</button>
                                <button onClick={() => setMode('extract')} className={`flex-1 py-2 text-sm rounded-md ${mode === 'extract' ? 'bg-gray-200 font-semibold' : ''}`}>Extrair Páginas</button>
                            </div>
                            {mode === 'range' && (
                                <div className="space-y-4 overflow-y-auto text-gray-800">
                                    {ranges.map((range, index) => (
                                        <div key={range.id} className="p-3 border rounded-lg">
                                            <div className="flex justify-between items-center mb-2"><span className="font-semibold text-sm">Intervalo {index + 1}</span>{ranges.length > 1 && <button title="remover intervalo" onClick={() => removeRange(range.id)} className="text-gray-400 hover:text-red-500"><X size={18} /></button>}</div>
                                            <div className="flex items-center justify-between space-x-2"><input type="number" value={range.from} onChange={e => updateRange(range.id, 'from', +e.target.value)} className="w-full border p-1 rounded-md text-center" /><span>a</span><input type="number" value={range.to} onChange={e => updateRange(range.id, 'to', +e.target.value)} className="w-full border p-1 rounded-md text-center" /></div>
                                        </div>
                                    ))}
                                    <button onClick={addRange} className="w-full text-sm text-red-600 p-2 rounded-lg hover:bg-red-50 flex items-center justify-center"><Plus size={16} className="mr-1" /> Adicionar intervalo</button>
                                </div>
                            )}
                            {mode === 'extract' && <div className="text-center text-sm text-gray-600"><p>Selecione as páginas que deseja extrair.</p><p className="font-bold mt-2">{selectedPages.size} páginas selecionadas</p></div>}
                            <div className="mt-auto space-y-4">
                                <label className="flex items-center text-sm text-gray-800"><input type="checkbox" checked={mergeOutput} onChange={e => setMergeOutput(e.target.checked)} className="mr-2 h-4 w-4 text-gray-800" />Juntar tudo num único arquivo PDF</label>
                                <button onClick={handleSplit} disabled={uiState === 'processing' || pagesToExtract.size === 0} className="w-full bg-red-600 text-white font-bold py-3 rounded-lg flex items-center justify-center disabled:opacity-50">
                                    {uiState === 'processing' ? <Loader2 className="animate-spin" /> : <><Scissors size={18} className="mr-2" /> Dividir PDF</>}
                                </button>
                            </div>
                        </aside>
                    </div>
                );
        }
    }

    return (
        <div className="w-full bg-white flex flex-col items-center justify-center min-h-[80vh]">
            <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={handleFileChange} />
            {renderContent()}
        </div>
    );
}
