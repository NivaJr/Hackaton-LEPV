import { ArrowUpRight, Trophy } from "lucide-react";
import type { StudentSummary } from "@/contracts";
import type { RankingResponse } from "@/features/learning/client";
import { RankBadge } from "./rank-badge";

export function ScoringOverview({ summary, ranking, className }: { summary: StudentSummary; ranking: RankingResponse; className: string }) {
  const current = ranking.top10.find((entry) => entry.studentId === summary.studentId);
  const leaderXp = Math.max(...ranking.top10.map((entry) => entry.xp), summary.xp, 1);
  const relativeXp = Math.max(4, Math.min(100, Math.round((summary.xp / leaderXp) * 100)));

  return <section className="scoring-overview" aria-label="Painel de pontuação e classificação">
    <article className="total-score-card">
      <div className="score-grid-pattern" aria-hidden="true" />
      <div className="total-score-rank"><RankBadge rankName={summary.rankName} /></div>
      <div className="total-score-copy"><span>PONTUAÇÃO TOTAL ANUAL</span><strong>{summary.rankPoints.toLocaleString("pt-BR")}</strong><small>pontos acumulados no ano letivo</small></div>
      <div className="total-score-patent"><span>Patente atual</span><strong>{summary.rankName}</strong><small>Calibração das patentes ainda identificada como proposta.</small></div>
      <div className="score-disclosure">A pontuação anual permanece separada do XP ativo e não é apagada pela rotação de exercícios.</div>
    </article>

    <article className="dynamic-score-card">
      <div className="dynamic-score-heading"><div><span className="eyebrow">PONTUAÇÃO DINÂMICA</span><h2>XP dos exercícios ativos</h2></div><span className="dynamic-live"><i />Atual</span></div>
      <div className="dynamic-score-main"><div><strong>{summary.xp.toLocaleString("pt-BR")}</strong><span>XP ativo</span></div><div className="ranking-position-card"><Trophy size={22} /><span>Classificação</span><strong>{current ? `#${current.position}` : "—"}</strong><small>{current ? `de ${ranking.top10.length} no TOP 10` : "Fora do TOP 10"}</small></div></div>
      <div className="dynamic-progress-copy"><span>Comparação com o líder da {className}</span><strong>{relativeXp}%</strong></div>
      <div className="dynamic-progress" role="progressbar" aria-label="XP em relação ao líder da turma" aria-valuemin={0} aria-valuemax={100} aria-valuenow={relativeXp}><span style={{ width: `${relativeXp}%` }}><i /></span></div>
      <div className="dynamic-score-footer"><span>XP e pontos anuais permanecem separados.</span><a href="#ranking-turma">Ver ranking completo<ArrowUpRight size={13} /></a></div>
    </article>
  </section>;
}
