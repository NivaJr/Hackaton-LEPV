import { describe, expect, it } from "vitest";
import {
  RECOGNITION_POINTS, RecognitionError, RecognitionRequestSchema, initialsOf, recognitionDay, sortNotifications,
} from "@/features/recognition/model";
import {
  CLASS_A, CLASS_B, OTHER_SCHOOL, SCHOOL, actor, coordinator, createFixture, grantBody, guardian, otherTeacher, student, teacher,
} from "./recognition-fixtures";

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Era esperado erro.");
}

describe("regras puras do reconhecimento", () => {
  it("usa o dia de São Paulo, inclusive perto da meia-noite UTC", () => {
    expect(recognitionDay(new Date("2026-11-01T02:30:00.000Z"))).toBe("2026-10-31");
    expect(recognitionDay(new Date("2026-11-01T03:00:00.000Z"))).toBe("2026-11-01");
  });

  it("exige nota curta quando o motivo é outro", () => {
    expect(RecognitionRequestSchema.safeParse(grantBody({ reason: "outro" })).success).toBe(false);
    expect(RecognitionRequestSchema.safeParse(grantBody({ reason: "outro", note: "   " })).success).toBe(false);
    expect(RecognitionRequestSchema.safeParse(grantBody({ reason: "outro", note: "Explicou a lição ao colega" })).success).toBe(true);
    expect(RecognitionRequestSchema.safeParse(grantBody({ note: "x".repeat(141) })).success).toBe(false);
  });

  it.each(["points", "teacherId", "schoolId", "day"])("rejeita campo %s vindo do cliente", (field) => {
    expect(RecognitionRequestSchema.safeParse(grantBody({ [field]: "100" })).success).toBe(false);
  });

  it("monta iniciais e ordena avisos não lidos primeiro", () => {
    expect(initialsOf("ana souza lima")).toBe("AL");
    expect(initialsOf("Bruno")).toBe("B");
    const sorted = sortNotifications([
      { id: "a", readAt: "2026-10-31T10:00:00.000Z", createdAt: "2026-10-31T12:00:00.000Z" },
      { id: "b", readAt: null, createdAt: "2026-10-30T12:00:00.000Z" },
      { id: "c", readAt: null, createdAt: "2026-10-31T09:00:00.000Z" },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["c", "b", "a"]);
  });
});

describe("autorização para dar pontos", () => {
  it("concede 20 pontos ao aluno com matrícula ativa na turma atribuída", async () => {
    const { service, store } = createFixture();
    const response = await service.grant(teacher(), "Marta Ramos", grantBody());
    expect(response.results).toEqual([{
      studentId: "student-ana", status: "concedido", recognitionId: "recognition-1", points: RECOGNITION_POINTS,
      repeated: false, remainingToday: 2,
    }]);
    expect(store.recognitions[0]).toMatchObject({ teacherId: "teacher-1", schoolId: SCHOOL, points: 20, schoolYear: 2026, day: "2026-10-31" });
  });

  it("recusa professor de outra turma", async () => {
    const { service, store } = createFixture();
    const error = await rejection(service.grant(otherTeacher(), "Outro", grantBody()));
    expect(error).toBeInstanceOf(RecognitionError);
    expect((error as RecognitionError).status).toBe(403);
    expect(store.recognitions).toHaveLength(0);
  });

  it("recusa matéria que o professor não leciona na turma", async () => {
    const { service } = createFixture();
    const error = await rejection(service.grant(teacher(), "Marta", grantBody({ subjectId: "historia" })));
    expect((error as RecognitionError).status).toBe(403);
  });

  it("ignora atribuição de outra escola mesmo com o mesmo ID de turma", async () => {
    const { service } = createFixture();
    const intruder = actor({
      userId: "teacher-9", roles: ["professor"], institutionId: OTHER_SCHOOL,
      teacherAssignments: [{ institutionId: OTHER_SCHOOL, classId: CLASS_A, subjectId: "matematica" }],
    });
    const error = await rejection(service.grant(intruder, "X", grantBody()));
    expect((error as RecognitionError).code).toBe("CLASS_NOT_FOUND");
  });

  it("recusa aluno e responsável", async () => {
    const { service } = createFixture();
    expect(((await rejection(service.grant(student(), "Ana", grantBody()))) as RecognitionError).status).toBe(403);
    expect(((await rejection(service.grant(guardian(["student-ana"]), "Mãe", grantBody()))) as RecognitionError).status).toBe(403);
  });

  it("marca sem_vinculo para aluno transferido ou de outra turma, sem gravar", async () => {
    const { service, store } = createFixture();
    const response = await service.grant(teacher(), "Marta", grantBody({ studentIds: ["student-caio", "student-duda", "student-ana"] }));
    expect(response.results.map((item) => item.status)).toEqual(["sem_vinculo", "sem_vinculo", "concedido"]);
    expect(store.recognitions.map((item) => item.studentId)).toEqual(["student-ana"]);
  });

  it("premia vários alunos de uma vez, um registro por aluno, sem repetir IDs duplicados", async () => {
    const { service, store } = createFixture();
    const response = await service.grant(teacher(), "Marta", grantBody({ studentIds: ["student-ana", "student-bruno", "student-ana"] }));
    expect(response.results).toHaveLength(2);
    expect(store.recognitions).toHaveLength(2);
  });
});

describe("limite diário e idempotência", () => {
  it("permite 3 por aluno por dia por professor e recusa o quarto", async () => {
    const { service, store } = createFixture();
    for (let index = 1; index <= 3; index += 1) {
      const response = await service.grant(teacher(), "Marta", grantBody({ idempotencyKey: `key-day-${index}000` }));
      expect(response.results[0]).toMatchObject({ status: "concedido", remainingToday: 3 - index });
    }
    const fourth = await service.grant(teacher(), "Marta", grantBody({ idempotencyKey: "key-day-4000" }));
    expect(fourth.results[0]).toMatchObject({ status: "limite_diario", points: 0, remainingToday: 0 });
    expect(store.recognitions).toHaveLength(3);
  });

  it("libera de novo à meia-noite de São Paulo, não à meia-noite UTC", async () => {
    const { service, setNow } = createFixture(new Date("2026-10-31T23:00:00.000Z"));
    for (let index = 1; index <= 3; index += 1) await service.grant(teacher(), "Marta", grantBody({ idempotencyKey: `key-tz-${index}0000` }));
    setNow("2026-11-01T02:59:00.000Z");
    expect((await service.grant(teacher(), "Marta", grantBody({ idempotencyKey: "key-tz-40000" }))).results[0]!.status).toBe("limite_diario");
    setNow("2026-11-01T03:01:00.000Z");
    expect((await service.grant(teacher(), "Marta", grantBody({ idempotencyKey: "key-tz-50000" }))).results[0]!.status).toBe("concedido");
  });

  it("conta o limite separado por professor", async () => {
    const { service } = createFixture();
    const second = actor({
      userId: "teacher-3", roles: ["professor"],
      teacherAssignments: [{ institutionId: SCHOOL, classId: CLASS_A, subjectId: "historia" }],
    });
    for (let index = 1; index <= 3; index += 1) await service.grant(teacher(), "Marta", grantBody({ idempotencyKey: `key-a-${index}00000` }));
    const response = await service.grant(second, "Paulo", grantBody({ subjectId: "historia", idempotencyKey: "key-b-0000001" }));
    expect(response.results[0]!.status).toBe("concedido");
  });

  it("toque duplo com a mesma chave não duplica pontos nem avisos", async () => {
    const { service, store } = createFixture();
    const first = await service.grant(teacher(), "Marta", grantBody({ studentIds: ["student-ana", "student-bruno"] }));
    const replay = await service.grant(teacher(), "Marta", grantBody({ studentIds: ["student-ana", "student-bruno"] }));
    expect(store.recognitions).toHaveLength(2);
    expect(store.notifications).toHaveLength(3);
    expect(replay.results.map((item) => item.recognitionId)).toEqual(first.results.map((item) => item.recognitionId));
    expect(replay.results.every((item) => item.repeated)).toBe(true);
  });

  it("recusa reutilizar a chave com outro motivo", async () => {
    const { service } = createFixture();
    await service.grant(teacher(), "Marta", grantBody());
    const error = await rejection(service.grant(teacher(), "Marta", grantBody({ reason: "superacao" })));
    expect((error as RecognitionError).status).toBe(409);
  });

  it("a mesma chave não conta como repetição para outro professor", async () => {
    const { service, store } = createFixture();
    const second = actor({
      userId: "teacher-3", roles: ["professor"],
      teacherAssignments: [{ institutionId: SCHOOL, classId: CLASS_A, subjectId: "matematica" }],
    });
    await service.grant(teacher(), "Marta", grantBody());
    await service.grant(second, "Paulo", grantBody());
    expect(store.recognitions).toHaveLength(2);
  });
});

describe("pontos anuais e avisos", () => {
  it("lança somente pontos anuais de patente, sem XP", async () => {
    const { service, store } = createFixture();
    await service.grant(teacher(), "Marta", grantBody());
    await service.grant(teacher(), "Marta", grantBody({ idempotencyKey: "key-00000002", reason: "superacao" }));
    expect(await service.annualPoints(SCHOOL, "student-ana", 2026)).toBe(40);
    expect(await service.annualPoints(SCHOOL, "student-ana", 2027)).toBe(0);
    expect(Object.keys(store.recognitions[0]!)).not.toContain("xp");
    const view = await service.listForStudent(student());
    expect(view.annualPoints).toEqual({ schoolYear: 2026, points: 40 });
  });

  it("cria aviso para o aluno e para o responsável confirmado, não para o pendente", async () => {
    const { service, store } = createFixture();
    await service.grant(teacher(), "Marta Ramos", grantBody({ note: "Ajudou o Bruno na lista" }));
    expect(store.notifications.map((item) => item.userId).sort()).toEqual(["guardian-1", "student-ana"]);
    const own = await service.listNotifications(student());
    expect(own.unreadCount).toBe(1);
    expect(own.notifications[0]).toMatchObject({ title: "Você ganhou 20 pontos de patente", read: false, recognitionId: "recognition-1" });
    expect(own.notifications[0]!.body).toContain("Marta Ramos");
    const parent = await service.listNotifications(guardian(["student-ana"]));
    expect(parent.notifications[0]!.title).toBe("Elogio para Ana");
  });

  it("marca como lida só a notificação do próprio usuário", async () => {
    const { service, store } = createFixture();
    await service.grant(teacher(), "Marta", grantBody());
    const mine = store.notifications.find((item) => item.userId === "student-ana")!;
    const error = await rejection(service.markNotificationRead(student("student-bruno"), mine.id));
    expect((error as RecognitionError).status).toBe(404);
    const result = await service.markNotificationRead(student(), mine.id);
    expect(result.notification.read).toBe(true);
    expect((await service.listNotifications(student())).unreadCount).toBe(0);
  });

  it("não devolve avisos antigos ao responsável quando o contexto perde o vínculo", async () => {
    const { service, store } = createFixture();
    await service.grant(teacher(), "Marta", grantBody());
    const notification = store.notifications.find((item) => item.userId === "guardian-1")!;
    expect((await service.listNotifications(guardian(["student-ana"]))).notifications).toHaveLength(1);
    expect((await service.listNotifications(guardian([]))).notifications).toHaveLength(0);
    await expect(service.markNotificationRead(guardian([]), notification.id)).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });
  });
});

