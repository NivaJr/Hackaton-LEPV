import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return <div className="standalone-page"><Brand /><main className="status-panel panel"><span className="status-icon"><Compass size={37} /></span><span className="eyebrow">VAMOS ENCONTRAR O CAMINHO</span><h1>Essa página ainda não está por aqui.</h1><p>Volte ao início para explorar os espaços disponíveis da plataforma.</p><Link className="button button-primary" href="/"><ArrowLeft size={16} />Voltar ao início</Link></main></div>;
}
