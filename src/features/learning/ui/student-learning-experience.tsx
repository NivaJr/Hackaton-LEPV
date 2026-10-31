"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight, BookOpen, Check, CheckCircle2, CircleAlert, ClipboardList, Edit3, GraduationCap, Layers3,
  Lightbulb, LoaderCircle, RotateCcw, Save, Sparkles, Square, Target,
  Trophy, UserRound, X, XCircle, Zap,
} from "lucide-react";
import { SUBJECTS, getSubject, type SubjectId } from "@/config/catalog";
import { APPROVED_STUDENT_INTERESTS, isApprovedStudentInterest, type ApprovedStudentInterest } from "@/config/student-interests";
import type { AttemptSubmission, QuestionForStudent, StudentPreferencesUpdate } from "@/contracts";
import { createFakeStudentLearningClient, createHttpStudentLearningClient, LearningClientError, type StudentActivity, type StudentLearningClient, type StudentLearningSnapshot } from "@/features/learning/client";
import { ActivityHeatmap } from "./activity-heatmap";
import {
  ACCESSIBLE_INTERFACE_PRESET,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  hasAccessibilityNeeds,
  loadAccessibilityPreferences,
  saveAccessibilityPreferences,
  type AccessibilityNeed,
  type StudentAccessibilityPreferences,
} from "./accessibility-preferences";
import { RankBadge } from "./rank-badge";
import { playCorrectAnswerSound, prepareCorrectAnswerSound } from "./correct-answer-sound";
import { ScoringOverview } from "./scoring-overview";
import { SkillMatrix } from "./skill-matrix";
import styles from "./student-activities.module.css";

const subjectTone: Record<SubjectId, string> = { matematica: "violet", portugues: "coral", ingles: "blue", historia: "amber", geografia: "teal", biologia: "green" };

function contentKey(activity: StudentActivity) {
  return activity.contentId?.trim() || activity.skillCodes.join("|");
}

function contentTitle(activity: StudentActivity) {
  return activity.contentTitle?.trim() || `Habilidade ${activity.skillCodes.join(" · ")}`;
}

function messageFor(error: unknown) {
  if (error instanceof LearningClientError) return error.message;
  return error instanceof Error ? error.message : "Algo não saiu como esperado. Tente novamente.";
}

