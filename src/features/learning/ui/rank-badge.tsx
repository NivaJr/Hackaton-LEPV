import Image from "next/image";

const rankAssets: Record<string, { src: string; label: string }> = {
  ferro: { src: "/brand/ranks/ferro.png", label: "Ferro" },
  bronze: { src: "/brand/ranks/bronze.png", label: "Bronze" },
  prata: { src: "/brand/ranks/prata.png", label: "Prata" },
  ouro: { src: "/brand/ranks/ouro.png", label: "Ouro" },
  platina: { src: "/brand/ranks/platina.png", label: "Platina" },
  diamante: { src: "/brand/ranks/diamante.png", label: "Diamante" },
  esmeralda: { src: "/brand/ranks/esmeralda.png", label: "Esmeralda" },
  mestre: { src: "/brand/ranks/mestre.png", label: "Mestre" },
  "grao-mestre": { src: "/brand/ranks/grao-mestre.png", label: "Grão-mestre" },
  onisciente: { src: "/brand/ranks/onisciente.png", label: "Onisciente" },
};

function rankKey(rankName: string) {
  return rankName
    .replace(/\s*\(.*\)\s*/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, "-");
}

export function RankBadge({ rankName, compact = false }: { rankName: string; compact?: boolean }) {
  const rank = rankAssets[rankKey(rankName)] ?? rankAssets.ferro;
  return <span className={`rank-badge-image${compact ? " compact" : ""}`}>
    <Image src={rank.src} alt={`Símbolo da patente ${rank.label}`} width={compact ? 44 : 180} height={compact ? 44 : 180} sizes={compact ? "44px" : "(max-width: 900px) 120px, 180px"} />
  </span>;
}
