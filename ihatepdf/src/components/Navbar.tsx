import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (<header className="bg-white shadow-md sticky top-0 z-10">
    <nav className="container mx-auto px-4 py-3 flex justify-between items-center">
      {/* Logo e Nome do Site */}
      <Link href="/" className="flex items-center space-x-2">
        <div className="relative h-10 w-10">
          <Image
            src="/logo-ihatepdf.png" // Use o novo ícone aqui
            alt="iHatePDF Logo"
            fill
            style={{ objectFit: "contain" }}
          />
        </div>
        <span className="text-2xl font-bold text-gray-800">
          i<span className="text-red-600">Hate</span>PDF
        </span>
      </Link>

      {/* Links de Navegação */}
      <div className="hidden md:flex items-center space-x-4">
        <Link href="/juntar" className="text-gray-600 hover:text-red-600">Juntar PDF</Link>
        <Link href="/dividir" className="text-gray-600 hover:text-red-600">Dividir PDF</Link>
        <Link href="/comprimir" className="text-gray-600 hover:text-red-600">Comprimir PDF</Link>
        <Link href="/" className="text-gray-600 font-semibold text-red-600 hover:text-red-700">Todas as ferramentas</Link>
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center space-x-2">
        <button className="text-gray-700 hover:text-red-600 px-4 py-2 rounded-md">
          Login
        </button>
        <button className="bg-red-600 text-white font-semibold px-4 py-2 rounded-full hover:bg-red-700 transition-colors">
          Registrar-se
        </button>
      </div>
    </nav>
  </header>);
}