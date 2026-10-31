import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LEPV · Cada aluno, uma jornada", template: "%s · LEPV" },
  description: "Base de uma plataforma de aprendizagem para o 6º ao 9º ano, com demonstrações identificadas para alunos, professores, coordenação e responsáveis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
