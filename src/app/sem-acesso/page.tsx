import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";

export default function NoAccessPage() {
  return <div className="standalone-page"><Brand /><main className="status-panel panel"><span className="status-icon"><LockKeyhole size={35} /></span><span className="eyebrow">CADA ESPAÇO, SEU ACESSO</span><h1>Esta área precisa de outro perfil.</h1><p>A sua conta não tem autorização para acessar este espaço. Se o vínculo estiver incorreto, fale com a coordenação da escola.</p><div className="empty-actions"><Link className="button button-primary" href="/login">Ir para o acesso da conta</Link><Link className="button button-outline" href="/"><ArrowLeft size={16} />Página inicial</Link></div></main></div>;
}
