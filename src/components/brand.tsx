import Link from "next/link";
import Image from "next/image";

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand${light ? " brand-light" : ""}`} aria-label="EAI — Educational Artificial Intelligence, página inicial">
    <Image className="brand-logo" src="/brand/eai-logo.png" alt="EAI — Educational Artificial Intelligence" width={224} height={112} sizes="(max-width: 760px) 132px, 168px" />
  </Link>;
}
