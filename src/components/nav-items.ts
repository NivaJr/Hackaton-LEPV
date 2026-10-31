import { Award, BookOpen, Compass, FileUp, GraduationCap, HeartPulse, LayoutDashboard, Medal, ScrollText, ToggleRight, Trophy, Users, type LucideIcon } from "lucide-react";
import type { Role } from "@/contracts";

export type DashboardMode = "demo" | "real";

export type NavItem = { label: string; icon: LucideIcon; href: string };

/** Sidebar links per role. Anchors point to section ids rendered by each role's workspace. */
export function navItems(role: Role, mode: DashboardMode, home: string): NavItem[] {
  const overview: NavItem = { label: "Visão geral", icon: LayoutDashboard, href: home };
  if (role === "aluno") return [
    overview,
    { label: "Minhas atividades", icon: BookOpen, href: `${home}#atividade` },
    { label: "Meu progresso", icon: Compass, href: `${home}#progresso` },
    { label: "Ranking da turma", icon: Trophy, href: `${home}#ranking-turma` },
    { label: "Meu perfil", icon: GraduationCap, href: `${home}#perfil` },
  ];
  // The demo dashboards for the other roles are a single page without these sections.
  if (mode === "demo") return [overview];
  if (role === "professor") return [
    overview,
    { label: "Questões", icon: BookOpen, href: "/professor#questoes" },
    { label: "Pontos por comportamento", icon: Medal, href: "/professor/reconhecer" },
  ];
  if (role === "coordenador") return [
    overview,
    { label: "Turmas e pessoas", icon: Users, href: "/coordenador#turmas" },
    { label: "Ativar questões", icon: ToggleRight, href: "/coordenador#ativacao" },
    { label: "Acompanhamento", icon: Compass, href: "/coordenador#acompanhamento" },
    { label: "Responsáveis", icon: GraduationCap, href: "/coordenador#vinculos" },
    { label: "Importar alunos", icon: FileUp, href: "/coordenador#importacao" },
  ];
  return [
    overview,
    { label: "Resultados", icon: Compass, href: "/responsavel#resultados" },
    { label: "Elogios", icon: Award, href: "/responsavel#elogios" },
    { label: "Saúde e apoio", icon: HeartPulse, href: "/responsavel#saude-apoio" },
    { label: "Histórico escolar", icon: ScrollText, href: "/responsavel#historico" },
  ];
}
