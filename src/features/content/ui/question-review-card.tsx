"use client";

import { useId, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { GRADES, SUBJECTS } from "@/config/catalog";
import type { GeneratedQuestion, SubjectId } from "@/contracts";
import type { ContentQuestion } from "../model";
import { ContentClientError, type ContentClient } from "../client/content-client";

type Props = {
  question: ContentQuestion;
  client: ContentClient;
  subjectOptions: SubjectId[];
  onChanged(question: ContentQuestion): void;
  onRemoved(id: string): void;
  onError(error: unknown): void;
};

type Form = {
  statement: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  skillCodes: string;
  grade: number;
  subjectId: SubjectId;
  difficulty: GeneratedQuestion["difficulty"];
  explanation: string;
  hint: string;
  reviewed: boolean;
};

const DIFFICULTY_LABELS = { facil: "Fácil", media: "Média", dificil: "Difícil" } as const;
const ORIGIN_LABELS = { pdf: "PDF", docx: "Word", texto: "Texto colado", exemplo: "Exemplo de demonstração" } as const;

function toForm(question: ContentQuestion): Form {
  const { body } = question;
  return {
    statement: body.statement, options: body.options.map((option) => ({ ...option })), correctOptionId: body.correctOptionId,
    skillCodes: body.skillCodes.join(", "), grade: body.grade, subjectId: body.subjectId, difficulty: body.difficulty,
    explanation: body.explanation, hint: body.hint, reviewed: question.reviewed,
  };
}

function toBody(form: Form): GeneratedQuestion {
  return {
    subjectId: form.subjectId,
    grade: form.grade as GeneratedQuestion["grade"],
    skillCodes: form.skillCodes.split(/[\s,;]+/).map((code) => code.trim().toUpperCase()).filter(Boolean),
    statement: form.statement,
    options: form.options,
    correctOptionId: form.correctOptionId,
    explanation: form.explanation,
    hint: form.hint,
    difficulty: form.difficulty,
  };
}

function nextOptionId(options: Form["options"]) {
  for (let code = 97; code < 123; code++) {
    const id = String.fromCharCode(code);
    if (!options.some((option) => option.id === id)) return id;
  }
  return `op-${options.length + 1}`;
}

export const fieldClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 focus:border-[#0B2161] focus:outline-none focus:ring-2 focus:ring-[#18B8EA]";
const labelClass = "mb-1 block text-sm font-semibold text-[#0B2161]";

export function QuestionReviewCard({ question, client, subjectOptions, onChanged, onRemoved, onError }: Props) {
  const uid = useId();
  const [form, setForm] = useState<Form>(() => toForm(question));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | "delete" | null>(null);
  const [issues, setIssues] = useState<Array<{ path: string; message: string }>>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const issueFor = (prefix: string) => issues.filter((issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`));

  async function run(kind: "save" | "publish" | "delete") {
    setBusy(kind);
    setIssues([]);
    try {
      if (kind === "save") {
        const saved = await client.saveDraft(question.id, { version: question.version, reviewed: form.reviewed, body: toBody(form) });
        setDirty(false);
        onChanged(saved);
      } else if (kind === "publish") {
        onChanged(await client.publish(question.id));
      } else {
        await client.deleteDraft(question.id);
        onRemoved(question.id);
      }
    } catch (error) {
      if (error instanceof ContentClientError && error.issues.length) setIssues(error.issues.map((issue) => ({ ...issue, path: issue.path.replace(/^body\./, "") })));
      onError(error);
    } finally {
      setBusy(null);
    }
  }

  const keyConfirmed = question.answerKeySource === "professor";
  const frozen = question.status === "publicando";
  const canPublish = !dirty && question.reviewed && keyConfirmed && !busy;
  const publishHint = dirty ? "Salve as alterações antes de publicar."
    : !question.reviewed ? "Marque a revisão e salve para liberar a publicação."
    : !keyConfirmed ? "Salve o rascunho para confirmar o gabarito." : "";
  const id = (name: string) => `${uid}-${name}`;
  const errorText = (path: string) => issueFor(path).map((issue) => <p key={issue.path + issue.message} className="mt-1 text-sm text-red-700">{issue.message}</p>);

  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby={id("title")}>
    <header className="mb-4 flex flex-wrap items-center gap-2">
      <h4 id={id("title")} className="text-base font-bold text-[#0B2161]">{frozen ? "Concluir publicação" : "Rascunho"}</h4>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{ORIGIN_LABELS[question.origin.kind]}{question.origin.kind === "pdf" || question.origin.kind === "docx" ? `: ${question.origin.fileName}` : ""}</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">Original</span>
      {dirty && <span className="rounded-full bg-[#DCEB0F] px-2.5 py-1 text-xs font-semibold text-[#0B2161]">Alterações não salvas</span>}
    </header>

    {question.body.skillCodes.length === 0 && <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      O documento não trazia habilidade BNCC para esta questão. Escreva o código no campo Habilidades BNCC antes de salvar.
    </p>}

    {!keyConfirmed && <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {question.answerKeySource === "ia" ? "O gabarito marcado veio da leitura automática." : "O gabarito marcado veio do exemplo."} Confira e marque a alternativa certa da sua lista.
    </p>}

    {frozen && <p role="status" className="mb-4 text-sm text-slate-700">Esta versão revisada está reservada para publicação. Use Concluir publicação para retomar com segurança.</p>}
    <fieldset disabled={frozen || !!busy} className="grid gap-4">
      <div>
        <label htmlFor={id("statement")} className={labelClass}>Enunciado</label>
        <textarea id={id("statement")} className={`${fieldClass} min-h-28`} value={form.statement} onChange={(event) => update({ statement: event.target.value })} />
        {errorText("statement")}
      </div>

      <fieldset>
        <legend className={labelClass}>Alternativas e gabarito</legend>
        <p className="mb-2 text-sm text-slate-600">Marque a alternativa correta.</p>
        <ul className="grid gap-2">
          {form.options.map((option, index) => <li key={option.id} className="flex items-center gap-2">
            <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-300 has-[:checked]:border-[#0B2161] has-[:checked]:bg-[#0B2161] has-[:checked]:text-white">
              <input type="radio" className="sr-only" name={id("correct")} checked={form.correctOptionId === option.id} onChange={() => update({ correctOptionId: option.id })} />
              <span className="text-sm font-bold uppercase" aria-hidden="true">{option.id}</span>
              <span className="sr-only">Marcar alternativa {option.id.toUpperCase()} como correta</span>
            </label>
            <label htmlFor={id(`option-${option.id}`)} className="sr-only">Texto da alternativa {option.id.toUpperCase()}</label>
            <input id={id(`option-${option.id}`)} className={fieldClass} value={option.text}
              onChange={(event) => update({ options: form.options.map((item, position) => position === index ? { ...item, text: event.target.value } : item) })} />
            <button type="button" disabled={form.options.length <= 2}
              onClick={() => update({ options: form.options.filter((item) => item.id !== option.id), correctOptionId: form.correctOptionId === option.id ? "" : form.correctOptionId })}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-40" aria-label={`Remover alternativa ${option.id.toUpperCase()}`}>
              <X size={18} />
            </button>
          </li>)}
        </ul>
        {form.options.length < 6 && <button type="button" onClick={() => update({ options: [...form.options, { id: nextOptionId(form.options), text: "" }] })}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#0B2161] hover:bg-slate-100">
          <Plus size={16} /> Adicionar alternativa
        </button>}
        {errorText("options")}{errorText("correctOptionId")}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={id("subject")} className={labelClass}>Matéria</label>
          <select id={id("subject")} className={fieldClass} value={form.subjectId} onChange={(event) => update({ subjectId: event.target.value as SubjectId })}>
            {SUBJECTS.filter((subject) => subjectOptions.includes(subject.id)).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id("grade")} className={labelClass}>Série</label>
          <select id={id("grade")} className={fieldClass} value={form.grade} onChange={(event) => update({ grade: Number(event.target.value) })}>
            {GRADES.map((grade) => <option key={grade} value={grade}>{grade}º ano</option>)}
          </select>
          {errorText("grade")}
        </div>
        <div>
          <label htmlFor={id("difficulty")} className={labelClass}>Dificuldade</label>
          <select id={id("difficulty")} className={fieldClass} value={form.difficulty} onChange={(event) => update({ difficulty: event.target.value as Form["difficulty"] })}>
            {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={id("skills")} className={labelClass}>Habilidades BNCC</label>
        <input id={id("skills")} className={fieldClass} value={form.skillCodes} aria-describedby={id("skills-help")} onChange={(event) => update({ skillCodes: event.target.value })} />
        <p id={id("skills-help")} className="mt-1 text-sm text-slate-600">Códigos separados por vírgula, por exemplo EF07MA04. O sistema confere o formato, a matéria e a série. A existência do código na BNCC é com você.</p>
        {errorText("skillCodes")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id("explanation")} className={labelClass}>Explicação mostrada após a resposta</label>
          <textarea id={id("explanation")} className={`${fieldClass} min-h-24`} value={form.explanation} onChange={(event) => update({ explanation: event.target.value })} />
          {errorText("explanation")}
        </div>
        <div>
          <label htmlFor={id("hint")} className={labelClass}>Dica</label>
          <textarea id={id("hint")} className={`${fieldClass} min-h-24`} value={form.hint} onChange={(event) => update({ hint: event.target.value })} />
          {errorText("hint")}
        </div>
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[#0B2161]" checked={form.reviewed} onChange={(event) => update({ reviewed: event.target.checked })} />
        <span className="text-sm text-slate-800">Revisei enunciado, alternativas, gabarito, série, matéria e habilidades.</span>
      </label>
    </fieldset>

    <footer className="mt-5 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => run("save")} disabled={frozen || !!busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#0B2161] px-4 text-sm font-semibold text-[#0B2161] hover:bg-slate-50 disabled:opacity-50">
        {busy === "save" ? "Salvando…" : "Salvar rascunho"}
      </button>
      <button type="button" onClick={() => run("publish")} disabled={!canPublish} aria-describedby={publishHint ? id("publish-help") : undefined}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0B2161] px-4 text-sm font-semibold text-white hover:bg-[#13307f] disabled:cursor-not-allowed disabled:opacity-50">
        <Check size={16} /> {busy === "publish" ? "Publicando…" : frozen ? "Concluir publicação" : "Publicar"}
      </button>
      {confirmDelete
        ? <span className="inline-flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => run("delete")} disabled={!!busy} className="inline-flex min-h-11 items-center rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">Apagar rascunho</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancelar</button>
          </span>
        : <button type="button" onClick={() => setConfirmDelete(true)} disabled={frozen || !!busy}
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
            <Trash2 size={16} /> Descartar
          </button>}
      {publishHint && <p id={id("publish-help")} className="w-full text-sm text-slate-600">{publishHint}</p>}
    </footer>
  </article>;
}