describe("leitura dos elogios", () => {
  async function seeded() {
    const fixture = createFixture();
    await fixture.service.grant(teacher(), "Marta", grantBody({ studentIds: ["student-ana", "student-bruno"] }));
    return fixture;
  }

  it("aluno vê os próprios elogios", async () => {
    const { service } = await seeded();
    const view = await service.listForStudent(student());
    expect(view.recognitions).toHaveLength(1);
    expect(view.recognitions[0]).toMatchObject({ studentId: "student-ana", reasonLabel: "Ajudou a turma", points: 20 });
  });

  it("colega não vê elogios de outro aluno", async () => {
    const { service } = await seeded();
    const error = await rejection(service.listForStudent(student("student-bruno"), "student-ana"));
    expect((error as RecognitionError).status).toBe(404);
  });

  it("responsável vê só o filho confirmado", async () => {
    const { service } = await seeded();
    expect((await service.listForStudent(guardian(["student-ana"]), "student-ana")).recognitions).toHaveLength(1);
    expect(((await rejection(service.listForStudent(guardian(["student-ana"]), "student-bruno"))) as RecognitionError).status).toBe(404);
  });

  it("professor vê alunos das suas turmas e não de outras", async () => {
    const { service } = await seeded();
    expect((await service.listForStudent(teacher(), "student-bruno")).recognitions).toHaveLength(1);
    expect((await service.listForStudent(teacher(), "student-bruno")).annualPoints).toBeNull();
    expect(((await rejection(service.listForStudent(otherTeacher(), "student-ana"))) as RecognitionError).status).toBe(404);
  });

  it("professor não vê elogios de outra matéria na mesma turma", async () => {
    const { service } = await seeded();
    const historia = actor({
      userId: "teacher-3", roles: ["professor"],
      teacherAssignments: [{ institutionId: SCHOOL, classId: CLASS_A, subjectId: "historia" }],
    });
    await service.grant(historia, "Paulo", grantBody({ subjectId: "historia", note: "Apresentou bem", idempotencyKey: "key-hist-0001" }));
    const math = await service.listForStudent(teacher(), "student-ana");
    expect(math.recognitions.map((item) => item.subjectId)).toEqual(["matematica"]);
    const own = await service.listForStudent(historia, "student-ana");
    expect(own.recognitions.map((item) => item.subjectId)).toEqual(["historia"]);
    expect((await service.listForStudent(coordinator(), "student-ana")).recognitions).toHaveLength(2);
  });

  it("coordenador vê qualquer aluno da escola", async () => {
    const { service } = await seeded();
    expect((await service.listForStudent(coordinator(), "student-ana")).recognitions).toHaveLength(1);
  });

  it("lista alunos ativos da turma com contagem do dia", async () => {
    const { service } = await seeded();
    const data = await service.listStudents(teacher(), CLASS_A);
    expect(data.students.map((item) => [item.name, item.initials, item.remainingToday])).toEqual([
      ["Ana Souza Lima", "AL", 2],
      ["Bruno Alves", "BA", 2],
    ]);
    expect(((await rejection(service.listStudents(teacher(), CLASS_B))) as RecognitionError).status).toBe(403);
  });
});
