import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, CalendarDays, Info, Medal, Target, TriangleAlert, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSubject } from "@/config/catalog";
import type { ClassOverview, ImprovementReason, SkillDifficulty, TeacherOverview } from "../domain/model";

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const REASON_LABELS: Record<ImprovementReason, string> = {
  sem_atividade: "Sem respostas na semana",
  acerto_baixo: "Acerto abaixo de 60%",
  pouca_atividade: "Poucos dias com atividade",
};

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function formatPercent(value: number | null) {
  return value === null ? "Sem dados" : percent.format(value);
}

function Bar({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="block h-2.5 w-full overflow-hidden rounded-full bg-[#E3E8F4]">
      <span className="block h-full rounded-full bg-[#0B2161]" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </span>
  );
}

function StatCard({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-[#D5DCEB] bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#3B4664]">
        <span className="grid size-8 place-items-center rounded-lg bg-[#E6F7FD] text-[#0B2161]"><Icon size={18} aria-hidden="true" /></span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-[#0B2161]">{value}</p>
      <p className="text-sm text-[#4A5570]">{note}</p>
    </div>
  );
}

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-[#D5DCEB] bg-white p-5">
      <h3 id={id} className="text-base font-bold text-[#0B2161]">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[#4A5570]">{children}</p>;
}

function DifficultyTable({ caption, items, collective }: { caption: string; items: SkillDifficulty[]; collective: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[#D5DCEB] text-[#3B4664]">
            <th scope="col" className="py-2 pr-3 font-semibold">Habilidade</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Matéria</th>
            <th scope="col" className="py-2 font-semibold">{collective ? "Alunos" : "Quem"}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.skillCode} className="border-b border-[#EEF1F7] last:border-0">
              <th scope="row" className="py-2 pr-3 font-mono font-semibold text-[#0B2161]">{item.skillCode}</th>
              <td className="py-2 pr-3">{getSubject(item.subjectId).name}</td>
              <td className="py-2">
                {collective
                  ? `${item.studentCount} (${percent.format(item.share)} da turma com respostas)`
                  : item.students.map((student) => student.displayName).join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClassSection({ overview, demo }: { overview: ClassOverview; demo: boolean }) {
  const prefix = `turma-${overview.classId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { engagement } = overview;
  const engagementLabel = engagement.basis === "acesso" ? "dias com acesso" : "dias com respostas";
  return (
    <section aria-labelledby={`${prefix}-titulo`} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`${prefix}-titulo`} className="text-xl font-bold text-[#0B2161]">{overview.className}</h2>
        <span className="rounded-full bg-[#E6F7FD] px-3 py-1 text-sm font-semibold text-[#0B2161]">{overview.grade}º ano</span>
        {demo && <span className="rounded-full bg-[#DCEB0F] px-3 py-1 text-sm font-bold text-[#0B2161]">Demonstração</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Alunos" value={String(overview.studentsEnrolled)} note={`${overview.studentsWithData} responderam nesta semana`} />
        <StatCard icon={Target} label="Taxa de acerto" value={formatPercent(overview.accuracy)} note="Nas matérias que você leciona" />
        <StatCard icon={CalendarDays} label="Engajamento" value={formatPercent(engagement.studentsTotal ? engagement.rate : null)}
          note={`Média de ${decimal.format(engagement.averageDays)} de ${engagement.periodDays} ${engagementLabel}`} />
        <StatCard icon={TriangleAlert} label="Sem atividade" value={String(engagement.buckets.none)} note="Alunos sem nenhum dia ativo na semana" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id={`${prefix}-progresso`} title="Atividades da semana por matéria">
          <ul className="space-y-3">
            {overview.subjects.map((subject) => (
              <li key={subject.subjectId}>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold text-[#0B2161]">{subject.subjectName}</span>
                  <span className="text-[#3B4664]">
                    {subject.completion !== null
                      ? `${percent.format(subject.completion)} (${subject.answeredOriginals} de ${subject.expectedAnswers} respostas)`
                      : subject.answeredOriginals !== null ? `${subject.answeredOriginals} respostas` : "Sem dado por matéria"}
                  </span>
                </div>
                {subject.completion !== null && <div className="mt-1.5"><Bar value={subject.completion} /></div>}
              </li>
            ))}
          </ul>
        </Card>

        <Card id={`${prefix}-engajamento`} title="Frequência na semana">
          <p className="text-sm text-[#3B4664]">Contamos {engagementLabel} entre os {engagement.studentsTotal} alunos com resumo.</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Nenhum dia", value: engagement.buckets.none },
              { label: "Pouco", value: engagement.buckets.low },
              { label: "Regular", value: engagement.buckets.regular },
            ].map((bucket) => (
              <div key={bucket.label} className="rounded-xl bg-[#F3F6FB] p-3">
                <dt className="text-sm text-[#3B4664]">{bucket.label}</dt>
                <dd className="text-xl font-bold text-[#0B2161]">{bucket.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card id={`${prefix}-melhorar`} title="Alunos que precisam de mais atenção">
        {overview.studentsToImprove.length === 0 ? <Empty>Ninguém abaixo dos limites nesta semana.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <caption className="sr-only">Alunos com acerto baixo ou poucos dias ativos</caption>
              <thead>
                <tr className="border-b border-[#D5DCEB] text-[#3B4664]">
                  <th scope="col" className="py-2 pr-3 font-semibold">Aluno</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Acerto</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Respostas</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Dias ativos</th>
                  <th scope="col" className="py-2 font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {overview.studentsToImprove.map((student) => (
                  <tr key={student.studentId} className="border-b border-[#EEF1F7] last:border-0">
                    <th scope="row" className="py-2 pr-3 font-semibold text-[#0B2161]">{student.displayName}</th>
                    <td className="py-2 pr-3">{formatPercent(student.accuracy)}</td>
                    <td className="py-2 pr-3">{student.answered}</td>
                    <td className="py-2 pr-3">{student.engagedDays}</td>
                    <td className="py-2">{student.reasons.map((reason) => REASON_LABELS[reason]).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id={`${prefix}-coletivas`} title="Dificuldades da turma (30% ou mais)">
          {overview.collectiveDifficulties.length === 0
            ? <Empty>Nenhuma habilidade passou de 30% dos alunos com respostas.</Empty>
            : <DifficultyTable caption="Habilidades difíceis para boa parte da turma" items={overview.collectiveDifficulties} collective />}
        </Card>
        <Card id={`${prefix}-individuais`} title="Dificuldades individuais">
          {overview.individualDifficulties.length === 0
            ? <Empty>Sem dificuldades isoladas registradas.</Empty>
            : <DifficultyTable caption="Habilidades difíceis para poucos alunos" items={overview.individualDifficulties} collective={false} />}
        </Card>
      </div>

      {overview.topStudents.length > 0 && (
        <Card id={`${prefix}-destaques`} title="Mais XP na turma">
          <ol className="flex flex-wrap gap-2">
            {overview.topStudents.map((student) => (
              <li key={student.position} className="flex items-center gap-2 rounded-full bg-[#F3F6FB] px-3 py-1.5 text-sm text-[#0B2161]">
                <Medal size={16} aria-hidden="true" />
                <span className="font-semibold">{student.position}º</span> {student.displayName} ({decimal.format(student.xp)} XP)
              </li>
            ))}
          </ol>
        </Card>
      )}

      {overview.notes.length > 0 && (
        <ul className="space-y-1 text-sm text-[#3B4664]">
          {overview.notes.map((note) => (
            <li key={note} className="flex gap-2"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TeacherOverviewPanel({ overview }: { overview: TeacherOverview }) {
  const demo = overview.source === "fake";
  return (
    <div className="space-y-6 text-[#1B2540]">
      <header className="rounded-2xl border-t-4 border-[#18B8EA] bg-white p-5">
        <p className="text-sm font-semibold text-[#3B4664]">Semana de {shortDate(overview.period.from)} a {shortDate(overview.period.to)}</p>
        <h1 className="mt-1 text-2xl font-bold text-[#0B2161]">Suas turmas nesta semana</h1>
        <nav aria-label="Ações do professor" className="mt-4 flex flex-wrap gap-3">
          <Link href="/professor/reconhecer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0B2161] px-4 font-semibold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#18B8EA]">
            <Medal size={18} aria-hidden="true" />Dar pontos por comportamento
          </Link>
          <Link href="#questoes" className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#0B2161] bg-white px-4 font-semibold text-[#0B2161] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#18B8EA]">
            <BookOpenCheck size={18} aria-hidden="true" />Questões e listas<ArrowRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      {overview.notices.length > 0 && (
        <div role="note" className={`rounded-2xl p-4 text-sm font-semibold text-[#0B2161] ${demo ? "bg-[#DCEB0F]" : "bg-[#E6F7FD]"}`}>
          <ul className="space-y-1">{overview.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul>
        </div>
      )}

      {overview.unavailableClasses.map((item) => (
        <div key={item.classId} role="alert" className="rounded-2xl border border-[#B42318] bg-[#FEF3F2] p-4 text-sm text-[#7A271A]">
          Uma das suas turmas ficou sem dados agora. {item.message}
        </div>
      ))}

      {overview.classes.map((item) => <ClassSection key={item.classId} overview={item} demo={demo} />)}
    </div>
  );
}

export default TeacherOverviewPanel;
