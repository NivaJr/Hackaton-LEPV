"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, BookOpen, Check, CheckCircle2, CircleAlert, Edit3, GraduationCap,
  Lightbulb, LoaderCircle, RotateCcw, Save, Sparkles, Square, Target,
  Trophy, UserRound, X, XCircle,
} from "lucide-react";
import { SUBJECTS, getSubject, type SubjectId } from "@/config/catalog";
import type { AttemptSubmission, QuestionForStudent, StudentPreferencesUpdate } from "@/contracts";
import { createFakeStudentLearningClient, createHttpStudentLearningClient, LearningClientError, type StudentLearningClient, type StudentLearningSnapshot } from "@/features/learning/client";
import { ActivityHeatmap } from "./activity-heatmap";
import { RankBadge } from "./rank-badge";
import { ScoringOverview } from "./scoring-overview";
import { SkillMatrix } from "./skill-matrix";

const subjectTone: Record<SubjectId, string> = { matematica: "violet", portugues: "coral", ingles: "blue", historia: "amber", geografia: "teal", biologia: "green" };

function messageFor(error: unknown) {
  if (error instanceof LearningClientError) return error.message;
  return error instanceof Error ? error.message : "Algo não saiu como esperado. Tente novamente.";
}

export function StudentLearningExperience({ fullName, mode }: { fullName: string; mode: "demo" | "real" }) {
  const clientRef = useRef<StudentLearningClient | null>(null);
  if (!clientRef.current) clientRef.current = mode === "demo" ? createFakeStudentLearningClient() : createHttpStudentLearningClient();
  const client = clientRef.current;
  const [snapshot, setSnapshot] = useState<StudentLearningSnapshot | null>(null);
  const [subject, setSubject] = useState<SubjectId>("matematica");
  const [question, setQuestion] = useState<QuestionForStudent | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<StudentLearningClient["submitAttempt"]>> | null>(null);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [interestsText, setInterestsText] = useState("");
  const [context, setContext] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pendingSubmission = useRef<AttemptSubmission | null>(null);

  useEffect(() => {
    let active = true;
    client.loadSnapshot().then((data) => {
      if (!active) return;
      setSnapshot(data);
      setInterestsText(data.preferences.interests.join(", "));
      setContext(data.preferences.context);
    }).catch((error) => setNotice(messageFor(error))).finally(() => active && setBusy(null));
    return () => { active = false; };
  }, [client, loadAttempt]);

  const activities = useMemo(() => snapshot?.activities.activities.filter((activity) => activity.subjectId === subject) ?? [], [snapshot, subject]);

  function resetTraining() {
    setQuestion(null); setResult(null); setSelectedOption(null); setRecoveryId(null); setHint(null); pendingSubmission.current = null;
  }

  function selectSubject(nextSubject: SubjectId) {
    setSubject(nextSubject); resetTraining(); setNotice(null);
  }

  async function refreshSnapshot() {
    try { setSnapshot(await client.loadSnapshot()); }
    catch { setNotice("A resposta foi salva, mas os indicadores não puderam ser atualizados agora."); }
  }

  async function openActivity() {
    const activity = activities[0];
    if (!activity) return setNotice("Ainda não há atividade disponível para esta matéria.");
    setBusy("opening"); setNotice(null); setResult(null); setHint(null); setSelectedOption(null); setRecoveryId(null);
    try {
      const state = await client.openActivity(activity.rootQuestionId);
      setQuestion(state.question);
      if (state.result) {
        setResult({ result: state.result, recoveryId: activity.recoveryId });
        setRecoveryId(activity.recoveryId);
      }
    }
    catch (error) { setNotice(messageFor(error)); }
    finally { setBusy(null); }
  }

  async function submitAnswer() {
    if (!question || !selectedOption) return;
    setBusy("answering"); setNotice(null);
    const submission = pendingSubmission.current?.questionInstanceId === question.questionInstanceId
      ? pendingSubmission.current
      : { questionInstanceId: question.questionInstanceId, selectedOptionId: selectedOption, idempotencyKey: crypto.randomUUID() };
    pendingSubmission.current = submission;
    try {
      const response = await client.submitAttempt(submission);
      setResult(response); setRecoveryId(response.recoveryId); pendingSubmission.current = null;
      await refreshSnapshot();
    } catch (error) { setNotice(messageFor(error)); }
    finally { setBusy(null); }
  }

  async function nextRecovery() {
    if (!recoveryId) return;
    setBusy("recovery"); setNotice(null);
    try {
      const next = await client.getNextRecoveryQuestion(recoveryId);
      setQuestion(next.question); setResult(null); setSelectedOption(null); setHint(null); pendingSubmission.current = null;
    } catch (error) { setNotice(messageFor(error)); }
    finally { setBusy(null); }
  }

  async function requestHint() {
    if (!question) return;
    setBusy("hint");
    try { setHint((await client.getHint(question.questionInstanceId)).text); }
    catch (error) { setNotice(messageFor(error)); }
    finally { setBusy(null); }
  }

  async function interruptRecovery() {
    if (!recoveryId) return;
    setBusy("interrupt");
    try {
      await client.interruptRecovery(recoveryId);
      setQuestion(null); setResult(null); setRecoveryId(null); setSelectedOption(null); setHint(null);
      setNotice("Recuperação interrompida. Suas respostas e seus créditos foram preservados.");
    } catch (error) { setNotice(messageFor(error)); }
    finally { setBusy(null); }
  }

  async function saveProfile() {
    if (!snapshot) return;
    setBusy("profile"); setNotice(null);
    const input: StudentPreferencesUpdate = { interests: interestsText.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20), context };
    try {
      const preferences = await client.savePreferences(input);
      setSnapshot({ ...snapshot, preferences, preferencesSaved: true }); setEditingProfile(false);
      setNotice("Ficha atualizada. Atividades já abertas continuam com a versão anterior.");
    } catch (error) { setNotice(messageFor(error)); }
    finally { setBusy(null); }
  }

  function cancelProfileEdit() {
    if (snapshot) {
      setInterestsText(snapshot.preferences.interests.join(", "));
      setContext(snapshot.preferences.context);
    }
    setEditingProfile(false);
  }

  if (!snapshot) return <section className="panel student-loading" aria-live="polite">{busy === "loading" ? <LoaderCircle className="spin" /> : <CircleAlert />}<h2>{busy === "loading" ? "Preparando sua jornada..." : "Não foi possível carregar seu espaço"}</h2><p>{notice ?? "Carregando sua turma, matérias e atividades."}</p>{busy !== "loading" && <button className="button button-primary" onClick={() => { setBusy("loading"); setNotice(null); setLoadAttempt((value) => value + 1); }}>Tentar novamente</button>}</section>;
  const { summary, ranking } = snapshot;
  const firstName = fullName.split(" ")[0];
  const correct = result?.result.isCorrect;
  const recoveryComplete = result?.result.recoveryStatus === "recovered";

  return <div className="student-learning">
    {mode === "demo" && <div className="student-demo-banner"><Sparkles size={16} /><span><strong>Demonstração provisória:</strong> dados sintéticos e adapter fake. Nenhuma resposta desta página é persistida no banco.</span></div>}
    <div className="page-heading"><div><span className="eyebrow">CENTRAL DE APRENDIZADO</span><h1>Olá, {firstName}<span className="greeting-dot">.</span> Escolha sua missão.</h1><p>Você estuda apenas conteúdos do seu ano e escolhe a matéria que quer praticar.</p></div><span className="class-badge"><GraduationCap size={16} />{snapshot.activities.className}</span></div>
    {notice && <div className="student-notice" role="status" aria-live="polite"><CircleAlert size={17} /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Fechar aviso"><X size={15} /></button></div>}

    <div className="student-command-grid">
      <section className="student-mission-card">
        <div><span className="mission-tag"><Target size={14} />MISSÃO ATUAL</span><h2>Treine uma habilidade.<br />Evolua no seu ritmo.</h2><p>Escolha uma das seis matérias e resolva o desafio disponível para sua turma.</p><a href="#atividade" className="button button-lime">Começar agora<ArrowRight size={17} /></a></div>
        <div className="command-orbit" aria-hidden="true"><span>XP</span><BookOpen size={80} /></div>
      </section>
      <section className="student-rank-card"><RankBadge rankName={summary.rankName} /><div className="student-rank-copy"><span className="eyebrow">PATENTE PROVISÓRIA</span><strong>{summary.rankName}</strong><p>Calibração ainda não aprovada pela equipe.</p><div className="student-rank-track"><span style={{ width: "62%" }} /></div><small>Progresso demonstrativo · sem regra definitiva</small></div></section>
    </div>

    <ScoringOverview summary={summary} ranking={ranking} className={snapshot.activities.className} />

    <div className="student-insights-grid"><SkillMatrix /><ActivityHeatmap activityDays={summary.activityDays} /></div>

    <section className="student-section" id="atividade">
      <div className="section-heading"><div><span className="eyebrow">ESCOLHA SEU CAMINHO</span><h2>Qual matéria você quer estudar?</h2><p>As atividades abaixo pertencem ao {snapshot.activities.grade}º ano.</p></div><span className="subtle-pill">6 matérias</span></div>
      <div className="student-subject-grid">{SUBJECTS.map((item) => <button key={item.id} className={`student-subject-button${subject === item.id ? " selected" : ""}`} aria-pressed={subject === item.id} onClick={() => selectSubject(item.id)}><span className={`subject-icon tone-${subjectTone[item.id]}`}><BookOpen size={21} /></span><strong>{item.name}</strong><small>{snapshot.activities.grade}º ano · {snapshot.activities.activities.filter((activity) => activity.subjectId === item.id).length} disponível</small>{subject === item.id && <CheckCircle2 size={17} />}</button>)}</div>
    </section>

    <div className="student-workspace-grid">
      <section className="panel student-question-panel">
        <div className="panel-heading"><div><span className="eyebrow">ÁREA DE TREINO</span><h2>{getSubject(subject).name}</h2></div><span className="subject-label">{snapshot.activities.grade}º ano · {activities[0]?.skillCodes[0] ?? "sem atividade"}</span></div>
        {!question ? <div className="student-question-empty"><span><BookOpen size={37} /></span><h3>Desafio pronto para começar</h3><p>Abra a atividade quando estiver preparado. Uma questão respondida não poderá ser refeita.</p><button className="button button-primary" onClick={openActivity} disabled={busy !== null || activities.length === 0}>{busy === "opening" ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}Abrir atividade</button></div> : <>
          <div className="question-meta"><span>{question.sourceType === "recuperacao" ? "RECUPERAÇÃO" : "QUESTÃO ORIGINAL"}</span><small>{question.skillCodes.join(" · ")}</small></div>
          <p className="student-question-statement">{question.statement}</p>
          <div className="student-answer-list">{question.options.map((option, index) => <button key={option.id} disabled={Boolean(result) || busy === "answering"} className={`student-answer${selectedOption === option.id ? " selected" : ""}`} aria-pressed={selectedOption === option.id} onClick={() => setSelectedOption(option.id)}><span>{String.fromCharCode(65 + index)}</span><strong>{option.text}</strong>{selectedOption === option.id && <Check size={16} />}</button>)}</div>
          {!result && <div className="student-question-actions"><button className="button button-primary" onClick={submitAnswer} disabled={!selectedOption || busy === "answering"}>{busy === "answering" ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Confirmar resposta</button>{question.sourceType === "recuperacao" && <button className="text-button" onClick={requestHint} disabled={busy === "hint"}><Lightbulb size={15} />Pedir dica</button>}</div>}
          {hint && <div className="student-hint"><Lightbulb size={18} /><div><strong>Dica</strong><p>{hint}</p></div></div>}
          {result && <div className={`student-result ${correct ? "correct" : "incorrect"}`}>{correct ? <CheckCircle2 size={26} /> : <XCircle size={26} />}<div><strong>{correct ? "Muito bem!" : "Vamos tentar de outro jeito."}</strong><p>{result.result.explanation}</p><small>Créditos recebidos do servidor demonstrativo: {result.result.xpAwarded} XP · {result.result.rankPointsAwarded} pontos anuais</small></div></div>}
          {result && recoveryId && !recoveryComplete && <div className="student-recovery-actions"><div><strong>Recuperação em andamento</strong><span>{result.result.consecutiveCorrect} de 2 acertos consecutivos</span></div><button className="button button-primary" onClick={nextRecovery} disabled={busy === "recovery"}>{busy === "recovery" ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}Próxima questão</button><button className="button button-outline" onClick={interruptRecovery} disabled={busy === "interrupt"}><Square size={14} />Interromper</button></div>}
          {recoveryComplete && <div className="student-recovery-complete"><Trophy size={22} /><div><strong>Recuperação concluída</strong><p>Você alcançou dois acertos consecutivos nesta atividade.</p></div><button className="button button-primary" onClick={resetTraining}>Concluir</button></div>}
          {result && correct && !recoveryId && <div className="student-completion-actions"><button className="button button-primary" onClick={resetTraining}>Escolher outro desafio</button></div>}
        </>}
      </section>

      <section className="panel student-profile-panel" id="perfil"><div className="panel-heading"><div><span className="eyebrow">MINHA FICHA</span><h2>Interesses e contexto</h2></div><button className="icon-button" onClick={() => editingProfile ? cancelProfileEdit() : setEditingProfile(true)} aria-label={editingProfile ? "Cancelar edição da ficha" : "Editar ficha"}><Edit3 size={17} /></button></div><p className="panel-description">Esses dados ajudam a adaptar exemplos futuros. Saúde e apoio não são editáveis aqui.</p>{editingProfile ? <div className="student-profile-form"><label>Interesses <small>separe por vírgulas</small><input value={interestsText} onChange={(event) => setInterestsText(event.target.value)} maxLength={500} /></label><label>Como você prefere aprender?<textarea value={context} onChange={(event) => setContext(event.target.value)} maxLength={2000} rows={5} /></label><div><button className="button button-primary" onClick={saveProfile} disabled={busy === "profile"}><Save size={15} />Salvar ficha</button><button className="text-button" onClick={cancelProfileEdit}>Cancelar</button></div></div> : <><div className="interest-tags">{snapshot.preferences.interests.map((interest) => <span key={interest}>{interest}</span>)}</div><div className="student-context"><UserRound size={18} /><p>{snapshot.preferences.context || "Nenhum contexto informado."}</p></div><small className="profile-version">Versão {snapshot.preferences.version} · {mode === "demo" ? "demonstração mantida durante esta sessão" : "dados vinculados à sua conta"}</small></>}</section>
    </div>

    <section className="panel student-ranking-panel" id="ranking-turma"><div className="panel-heading"><div><span className="eyebrow">TOP 10 DA TURMA</span><h2>Ranking de {snapshot.activities.className}</h2></div><Trophy className="trophy-icon" size={23} /></div><p className="panel-description">Nomes completos exibidos somente dentro da própria turma. Patentes e valores são provisórios.</p><div className="student-ranking-list">{ranking.top10.map((entry) => <div key={entry.studentId} className={`student-ranking-row${entry.studentId === summary.studentId ? " current" : ""}`}><span className="ranking-position">{entry.position}</span><RankBadge rankName={entry.rankName} compact /><div className="ranking-person"><strong>{entry.name} <b>{snapshot.activities.className}</b></strong><small>{entry.rankName}</small></div><div><strong>{entry.xp.toLocaleString("pt-BR")}</strong><small>XP</small></div><div><strong>{entry.rankPoints.toLocaleString("pt-BR")}</strong><small>pontos anuais</small></div></div>)}</div></section>
  </div>;
}
