import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EAI · Educational Artificial Intelligence", template: "%s · EAI" },
  description: "Plataforma educacional adaptativa para estudantes do 6º ao 9º ano, professores, coordenação e responsáveis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `(function(){try{var t=localStorage.getItem('eai-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;
  return <html lang="pt-BR" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{ __html: themeScript }} /><ThemeToggle />{children}</body></html>;
}
