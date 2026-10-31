"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, BookOpenCheck, FileText, Loader2, RefreshCw, Upload } from "lucide-react";
import { getSubject } from "@/config/catalog";
import type { SubjectId } from "@/contracts";
import { MAX_PASTED_TEXT_LENGTH, type ContentQuestion, type ContentScope } from "../model";
import { AI_UNAVAILABLE_CODES, ContentClientError, httpContentClient, type ContentClient, type ContentListing, type ImportResponse, type ScopeRef } from "../client/content-client";
import { createDemoContentClient } from "../client/demo-content-client";
import { fieldClass, QuestionReviewCard } from "./question-review-card";

type Props = { mode?: "real" | "demo" };
type Notice = { tone: "info" | "error" | "ai"; text: string } | null;
type ImportTab = "pdf" | "texto" | "exemplo";

const scopeKey = (scope: ScopeRef) => `${scope.classId}|${scope.subjectId}`;
const scopeLabel = (scope: ContentScope) => `${scope.className} · ${getSubject(scope.subjectId).name}`;

function describeError(error: unknown): Notice {
  if (error instanceof ContentClientError) {
    return { tone: AI_UNAVAILABLE_CODES.has(error.code) ? "ai" : "error", text: error.message };
  }
  return { tone: "error", text: "Algo deu errado. Tente de novo." };
}

function importSummary(result: ImportResponse): string {
  const plural = result.drafts.length === 1 ? "1 rascunho criado" : `${result.drafts.length} rascunhos criados`;
  const parts = [`${plural}. Revise cada um antes de publicar.`];
  if (result.missingSkills) {
    parts.push(result.missingSkills === 1
      ? "1 rascunho veio sem habilidade BNCC no documento: escolha o código antes de salvar."
      : `${result.missingSkills} rascunhos vieram sem habilidade BNCC no documento: escolha o código antes de salvar.`);
  }
  if (result.rejected) {
    const reasons = result.rejectedReasons.length ? ` Motivos: ${result.rejectedReasons.join(" ")}` : "";
    parts.push(`${result.rejected} trecho(s) ficaram de fora porque não viraram questão válida.${reasons} Confira a lista original.`);
  }
  return parts.join(" ");
}

function NoticeBox({ notice, onClose }: { notice: NonNullable<Notice>; onClose(): void }) {
  const styles = {
    info: "border-[#18B8EA] bg-[#E8F8FD] text-[#0B2161]",
    error: "border-red-300 bg-red-50 text-red-900",
    ai: "border-amber-300 bg-amber-50 text-amber-900",
  }[notice.tone];
  return <div role={notice.tone === "info" ? "status" : "alert"} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
    {notice.tone !== "info" && <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
    <div className="flex-1">
      {notice.tone === "ai" && <p className="font-semibold">IA indisponível agora</p>}
      <p>{notice.text}</p>
    </div>
    <button type="button" onClick={onClose} className="-my-2 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg font-semibold hover:bg-black/5" aria-label="Fechar aviso">×</button>
  </div>;
}

function PublishedItem({ question }: { question: ContentQuestion }) {
  const correct = question.body.options.find((option) => option.id === question.body.correctOptionId);
  return <li className="rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-[15px] text-slate-900">{question.body.statement}</p>
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
      <span>Gabarito: <strong className="text-[#0B2161]">{question.body.correctOptionId.toUpperCase()}) {correct?.text}</strong></span>
      <span>{question.body.skillCodes.join(", ")}</span>
      {question.publishedAt && <span>Publicada em {new Date(question.publishedAt).toLocaleDateString("pt-BR")}</span>}
    </p>
  </li>;
}

