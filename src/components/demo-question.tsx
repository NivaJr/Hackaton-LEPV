"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Lightbulb, MessageCircle, Sparkles } from "lucide-react";

export function DemoQuestion() {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const correct = selected === "4";
  return <section className="panel demo-practice" id="pratica-demo" aria-labelledby="question-title">
    <div className="panel-heading"><div><span className="eyebrow">EXPERIMENTE A JORNADA</span><h2 id="question-title">Uma pequena missão, um novo aprendizado.</h2></div><span className="subject-label"><Sparkles size={13} />Demonstração local</span></div>
    <p className="practice-description">Matemática · Frações · Questão fixa de exemplo</p>
    <p className="question-statement">Seu time marcou 12 pontos em um jogo. Ana fez <strong>⅓ dos pontos</strong> do time. Quantos pontos ela fez?</p>
    <fieldset className="answer-options" disabled={submitted}><legend className="sr-only">Escolha uma resposta</legend>{["3", "4", "6", "9"].map((option, index) => <label key={option} className={`answer-option${selected === option ? " selected" : ""}${submitted && selected === option ? correct ? " answer-correct" : " answer-incorrect" : ""}`}><input type="radio" name="demo-answer" value={option} checked={selected === option} onChange={() => setSelected(option)} /><span className="option-letter">{String.fromCharCode(65 + index)}</span><strong>{option} pontos</strong></label>)}</fieldset>
    {!submitted && <div className="question-actions"><button type="button" className="button button-primary" disabled={!selected} onClick={() => setSubmitted(true)}>Conferir resposta<ArrowRight size={16} /></button><button type="button" className="text-button" onClick={() => setShowHint(!showHint)} aria-expanded={showHint}><Lightbulb size={17} />{showHint ? "Ocultar ajuda" : "Como pensar nessa questão?"}</button></div>}
    {showHint && !submitted && <p className="hint-box"><Lightbulb size={17} />Um terço é uma das três partes iguais de um total. Como você pode repartir os 12 pontos em três grupos?</p>}
    {submitted && <div className={`answer-feedback ${correct ? "feedback-correct" : "feedback-learning"}`} role="status"><span>{correct ? <CheckCircle2 size={22} /> : <MessageCircle size={22} />}</span><div><strong>{correct ? "Isso! Você encontrou uma das três partes." : "Vamos entender esse passo juntos."}</strong><p>Dividindo 12 pontos em 3 partes iguais, temos 12 ÷ 3 = 4. Por isso, Ana fez 4 pontos.</p><Link href="/tarefas">Conhecer o fluxo de recuperação planejado<ArrowRight size={14} /></Link></div></div>}
    <p className="demo-footnote">Esta interação acontece apenas nesta página. Não registra tentativas, não gera pontos nem novas questões. O gabarito deste exemplo público está no navegador.</p>
  </section>;
}