export function StudentLearningExperience({ fullName, mode, registeredAccessibilityNeeds = [] }: { fullName: string; mode: "demo" | "real"; registeredAccessibilityNeeds?: AccessibilityNeed[] }) {
  const clientRef = useRef<StudentLearningClient | null>(null);
  if (!clientRef.current) clientRef.current = mode === "demo" ? createFakeStudentLearningClient() : createHttpStudentLearningClient();
  const client = clientRef.current;
  const [snapshot, setSnapshot] = useState<StudentLearningSnapshot | null>(null);
  const [subject, setSubject] = useState<SubjectId>("matematica");
  const [content, setContent] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionForStudent | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<StudentLearningClient["submitAttempt"]>> | null>(null);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [questionStatus, setQuestionStatus] = useState<"pending" | "answered">("pending");
  const [recoveryStatus, setRecoveryStatus] = useState<StudentActivity["recoveryStatus"]>(null);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [interestsText, setInterestsText] = useState("");
  const [context, setContext] = useState("");
  const [accessibility, setAccessibility] = useState<StudentAccessibilityPreferences>(DEFAULT_ACCESSIBILITY_PREFERENCES);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pendingSubmissions = useRef(new Map<string, AttemptSubmission>());
  const playedCorrectFeedback = useRef(new Set<string>());
  const operation = useRef<string | null>("loading");

  function begin(name: string) {
    if (operation.current) return false;
    operation.current = name; setBusy(name); setNotice(null);
    return true;
  }
  function finish() { operation.current = null; setBusy(null); }

  // Sections render after the snapshot loads, so the browser cannot follow the hash on its own.
  const loaded = snapshot !== null;
  useEffect(() => {
    if (loaded && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [loaded]);

  useEffect(() => {
    let active = true;
    client.recordAccess().then(() => client.loadSnapshot()).then((data) => {
      if (!active) return;
      setSnapshot(data);
      setInterestsText(data.preferences.interests.filter(isApprovedStudentInterest).join(", "));
      setContext(data.preferences.context);
      setEditingProfile(!data.preferencesSaved);
    }).catch((error) => active && setNotice(messageFor(error))).finally(() => active && finish());
    return () => { active = false; };
  }, [client, loadAttempt]);

  const subjectActivities = useMemo(() => snapshot?.activities.activities.filter((activity) => activity.subjectId === subject) ?? [], [snapshot, subject]);
  const contents = useMemo(() => [...new Map(subjectActivities.map((activity) => [contentKey(activity), {
    id: contentKey(activity), title: contentTitle(activity), definedBy: activity.contentDefinedBy,
    count: subjectActivities.filter((candidate) => contentKey(candidate) === contentKey(activity)).length,
  }])).values()], [subjectActivities]);
  const activities = useMemo(() => content ? subjectActivities.filter((activity) => contentKey(activity) === content) : [], [content, subjectActivities]);
  const weeklyChallenges = useMemo(() => activities.filter((activity) => activity.activityType === "weekly_challenge"), [activities]);
  const teacherExercises = useMemo(() => activities.filter((activity) => activity.activityType === "exercise"), [activities]);
  const selectedInterests = useMemo(() => interestsText.split(",").map((item) => item.trim()).filter(isApprovedStudentInterest), [interestsText]);
  const studentId = snapshot?.summary.studentId;

  useEffect(() => {
    if (!studentId) return;
    const stored = loadAccessibilityPreferences(studentId, registeredAccessibilityNeeds);
    setAccessibility(stored);
  }, [registeredAccessibilityNeeds, studentId]);

  function resetTraining() {
    setQuestion(null); setResult(null); setSelectedOption(null); setRecoveryId(null); setRecoveryStatus(null); setQuestionStatus("pending"); setHint(null);
  }

  function selectSubject(nextSubject: SubjectId) {
    if (operation.current) return;
    setSubject(nextSubject); setContent(null); resetTraining(); setNotice(null);
  }

  function selectContent(nextContent: string) {
    if (operation.current) return;
    setContent(nextContent); resetTraining(); setNotice(null);
  }

  async function refreshSnapshot() {
    try { setSnapshot(await client.loadSnapshot()); }
    catch { setNotice("A operação foi salva, mas os indicadores não puderam ser atualizados. Recarregue a página para consultar seu progresso."); }
  }

  async function openActivity(activity: StudentActivity) {
    if (!begin("opening")) return;
    try {
      const state = await client.openActivity(activity.rootQuestionId);
      setQuestion(state.question); setQuestionStatus(state.status); setHint(null);
      setSnapshot((current) => current && { ...current, activities: { ...current.activities,
        activities: current.activities.activities.map((item) => item.rootQuestionId === activity.rootQuestionId
          ? { ...item, status: state.status, questionInstanceId: state.question.questionInstanceId } : item),
      } });
      setSelectedOption(pendingSubmissions.current.get(state.question.questionInstanceId)?.selectedOptionId ?? null);
      setResult(state.result ? { result: state.result, recoveryId: activity.recoveryId } : null);
      setRecoveryId(activity.recoveryId); setRecoveryStatus(activity.recoveryStatus);
      setConsecutiveCorrect(activity.recoveryConsecutiveCorrect ?? state.result?.consecutiveCorrect ?? 0);
    }
    catch (error) { setNotice(messageFor(error)); }
    finally { finish(); }
  }

  async function submitAnswer() {
    if (!question || !selectedOption || questionStatus === "answered" || !begin("answering")) return;
    const soundContext = prepareCorrectAnswerSound(accessibility.interfaceMode === "standard");
    const submission = pendingSubmissions.current.get(question.questionInstanceId)
      ?? { questionInstanceId: question.questionInstanceId, selectedOptionId: selectedOption, idempotencyKey: crypto.randomUUID() };
    pendingSubmissions.current.set(question.questionInstanceId, submission);
    try {
      const response = await client.submitAttempt(submission);
      if (response.result.isCorrect && !playedCorrectFeedback.current.has(response.result.attemptId)) {
        playedCorrectFeedback.current.add(response.result.attemptId);
        playCorrectAnswerSound(soundContext);
      }
      setResult(response); setRecoveryId(response.recoveryId); setQuestionStatus("answered");
      setRecoveryStatus(response.result.recoveryStatus); setConsecutiveCorrect(response.result.consecutiveCorrect);
      pendingSubmissions.current.delete(question.questionInstanceId);
      await refreshSnapshot();
    } catch (error) {
      if (error instanceof LearningClientError && error.status === 422) pendingSubmissions.current.delete(question.questionInstanceId);
      setNotice(messageFor(error));
    }
    finally { finish(); }
  }

  async function nextRecovery() {
    if (!recoveryId || recoveryStatus !== "in_progress" || !begin("recovery")) return;
    try {
      const next = await client.getNextRecoveryQuestion(recoveryId);
      setQuestion(next.question); setQuestionStatus(next.status);
      setResult(next.result ? { result: next.result, recoveryId } : null);
      setSelectedOption(pendingSubmissions.current.get(next.question.questionInstanceId)?.selectedOptionId ?? null); setHint(null);
    } catch (error) { setNotice(messageFor(error)); }
    finally { finish(); }
  }

  async function requestHint() {
    if (!question || questionStatus === "answered" || !begin("hint")) return;
    try { setHint((await client.getHint(question.questionInstanceId)).text); }
    catch (error) { setNotice(messageFor(error)); }
    finally { finish(); }
  }

  async function interruptRecovery() {
    if (!recoveryId || !begin("interrupt")) return;
    try {
      await client.interruptRecovery(recoveryId);
      resetTraining();
      await refreshSnapshot();
      setNotice("Recuperação interrompida. Suas respostas e seus créditos foram preservados.");
    } catch (error) { setNotice(messageFor(error)); }
    finally { finish(); }
  }

  async function saveProfile() {
    if (!snapshot || !begin("profile")) return;
    const input: StudentPreferencesUpdate = { interests: selectedInterests, context };
    try {
      const preferences = await client.savePreferences(input);
      setSnapshot((current) => current && { ...current, preferences, preferencesSaved: true }); setEditingProfile(false);
      setInterestsText(preferences.interests.join(", ")); setContext(preferences.context);
      setNotice("Ficha atualizada. Atividades já abertas continuam com a versão anterior.");
    } catch (error) { setNotice(messageFor(error)); }
    finally { finish(); }
  }

  function cancelProfileEdit() {
    if (snapshot) {
      setInterestsText(snapshot.preferences.interests.filter(isApprovedStudentInterest).join(", "));
      setContext(snapshot.preferences.context);
    }
    setEditingProfile(false);
  }

  function toggleInterest(interest: ApprovedStudentInterest) {
    const current = new Set(selectedInterests);
    if (current.has(interest)) current.delete(interest);
    else current.add(interest);
    setInterestsText([...current].join(", "));
  }

  function persistAccessibility(next: StudentAccessibilityPreferences, message: string) {
    if (!studentId) return;
    saveAccessibilityPreferences(studentId, next);
    setAccessibility(next);
    setNotice(message);
  }

  function switchInterface(interfaceMode: StudentAccessibilityPreferences["interfaceMode"]) {
    persistAccessibility({ ...accessibility, interfaceMode }, interfaceMode === "standard"
      ? "Interface normal ativada. Você pode voltar ao modo acessível na sua ficha."
      : "Modo acessível ativado.");
  }

  function toggleAccessibility() {
    if (accessibleMode) {
      switchInterface("standard");
      return;
    }
    persistAccessibility(accessibilityConfigured ? { ...accessibility, interfaceMode: "accessible" } : ACCESSIBLE_INTERFACE_PRESET,
      "Modo acessível ativado.");
  }

  if (!snapshot) return <section className="panel student-loading" aria-live="polite">{busy === "loading" ? <LoaderCircle className="spin" /> : <CircleAlert />}<h2>{busy === "loading" ? "Preparando sua jornada..." : "Não foi possível carregar seu espaço"}</h2><p>{notice ?? "Carregando sua turma, matérias e atividades."}</p>{busy !== "loading" && <button className="button button-primary" onClick={() => { operation.current = "loading"; setBusy("loading"); setNotice(null); setLoadAttempt((value) => value + 1); }}>Tentar novamente</button>}</section>;
  const { summary, ranking } = snapshot;
  const firstName = fullName.split(" ")[0];
  const correct = result?.result.isCorrect;
  const recoveryComplete = recoveryStatus === "recovered";
  const answerLocked = questionStatus === "answered" || busy !== null || Boolean(question && pendingSubmissions.current.has(question.questionInstanceId));
  const accessibilityConfigured = hasAccessibilityNeeds(accessibility);
  const accessibleMode = accessibilityConfigured && accessibility.interfaceMode === "accessible";
  const simplifiedFocus = accessibleMode && accessibility.needs.focus;
  const experienceClassName = [
    "student-learning",
    styles.experience,
    accessibleMode ? styles.accessibleMode : "",
    accessibleMode && accessibility.needs.reading ? styles.readingSupport : "",
    accessibleMode && accessibility.needs.focus ? styles.focusSupport : "",
    accessibleMode && accessibility.needs.predictability ? styles.predictableSupport : "",
  ].filter(Boolean).join(" ");

  return <div className={experienceClassName} data-interface-mode={accessibleMode ? "accessible" : "standard"}>
    <div className={styles.accessibilityTop}><button type="button" onClick={toggleAccessibility} aria-pressed={accessibleMode} aria-label={accessibleMode ? "Usar interface normal" : "Ativar modo acessível"}><span><Image src="/brand/accessibility-symbol.png" alt="" width={42} height={35} aria-hidden="true" priority /></span><span><strong>Acessibilidade</strong><small>{accessibleMode ? "Modo acessível ativo" : "Ativar modo acessível"}</small></span></button></div>
    {mode === "demo" && <div className="student-demo-banner"><Sparkles size={16} /><span><strong>Demonstração provisória:</strong> dados sintéticos e adapter fake. Nenhuma resposta desta página é persistida no banco.</span></div>}
    <div className="page-heading"><div><span className="eyebrow">{accessibleMode ? "SEU ESPAÇO DE ESTUDO" : "CENTRAL DE APRENDIZADO"}</span><h1>{accessibleMode ? <>Olá, {firstName}. Escolha o que estudar.</> : <>Olá, {firstName}<span className="greeting-dot">.</span> Escolha sua missão.</>}</h1><p>{accessibleMode ? "Primeiro escolha uma matéria. Depois escolha o conteúdo e a atividade." : "Escolha a matéria, o conteúdo definido para sua turma e o exercício que quer praticar."}</p></div><span className="class-badge"><GraduationCap size={16} />{snapshot.activities.className}</span></div>
    {notice && <div className="student-notice" role="status" aria-live="polite"><CircleAlert size={17} /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Fechar aviso"><X size={15} /></button></div>}

    {!simplifiedFocus && <>
      <div className="student-command-grid">
        <section className="student-mission-card">
          <div><span className="mission-tag"><Target size={14} />{accessibleMode ? "ATIVIDADE DE ESTUDO" : "MISSÃO ATUAL"}</span><h2>{accessibleMode ? <>Treine uma habilidade.<br />No seu ritmo.</> : <>Treine uma habilidade.<br />Evolua no seu ritmo.</>}</h2><p>{accessibleMode ? "Escolha a matéria, o conteúdo e depois uma atividade da sua turma." : "Escolha uma matéria e pratique um dos conteúdos publicados para sua turma."}</p><a href="#atividade" className="button button-lime">Ver matérias<ArrowRight size={17} /></a></div>
          <div className="command-orbit" aria-hidden="true"><span>XP</span><BookOpen size={80} /></div>
        </section>
        <section className="student-rank-card"><RankBadge rankName={summary.rankName} /><div className="student-rank-copy"><span className="eyebrow">PATENTE ATUAL</span><strong>{summary.rankName}</strong><p>Os pontos de patente são cumulativos durante o ano.</p>{mode === "demo" && <><div className="student-rank-track"><span style={{ width: "85%" }} /></div><small>Próxima patente a cada 1.000 pontos</small></>}</div></section>
      </div>

      <ScoringOverview summary={summary} ranking={ranking} className={snapshot.activities.className} />

      <div className="student-insights-grid"><SkillMatrix mode={mode} difficultSkillCodes={summary.difficultSkillCodes} subjectProgress={snapshot.subjectProgress} /><ActivityHeatmap mode={mode} activityDays={summary.activityDays} activityDates={snapshot.activityDates} schoolYear={snapshot.activities.schoolYear} /></div>
    </>}

    {simplifiedFocus && <section className={`panel ${styles.focusSummary}`} id="progresso" aria-labelledby="focus-progress-title"><div><span className="eyebrow">MEU PROGRESSO</span><h2 id="focus-progress-title">Resumo direto</h2><p>Mostramos apenas os dados principais para reduzir distrações.</p></div><div className={styles.focusStats}><span><small>Patente atual</small><strong>{summary.rankName}</strong></span><span><small>Pontos anuais</small><strong>{summary.rankPoints.toLocaleString("pt-BR")}</strong></span><span><small>XP semanal ativo</small><strong>{summary.xp.toLocaleString("pt-BR")}</strong></span></div></section>}

    <section className="student-section" id="atividade">
      <div className="section-heading"><div><span className="eyebrow">{accessibleMode ? "MATÉRIAS" : "ESCOLHA SEU CAMINHO"}</span><h2>Qual matéria você quer estudar?</h2><p>As atividades abaixo pertencem ao {snapshot.activities.grade}º ano.</p></div><span className="subtle-pill">6 matérias</span></div>
      <div className="student-subject-grid">{SUBJECTS.map((item) => <button key={item.id} disabled={busy !== null} className={`student-subject-button${subject === item.id ? " selected" : ""}`} aria-pressed={subject === item.id} onClick={() => selectSubject(item.id)}><span className={`subject-icon tone-${subjectTone[item.id]}`}><BookOpen size={21} /></span><strong>{item.name}</strong><small>{snapshot.activities.grade}º ano · {snapshot.activities.activities.filter((activity) => activity.subjectId === item.id).length} disponíveis</small>{subject === item.id && <CheckCircle2 size={17} />}</button>)}</div>
    </section>

    <section className={styles.contentSection} aria-labelledby="content-heading">
      <div className="section-heading"><div><span className="eyebrow">CONTEÚDOS DE {getSubject(subject).name.toLocaleUpperCase("pt-BR")}</span><h2 id="content-heading">O que você está estudando?</h2><p>Escolha o conteúdo definido para sua turma antes de abrir os exercícios.</p></div><span className="subtle-pill">{contents.length} {contents.length === 1 ? "conteúdo" : "conteúdos"}</span></div>
      {contents.length ? <div className={styles.contentGrid}>{contents.map((item) => <button key={item.id} type="button" disabled={busy !== null} className={content === item.id ? styles.contentSelected : ""} aria-pressed={content === item.id} onClick={() => selectContent(item.id)}><span><Layers3 size={20} /></span><strong>{item.title}</strong><small>{item.count} {item.count === 1 ? "exercício" : "exercícios"}{item.definedBy ? ` · definido pelo ${item.definedBy}` : ""}</small>{content === item.id && <CheckCircle2 size={17} />}</button>)}</div> : <p className={styles.contentEmpty}>Nenhum conteúdo foi publicado para esta disciplina.</p>}
    </section>

    <div className="student-workspace-grid">
      <section className="panel student-question-panel">
        <div className="panel-heading"><div><span className="eyebrow">ÁREA DE TREINO</span><h2>{content ? contents.find((item) => item.id === content)?.title : getSubject(subject).name}</h2></div><span className="subject-label">{snapshot.activities.grade}º ano · {question?.skillCodes[0] ?? `${activities.length} atividades`}</span></div>
        {!question ? <>
          <div className="student-question-empty"><span><BookOpen size={37} /></span><h3>{!content ? "Escolha um conteúdo" : activities.length ? "Escolha o que quer fazer" : "Nenhuma atividade disponível"}</h3><p>{!content ? `Selecione acima um conteúdo de ${getSubject(subject).name} para ver os exercícios.` : activities.length ? "O desafio semanal e as listas do professor aparecem separados logo abaixo." : "Sua turma ainda não tem questões ativas neste conteúdo."}</p></div>
          {!snapshot.preferencesSaved && <p role="status">Antes de começar, <a href="#perfil">salve seus interesses na ficha</a>.</p>}
          {content && activities.length > 0 && <div className={styles.activitySections}>
            <section className={styles.weeklySection} aria-labelledby="weekly-heading">
              <div className={styles.activitySectionHeading}><span><Zap size={20} /></span><div><strong id="weekly-heading">Desafio semanal em destaque</strong><small>Questões especiais · 100 XP + 100 pontos de patente por acerto</small></div></div>
              {weeklyChallenges.length ? <ol className={`${styles.activities} ${styles.weeklyActivities}`} aria-label="Desafios semanais">{weeklyChallenges.map((activity, index) => <li key={activity.rootQuestionId}><button disabled={busy !== null || !snapshot.preferencesSaved} onClick={() => openActivity(activity)}><span><strong>Desafio semanal {index + 1}</strong><small>{activity.skillCodes.join(" · ")}</small></span><span>{activity.recoveryStatus === "in_progress" ? "Retomar recuperação" : activity.status === "answered" ? "Ver resposta" : activity.status === "pending" ? "Continuar desafio" : "Começar desafio"}<ArrowRight size={16} aria-hidden="true" /></span></button></li>)}</ol> : <p className={styles.activityEmpty}>Nenhum desafio semanal neste conteúdo.</p>}
            </section>
            <section className={styles.teacherSection} aria-labelledby="teacher-lists-heading">
              <div className={styles.activitySectionHeading}><span><ClipboardList size={20} /></span><div><strong id="teacher-lists-heading">Listas do professor</strong><small>Exercícios da disciplina · 50 pontos de patente por acerto</small></div></div>
              {teacherExercises.length ? <ol className={styles.activities} aria-label="Listas do professor">{teacherExercises.map((activity, index) => <li key={activity.rootQuestionId}><button disabled={busy !== null || !snapshot.preferencesSaved} onClick={() => openActivity(activity)}><span><strong>Lista do professor {index + 1}</strong><small>{activity.skillCodes.join(" · ")} · {activity.contentDefinedBy === "coordenador" ? "publicada pela coordenação" : "publicada pelo professor"}</small></span><span>{activity.recoveryStatus === "in_progress" ? "Retomar recuperação" : activity.status === "answered" ? "Ver resposta" : activity.status === "pending" ? "Continuar lista" : "Abrir lista"}<ArrowRight size={16} aria-hidden="true" /></span></button></li>)}</ol> : <p className={styles.activityEmpty}>Nenhuma lista do professor neste conteúdo.</p>}
            </section>
          </div>}
          {busy === "opening" && <p role="status">Abrindo atividade...</p>}
        </> : <>
          <button className="text-button" disabled={busy !== null} onClick={resetTraining}>Voltar às atividades</button>
          <div className="question-meta"><span>{question.sourceType === "recuperacao" ? "RECUPERAÇÃO" : "QUESTÃO ORIGINAL"}</span><small>{question.skillCodes.join(" · ")}</small></div>
          <p className="student-question-statement">{question.statement}</p>
          <div className="student-answer-list">{question.options.map((option, index) => <button key={option.id} disabled={answerLocked} className={`student-answer${selectedOption === option.id ? " selected" : ""}`} aria-pressed={selectedOption === option.id} onClick={() => setSelectedOption(option.id)}><span>{String.fromCharCode(65 + index)}</span><strong>{option.text}</strong>{selectedOption === option.id && <Check size={16} />}</button>)}</div>
          {questionStatus === "answered" && <p className={styles.readOnly}>Resposta salva. Esta questão está disponível apenas para consulta.</p>}
          {questionStatus === "pending" && <div className="student-question-actions"><button className="button button-primary" onClick={submitAnswer} disabled={!selectedOption || busy !== null}>{busy === "answering" ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{pendingSubmissions.current.has(question.questionInstanceId) && busy !== "answering" ? "Reenviar mesma resposta" : "Confirmar resposta"}</button>{question.sourceType === "recuperacao" && <button className="text-button" onClick={requestHint} disabled={busy !== null}><Lightbulb size={15} />Pedir dica</button>}</div>}
          {hint && <div className="student-hint"><Lightbulb size={18} /><div><strong>Dica</strong><p>{hint}</p></div></div>}
          {result && <div className={`student-result ${correct ? "correct" : "incorrect"}`} role="status">{correct ? <CheckCircle2 size={26} /> : <XCircle size={26} />}<div><strong>{correct ? "Muito bem!" : "Vamos tentar de outro jeito."}</strong><p>{result.result.explanation}</p><small>{mode === "demo" ? "Créditos simulados" : "Créditos recebidos do servidor"}: {result.result.xpAwarded} XP · {result.result.rankPointsAwarded} pontos anuais</small></div></div>}
          {recoveryId && recoveryStatus === "in_progress" && <div className="student-recovery-actions"><div><strong>Recuperação em andamento</strong><span>{consecutiveCorrect} de 2 acertos consecutivos</span></div>{questionStatus === "answered" && <button className="button button-primary" onClick={nextRecovery} disabled={busy !== null}>{busy === "recovery" ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}Próxima questão</button>}<button className="button button-outline" onClick={interruptRecovery} disabled={busy !== null}><Square size={14} />Interromper</button></div>}
          {recoveryStatus === "interrupted" && <p role="status">Recuperação interrompida. Suas respostas e seus créditos foram preservados.</p>}
          {recoveryComplete && <div className="student-recovery-complete"><Trophy size={22} /><div><strong>Recuperação concluída</strong><p>Você alcançou dois acertos consecutivos nesta atividade.</p></div><button className="button button-primary" onClick={resetTraining} disabled={busy !== null}>Concluir</button></div>}
          {result && correct && !recoveryId && <div className="student-completion-actions"><button className="button button-primary" onClick={resetTraining} disabled={busy !== null}>{accessibleMode ? "Escolher outra atividade" : "Escolher outro desafio"}</button></div>}
        </>}
      </section>

      <section className="panel student-profile-panel" id="perfil">
        <div className="panel-heading"><div><span className="eyebrow">MINHA FICHA</span><h2>Interesses e contexto</h2></div><button className="icon-button" disabled={busy !== null} onClick={() => editingProfile ? cancelProfileEdit() : setEditingProfile(true)} aria-label={editingProfile ? "Cancelar edição da ficha" : "Editar ficha"}><Edit3 size={17} /></button></div>
        <p className="panel-description">Escolha somente entre sugestões saudáveis e adequadas ao ambiente escolar. Saúde e apoio não são editáveis aqui.</p>
        {editingProfile ? <div className="student-profile-form"><fieldset className={styles.interestFieldset}><legend>Escolha seus interesses <small>{selectedInterests.length} selecionados</small></legend><div className={styles.interestSuggestions}>{APPROVED_STUDENT_INTERESTS.map((interest) => <button type="button" key={interest} aria-pressed={selectedInterests.includes(interest)} onClick={() => toggleInterest(interest)}>{selectedInterests.includes(interest) && <Check size={14} />}{interest}</button>)}</div><p>As opções são previamente aprovadas para manter a personalização segura.</p></fieldset><label>Como você prefere aprender?<textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="Ex.: prefiro exemplos visuais e atividades curtas." maxLength={2000} rows={5} /></label><div><button className="button button-primary" onClick={saveProfile} disabled={busy !== null}><Save size={15} />Salvar ficha</button><button className="text-button" disabled={busy !== null} onClick={cancelProfileEdit}>Cancelar</button></div></div> : <><div className="interest-tags">{snapshot.preferences.interests.filter(isApprovedStudentInterest).map((interest) => <span key={interest}>{interest}</span>)}</div><div className="student-context"><UserRound size={18} /><p>{snapshot.preferences.context || "Nenhum contexto informado."}</p></div><small className="profile-version">Versão {snapshot.preferences.version} · {mode === "demo" ? "demonstração mantida durante esta sessão" : "dados vinculados à sua conta"}</small></>}

      </section>
    </div>

    {!simplifiedFocus && <section className="panel student-ranking-panel" id="ranking-turma"><div className="panel-heading"><div><span className="eyebrow">TOP 10 DA TURMA</span><h2>Ranking de {snapshot.activities.className}</h2></div><Trophy className="trophy-icon" size={23} /></div><p className="panel-description">O XP considera somente os desafios semanais que continuam ativos. Os pontos anuais de patente permanecem acumulados.</p><div className="student-ranking-list">{ranking.top10.map((entry) => <div key={entry.studentId} className={`student-ranking-row${entry.studentId === summary.studentId ? " current" : ""}`}><span className="ranking-position">{entry.position}</span><RankBadge rankName={entry.rankName} compact /><div className="ranking-person"><strong>{entry.name} <b>{snapshot.activities.className}</b></strong><small>{entry.rankName}</small></div><div><strong>{entry.xp.toLocaleString("pt-BR")}</strong><small>XP ativo</small></div><div><strong>{entry.rankPoints.toLocaleString("pt-BR")}</strong><small>pontos anuais</small></div></div>)}</div></section>}
    {simplifiedFocus && <section className={`panel ${styles.focusRanking}`} id="ranking-turma" aria-labelledby="focus-ranking-title"><div><span className="eyebrow">RANKING DA TURMA</span><h2 id="focus-ranking-title">Sua posição no TOP 10</h2><p>O ranking completo foi resumido para facilitar a leitura.</p></div><div className={styles.focusRankValue}><Trophy size={24} /><strong>{ranking.top10.find((entry) => entry.studentId === summary.studentId)?.position ? `#${ranking.top10.find((entry) => entry.studentId === summary.studentId)!.position}` : "Fora do TOP 10"}</strong><span>{summary.xp.toLocaleString("pt-BR")} XP ativo</span></div></section>}
  </div>;
}
