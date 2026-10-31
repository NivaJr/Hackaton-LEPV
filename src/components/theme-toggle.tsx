"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("eai-theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Ativar modo ${theme === "dark" ? "claro" : "escuro"}`} title={`Ativar modo ${theme === "dark" ? "claro" : "escuro"}`}>
    {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
  </button>;
}
