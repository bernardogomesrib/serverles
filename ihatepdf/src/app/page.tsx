'use client';
import Image from "next/image";
import Link from "next/link";

const tools = [
  { link:"/pandb", name: 'Colorido para P&B', icon: '/icons/color-to-bw.png', description: 'Transforme as cores de uma imagem em tons de cinza.' },
  { link: "/juntar", name: 'Juntar PDF', icon: '/icons/merge-pdf.png', description: 'Combine PDFs na ordem que você quiser.' },
  { link: "/dividir", name: 'Dividir PDF', icon: '/icons/split-pdf.png', description: 'Separe uma ou várias páginas de seu PDF.' },
  { link: "/comprimir", name: 'Comprimir PDF', icon: '/icons/compress-pdf.png', description: 'Reduza o tamanho do arquivo enquanto otimiza para máxima qualidade.' },
  { link: "/toword", name: 'PDF para Word', icon: '/icons/pdf-to-word.png', description: 'Converta seus PDFs para documentos WORD editáveis.' },
  { link: "/topowerpoint", name: 'PDF para PowerPoint', icon: 'globe.svg', description: 'Converta PDFs para apresentações PPTX editáveis.' },
  { link: "/toexcel", name: 'PDF para Excel', icon: 'globe.svg', description: 'Extraia dados diretamente de PDFs para planilhas de EXCEL.' },
  { link: "/topdf", name: 'Word para PDF', icon: 'globe.svg', description: 'Converta documentos WORD para PDF.' },
  { link: "/ppttopdf", name: 'PowerPoint para PDF', icon: 'globe.svg', description: 'Converta apresentações PPTX para PDF.' },
];
export default function Home() {
  return (
    <div className="bg-gray-100 min-h-screen">
      {/* BARRA DE NAVEGAÇÃO SUPERIOR */}
      {/* Conteúdo Principal */}
      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12 pt-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800">
            Todas as ferramentas que você precisa para trabalhar com PDFs em um só lugar
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mt-4">
            Todas as ferramentas são 100% GRATUITAS e fáceis de usar. Junte, divida, comprima, converta, gire, desbloqueie e coloque marca d&#39;água em PDFs com apenas alguns cliques.
          </p>
        </div>

        {/* Grade de Ferramentas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {tools.map((tool) => (
            <Link href={tool.link}
              key={tool.name}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col items-center text-center cursor-pointer"
            >
              <div className="relative h-20 w-20 mb-4">
                <Image
                  src={tool.icon}
                  alt={`${tool.name} icon`}
                  fill
                  style={{ objectFit: "contain" }}
                />
              </div>
              <h3 className="text-md font-semibold text-gray-800">{tool.name}</h3>
              <p className="text-xs text-gray-500 mt-1 hidden sm:block">{tool.description}</p>
            </Link>
          ))}
        </div>
      </main>

     
    </div>
  );
}
