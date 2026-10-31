"use client";

import type { FormEvent } from "react";
import type { GuardianLinkRecord, PersonRecord } from "../model";
import type { IssuedLink } from "./access-link";
import { rosterApi } from "./api";
import styles from "./roster.module.css";

const STATUS_LABELS: Record<GuardianLinkRecord["status"], string> = { pending: "Pendente", confirmed: "Confirmado", revoked: "Revogado" };

interface GuardianPanelProps {
  students: PersonRecord[];
  guardians: PersonRecord[];
  links: GuardianLinkRecord[];
  busy: boolean;
  act(work: () => Promise<unknown>, success: string): Promise<void>;
  onLinkIssued(issued: IssuedLink): void;
  issueLink(person: { id: string; name: string }): void;
}

export function GuardianPanel({ students, guardians, links, busy, act, onLinkIssued, issueLink }: GuardianPanelProps) {
  const visible = links.filter((link) => students.some((student) => student.id === link.studentId));
  const nameOf = (people: PersonRecord[], id: string) => people.find((person) => person.id === id)?.fullName ?? "Pessoa";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void act(async () => {
      const fullName = String(fields.get("fullName"));
      const created = await rosterApi.linkGuardian({ studentId: String(fields.get("studentId")), fullName, email: String(fields.get("email")) });
      if (created.accessLink) onLinkIssued({ name: fullName, link: created.accessLink });
      form.reset();
    }, "Vínculo criado como pendente.");
  }

  function setStatus(link: GuardianLinkRecord, status: "confirmed" | "revoked") {
    const question = status === "confirmed" ? "A escola verificou este vínculo? O responsável passará a ver os dados do aluno." : "Revogar este vínculo? O acesso ao aluno será retirado.";
    if (window.confirm(question)) void act(() => rosterApi.setGuardianLink(link.id, status), status === "confirmed" ? "Vínculo confirmado." : "Vínculo revogado.");
  }

  return <section className="panel" id="vinculos">
    <div className="panel-heading"><div><span className="eyebrow">FAMÍLIA</span><h2>Responsáveis da turma</h2></div></div>
    <p className="panel-description">O acesso aos dados do aluno só começa depois que a escola confirma o vínculo. Um email novo gera um link de cadastro.</p>
    {visible.length === 0 && <p className={styles.empty}>Nenhum vínculo nesta turma.</p>}
    {visible.map((link) => <div className={styles.row} key={link.id}>
      <span>{nameOf(guardians, link.guardianId)}<small>{nameOf(students, link.studentId)} · {STATUS_LABELS[link.status]}</small></span>
      <span>
        <button type="button" className={styles.link} disabled={busy} onClick={() => issueLink({ id: link.guardianId, name: nameOf(guardians, link.guardianId) })}>Novo link</button>
        {link.status !== "confirmed" && <button type="button" className={styles.link} disabled={busy} onClick={() => setStatus(link, "confirmed")}>Confirmar</button>}
        {link.status !== "revoked" && <button type="button" className={`${styles.link} ${styles.danger}`} disabled={busy} onClick={() => setStatus(link, "revoked")}>Revogar</button>}
      </span>
    </div>)}
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>Aluno<select name="studentId" defaultValue="" required><option value="" disabled>Selecionar…</option>{students.map((student) => <option key={student.id} value={student.id}>{student.fullName}</option>)}</select></label>
      <label className={styles.field}>Nome do responsável<input name="fullName" required maxLength={200} /></label>
      <label className={styles.field}>Email<input name="email" type="email" required maxLength={320} /></label>
      <button type="submit" className="button button-outline" disabled={busy}>Vincular</button>
    </form>
  </section>;
}
