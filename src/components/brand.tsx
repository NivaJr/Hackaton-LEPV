import Link from "next/link";
import { BookOpen, Sparkle } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand${light ? " brand-light" : ""}`} aria-label="LEPV, página inicial">
    <span className="brand-mark"><BookOpen size={25} strokeWidth={2.3} /><Sparkle className="brand-spark" size={13} fill="currentColor" /></span>
    <span>LEPV<span className="brand-dot">.</span></span>
  </Link>;
}
