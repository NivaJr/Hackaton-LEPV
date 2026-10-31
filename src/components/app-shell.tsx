import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronRight, CircleHelp, Compass, Flag, GraduationCap, LayoutDashboard, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";
import type { Role } from "@/contracts";
import { ROLE_LABELS } from "@/lib/auth/navigation";
import { Brand } from "./brand";
import { signOut } from "@/app/login/actions";

export type DashboardMode = "demo" | "real";

export function AppShell({ role, fullName, mode, children }: { role: Role; fullName: string; mode: DashboardMode; children: ReactNode }) {
  const isStudent = role === "aluno";
  const home = mode === "demo" ? `/demo/${role}` : `/${role}`;
  const items = isStudent ? [
    { label: "Visão geral", icon: LayoutDashboard, href: home },
    { label: "Minhas atividades", icon: BookOpen, href: `${home}#atividade` },
    { label: "Meu progresso", icon: Compass, href: `${home}#progresso` },
    { label: "Ranking da turma", icon: Trophy, href: `${home}#ranking-turma` },
    { label: "Meu perfil", icon: GraduationCap, href: `${home}#perfil` },
  ] : [
    { label: "Visão geral", icon: LayoutDashboard, href: home },
    { label: role === "responsavel" ? "Atividades do aluno" : "Atividades", icon: BookOpen, href: "/tarefas" },
    { label: "Acompanhamento", icon: Compass, href: "/tarefas" },
    { label: role === "coordenador" ? "Turmas e pessoas" : "Minha turma", icon: Users, href: "/tarefas" },
    { label: "Meu espaço", icon: GraduationCap, href: "/tarefas" },
  ];
  const initials = fullName.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("");
  return <div className="app-shell">
    <a href="#conteudo" className="skip-link">Ir para o conteúdo</a>
    <aside className="sidebar">
      <Brand light />
      <div className="workspace-label"><span className="workspace-icon"><GraduationCap size={18} /></span><div><strong>{mode === "demo" ? "Escola Horizonte" : "Seu espaço de ensino"}</strong><small>{mode === "demo" ? "Instituição fictícia" : "Área autenticada"}</small></div><ChevronRight size={14} /></div>
      <span className="nav-caption">SEU ESPAÇO</span>
      <nav className="side-nav" aria-label="Navegação principal">{items.map((item, index) => <Link key={item.label} href={item.href} className={`side-link${index === 0 ? " active" : ""}`} aria-current={index === 0 ? "page" : undefined}><item.icon size={20} /><span>{item.label}</span>{index === 1 && <span className="nav-dot" />}</Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><span className="sidebar-note-icon"><Sparkles size={23} /></span><strong>Aprender abre caminhos.</strong><p>Um passo de cada vez, uma nova possibilidade.</p><span className="note-line" /></div>
        <Link href="/tarefas" className="side-link muted"><CircleHelp size={19} />Sobre esta base<ArrowUpRight size={15} /></Link>
        <Link href="/" className="side-link muted"><ArrowLeft size={18} />{mode === "demo" ? "Trocar demonstração" : "Página inicial"}</Link>
        {mode === "real" && <form action={signOut}><button type="submit" className="side-link muted" style={{ background: "transparent", border: 0, cursor: "pointer", font: "inherit", width: "100%" }}><ArrowLeft size={18} />Sair da conta</button></form>}
      </div>
    </aside>
    <div className="workspace-main">
      <header className="topbar"><div className="breadcrumb"><span>Meu espaço</span><ChevronRight size={14} /><strong>Visão geral</strong></div><div className="topbar-right"><span className={`mode-pill ${mode === "demo" ? "demo-pill" : "real-pill"}`}>{mode === "demo" ? <Flag size={13} /> : <ShieldCheck size={13} />}{mode === "demo" ? "Demonstração" : "Acesso autenticado"}</span><span className="topbar-divider" /><span className="user-avatar">{initials || "LP"}</span><div className="user-summary"><strong>{fullName}</strong><small>{ROLE_LABELS[role]}</small></div></div></header>
      <main id="conteudo" className="dashboard-content">{mode === "demo" && <div className="demo-notice"><span><span className="live-dot" />Você está explorando uma demonstração. Dados fictícios, sem persistência e sem IA integrada.</span><Link href="/login">Acessar conta real<ArrowUpRight size={14} /></Link></div>}{children}<footer className="workspace-footer"><span>EAI · Educational Artificial Intelligence</span><span>{mode === "demo" ? "Ambiente de demonstração" : "Plataforma educacional"}</span></footer></main>
    </div>
  </div>;
}