export function TeacherContentPanel({ mode = "real" }: Props) {
  const client = useMemo<ContentClient>(() => mode === "demo" ? createDemoContentClient() : httpContentClient, [mode]);
  const [scopes, setScopes] = useState<ContentScope[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [listing, setListing] = useState<ContentListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [tab, setTab] = useState<ImportTab>("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [contentTitle, setContentTitle] = useState("");
  const [activityType, setActivityType] = useState<"exercise" | "weekly_challenge">("exercise");
  const loadVersion = useRef(0);

  const scope = scopes?.find((item) => scopeKey(item) === selected) ?? null;
  const subjectOptions = useMemo<SubjectId[]>(
    () => (scopes ?? []).filter((item) => item.classId === scope?.classId).map((item) => item.subjectId),
    [scopes, scope?.classId],
  );

  useEffect(() => {
    let active = true;
    client.scopes().then((items) => {
      if (!active) return;
      setScopes(items);
      setSelected((current) => current || (items[0] ? scopeKey(items[0]) : ""));
      if (!items.length) setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setScopes([]);
      setLoading(false);
      setNotice(describeError(error));
    });
    return () => { active = false; };
  }, [client]);

  const reload = useCallback(async (target: ScopeRef) => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const result = await client.list(target);
      if (version === loadVersion.current) setListing(result);
    } catch (error) {
      if (version === loadVersion.current) { setListing(null); setNotice(describeError(error)); }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (scope) void reload({ classId: scope.classId, subjectId: scope.subjectId });
  }, [scope, reload]);

  async function runImport(action: () => Promise<ImportResponse>) {
    if (!scope || importing) return;
    if (!contentTitle.trim()) return setNotice({ tone: "error", text: "Escolha ou escreva o conteúdo da lista antes de importar." });
    setImporting(true);
    setNotice(null);
    try {
      const result = await action();
      setNotice({ tone: result.rejected ? "error" : "info", text: importSummary(result) });
      setFile(null);
      setFileInputKey((value) => value + 1);
      setText("");
      await reload({ classId: scope.classId, subjectId: scope.subjectId });
    } catch (error) {
      setNotice(describeError(error));
    } finally {
      setImporting(false);
    }
  }

  function submitImport(event: FormEvent) {
    event.preventDefault();
    if (!scope) return;
    const ref = { classId: scope.classId, subjectId: scope.subjectId, contentTitle: contentTitle.trim(), activityType };
    if (tab === "pdf") {
      if (!file) return setNotice({ tone: "error", text: "Escolha um arquivo PDF." });
      void runImport(() => client.importFile(ref, file));
    } else if (tab === "texto") {
      void runImport(() => client.importText(ref, text));
    }
  }

  function onDraftChanged(question: ContentQuestion) {
    if (!scope) return;
    const moved = question.body.subjectId !== scope.subjectId;
    if (question.status === "publicada") {
      setNotice(listing?.delivery === "aprendizagem"
        ? { tone: "info", text: question.activityType === "weekly_challenge" ? "Desafio publicado. Selecione-o na gestão de desafios para ativar para a turma." : "Exercício publicado e disponível para a turma no conteúdo selecionado." }
        : { tone: "error", text: "Publicada só nesta versão de teste. Os alunos ainda não recebem esta questão." });
    }
    else if (moved) setNotice({ tone: "info", text: `Rascunho salvo e movido para ${getSubject(question.body.subjectId).name}.` });
    else setNotice({ tone: "info", text: "Rascunho salvo." });
    setListing((current) => {
      if (!current) return current;
      const others = (items: ContentQuestion[]) => items.filter((item) => item.id !== question.id);
      if (moved) return { ...current, drafts: others(current.drafts) };
      return question.status === "publicada"
        ? { ...current, drafts: others(current.drafts), published: [...current.published, question] }
        : { ...current, drafts: current.drafts.map((item) => item.id === question.id ? question : item) };
    });
  }

  const tabButton = (value: ImportTab, label: string) => <button type="button" role="tab" aria-selected={tab === value} aria-controls="content-import-panel"
    onClick={() => setTab(value)}
    className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${tab === value ? "bg-[#0B2161] text-white" : "text-[#0B2161] hover:bg-slate-100"}`}>{label}</button>;

  return <section className="grid gap-6 text-slate-900" aria-labelledby="content-panel-title">
    <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-[#0B2161] p-5 text-white sm:p-6">
      <div>
        <p className="text-sm font-semibold text-[#DCEB0F]">Banco de questões</p>
        <h2 id="content-panel-title" className="mt-1 text-2xl font-bold">Suas listas</h2>
        <p className="mt-1 max-w-xl text-sm text-slate-200">Envie a lista, revise o gabarito e as habilidades e publique para a turma.</p>
      </div>
      {scopes && scopes.length > 0 && <div className="w-full sm:w-auto">
        <label htmlFor="content-subject" className="mb-1 block text-sm font-semibold text-white">Disciplina</label>
        <select id="content-subject" value={scope?.subjectId ?? ""} disabled={importing} onChange={(event) => {
          const next = scopes.find((item) => item.subjectId === event.target.value);
          if (next) { setSelected(scopeKey(next)); setContentTitle(""); setNotice(null); }
        }} className="mb-3 min-h-11 w-full rounded-xl border-2 border-[#18B8EA] bg-white px-3 text-[15px] font-medium text-[#0B2161] focus:ring-2 focus:ring-[#DCEB0F]">
          {[...new Set(scopes.map((item) => item.subjectId))].map((id) => <option key={id} value={id}>{getSubject(id).name}</option>)}
        </select>
        <label htmlFor="content-scope" className="mb-1 block text-sm font-semibold text-white">Turma</label>
        <select id="content-scope" value={selected} disabled={importing} onChange={(event) => { setSelected(event.target.value); setContentTitle(""); setNotice(null); }}
          className="min-h-11 w-full rounded-xl border-2 border-[#18B8EA] bg-white px-3 text-[15px] font-medium text-[#0B2161] focus:outline-none focus:ring-2 focus:ring-[#DCEB0F] sm:min-w-72">
          {scopes.filter((item) => item.subjectId === scope?.subjectId).map((item) => <option key={scopeKey(item)} value={scopeKey(item)}>{scopeLabel(item)}</option>)}
        </select>
      </div>}
    </header>

    {mode === "demo" && <p className="rounded-xl border border-[#18B8EA] bg-[#E8F8FD] px-4 py-3 text-sm text-[#0B2161]">Demonstração com turma fictícia. Nada é salvo no servidor e a leitura por IA está desligada.</p>}
    {listing?.storage === "memoria" && mode === "real" && <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Versão de teste: rascunhos e publicadas ficam na memória do servidor e somem quando ele reinicia.{listing.delivery === "memoria" ? " Questão publicada aqui ainda não chega aos alunos." : ""}</p>}
    {listing?.delivery === "desligada" && <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">A publicação para os alunos ainda não está ligada neste ambiente. Dá para importar e revisar, mas não publicar.</p>}
    {notice && <NoticeBox notice={notice} onClose={() => setNotice(null)} />}

    {scopes === null && <p className="flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="animate-spin" size={18} aria-hidden="true" /> Carregando suas turmas…</p>}
    {scopes?.length === 0 && !notice && <p className="rounded-xl border border-slate-200 bg-white p-5 text-[15px]">Você ainda não tem turma e matéria atribuídas. Peça à coordenação para fazer a atribuição.</p>}

    {scope && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="content-import-title">
        <h3 id="content-import-title" className="flex items-center gap-2 text-lg font-bold text-[#0B2161]"><Upload size={20} aria-hidden="true" /> Adicionar questões</h3>
        <p className="mt-1 text-sm text-slate-600">{scope.grade}º ano · {getSubject(scope.subjectId).name}. Tudo entra como rascunho.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="content-title" className="mb-1 block text-sm font-semibold text-[#0B2161]">Conteúdo da disciplina</label>
            <input id="content-title" list="content-topics" className={fieldClass} value={contentTitle} maxLength={100} disabled={importing}
              onChange={(event) => setContentTitle(event.target.value)} placeholder="Ex.: Frações ou Verbos" />
            <datalist id="content-topics">{[...new Set([...(listing?.drafts ?? []), ...(listing?.published ?? [])].map((item) => item.contentTitle).filter(Boolean))]
              .map((title) => <option key={title} value={title} />)}</datalist>
            <p className="mt-1 text-sm text-slate-600">Selecione um conteúdo existente ou escreva um novo. O aluno verá essa mesma organização.</p>
          </div>
          <div><label htmlFor="content-type" className="mb-1 block text-sm font-semibold text-[#0B2161]">Tipo de atividade</label>
            <select id="content-type" className={fieldClass} value={activityType} disabled={importing} onChange={(event) => setActivityType(event.target.value as typeof activityType)}>
              <option value="exercise">Lista de exercícios · 50 pontos de patente</option><option value="weekly_challenge">Desafios semanais · 100 de patente e 100 XP</option>
            </select><p className="mt-1 text-sm text-slate-600">As listas ficam disponíveis ao publicar. Desafios entram na seleção de dez da disciplina.</p>
          </div>
        </div>
        <div role="tablist" aria-label="Forma de envio" className="mt-4 flex flex-wrap gap-2">
          {tabButton("pdf", "Enviar arquivo")}{tabButton("texto", "Colar texto")}{tabButton("exemplo", "Usar exemplo")}
        </div>
        <form id="content-import-panel" role="tabpanel" onSubmit={submitImport} className="mt-4 grid gap-3">
          {tab === "pdf" && <>
            <label htmlFor="content-file" className="text-sm font-semibold text-[#0B2161]">Arquivo PDF ou Word .docx (até 10 MB)</label>
            <input key={fileInputKey} id="content-file" type="file" accept="application/pdf,.pdf,.doc,.docx" aria-describedby="content-file-help"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="min-h-11 w-full rounded-xl border border-dashed border-slate-400 bg-slate-50 p-2 text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-[#0B2161] file:px-4 file:font-semibold file:text-white" />
            <p id="content-file-help" className="text-sm text-slate-600">O PDF precisa ter texto selecionável; arquivo escaneado ainda não é lido. Do Word, só .docx: um .doc antigo precisa ser salvo de novo como .docx.</p>
          </>}
          {tab === "texto" && <>
            <label htmlFor="content-text" className="text-sm font-semibold text-[#0B2161]">Texto das questões, com alternativas e gabarito</label>
            <textarea id="content-text" value={text} maxLength={MAX_PASTED_TEXT_LENGTH} onChange={(event) => setText(event.target.value)}
              className={`${fieldClass} min-h-40`} placeholder={"1) Quanto é −3 + 8?\na) 5  b) −11  c) 11  d) −5\nGabarito: a"} />
          </>}
          {tab === "exemplo" && <div className="grid gap-2">
            <p className="text-sm text-slate-600">Exemplos escritos pela equipe para testar o fluxo. Não substituem a sua lista.</p>
            {listing?.examples.length ? <ul className="grid gap-2">
              {listing.examples.map((example) => <li key={example.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">{example.statement}</p>
                  <p className="mt-1 text-sm text-slate-600">{example.skillCodes.join(", ")}{example.skillCheck === "a_conferir" ? " · habilidade a conferir" : ""}</p>
                </div>
                <button type="button" disabled={importing || !contentTitle.trim()} onClick={() => void runImport(() => client.importExample({ classId: scope.classId, subjectId: scope.subjectId, contentTitle: contentTitle.trim(), activityType }, example.id))}
                  className="min-h-11 rounded-xl border-2 border-[#0B2161] px-4 text-sm font-semibold text-[#0B2161] hover:bg-slate-50 disabled:opacity-50">Usar como rascunho</button>
              </li>)}
            </ul> : <p className="text-sm text-slate-700">Não há exemplos para esta série e matéria.</p>}
          </div>}
          {tab !== "exemplo" && <div>
            <button type="submit" disabled={importing || !contentTitle.trim() || (tab === "texto" && text.trim().length < 20)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#DCEB0F] px-5 text-sm font-bold text-[#0B2161] hover:bg-[#cbd90d] disabled:cursor-not-allowed disabled:opacity-50">
              {importing ? <><Loader2 className="animate-spin" size={16} aria-hidden="true" /> Lendo questões…</> : <><FileText size={16} aria-hidden="true" /> Ler questões</>}
            </button>
          </div>}
        </form>
      </section>

      <section aria-labelledby="content-drafts-title" aria-busy={loading}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id="content-drafts-title" className="text-lg font-bold text-[#0B2161]">Rascunhos {listing ? `(${listing.drafts.length})` : ""}</h3>
          <button type="button" onClick={() => void reload({ classId: scope.classId, subjectId: scope.subjectId })}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#0B2161] hover:bg-slate-100">
            <RefreshCw size={16} aria-hidden="true" /> Atualizar
          </button>
        </div>
        {loading && <p className="flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="animate-spin" size={18} aria-hidden="true" /> Carregando questões…</p>}
        {!loading && listing && listing.drafts.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">Nenhum rascunho. Envie uma lista acima.</p>}
        {!loading && listing && <div className="grid gap-4">
          {listing.drafts.map((question) => <QuestionReviewCard key={question.id} question={question} client={client} subjectOptions={subjectOptions}
            onChanged={onDraftChanged}
            onRemoved={(id) => { setListing((current) => current && { ...current, drafts: current.drafts.filter((item) => item.id !== id) }); setNotice({ tone: "info", text: "Rascunho descartado." }); }}
            onError={(error) => { setNotice(describeError(error)); void reload({ classId: scope.classId, subjectId: scope.subjectId }); }} />)}
        </div>}
      </section>

      <section aria-labelledby="content-published-title">
        <h3 id="content-published-title" className="mb-3 flex items-center gap-2 text-lg font-bold text-[#0B2161]"><BookOpenCheck size={20} aria-hidden="true" /> Publicadas {listing ? `(${listing.published.length})` : ""}</h3>
        {!loading && listing && listing.published.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">Nenhuma questão publicada nesta turma e matéria.</p>}
        {!loading && listing && listing.published.length > 0 && <ul className="grid gap-3">{listing.published.map((question) => <PublishedItem key={question.id} question={question} />)}</ul>}
      </section>
    </>}
  </section>;
}
