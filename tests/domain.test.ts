import { describe, expect, it } from "vitest";
import {
  AttemptSubmissionSchema,
  GeneratedQuestionSchema,
  QuestionForStudentSchema,
  SessionContextSchema,
  StudentPreferencesUpdateSchema,
  type SessionContext,
  type StudentAccessScope,
} from "@/contracts";
import { GRADES, isSkillCompatible, SUBJECTS } from "@/config/catalog";
import { DEFAULT_RECOVERY_CAP_POINTS, PROPOSED_RANK_THRESHOLDS } from "@/config/scoring";
import {
  advanceRecovery,
  calculateRecoveryReward,
  canEditStudentData,
  canViewStudentData,
  createRecoveryState,
  getRankForPoints,
  getRankProgress,
  interruptRecovery,
} from "@/features/learning/domain";

const publicQuestion = {
  questionInstanceId: "instance-1",
  questionId: "variant-1",
  rootQuestionId: "original-1",
  subjectId: "matematica",
  grade: 6,
  skillCodes: ["EF06MA01"],
  statement: "Quanto é 2 + 2?",
  options: [{ id: "a", text: "4" }, { id: "b", text: "5" }],
  sourceType: "adaptada",
  preferencesVersion: 1,
};

const student: StudentAccessScope = {
  studentId: "student-1", institutionId: "school-1", classIds: ["class-1"],
};

function actor(overrides: Partial<SessionContext>): SessionContext {
  return SessionContextSchema.parse({
    userId: "user-1", roles: ["aluno"], institutionId: "school-1", ...overrides,
  });
}

describe("contratos de questões e solicitações públicas", () => {
  it("mantém IDs da instância, variante e raiz separados", () => {
    expect(QuestionForStudentSchema.parse(publicQuestion).questionInstanceId).toBe("instance-1");
    expect(QuestionForStudentSchema.safeParse({ ...publicQuestion, questionInstanceId: undefined }).success).toBe(false);
  });

  it.each(["correctOptionId", "answerKey", "explanation", "hint", "pointsAwarded"])(
    "rejeita campo protegido/desconhecido %s na projeção pública", (field) => {
      expect(QuestionForStudentSchema.safeParse({ ...publicQuestion, [field]: "segredo" }).success).toBe(false);
    },
  );

  it("não permite esconder a resposta em campos extras da alternativa", () => {
    const options = [{ id: "a", text: "4", isCorrect: true }, { id: "b", text: "5" }];
    expect(QuestionForStudentSchema.safeParse({ ...publicQuestion, options }).success).toBe(false);
  });

  it("valida alternativas únicas, gabarito e associação sintática da habilidade", () => {
    const { questionInstanceId: _i, questionId: _q, rootQuestionId: _r, sourceType: _s, preferencesVersion: _p, ...base } = publicQuestion;
    const generated = { ...base, correctOptionId: "a", explanation: "Dois mais dois é quatro.", hint: "Conte dois pares.", difficulty: "facil" };
    expect(GeneratedQuestionSchema.safeParse(generated).success).toBe(true);
    expect(GeneratedQuestionSchema.safeParse({ ...generated, correctOptionId: "ausente" }).success).toBe(false);
    expect(GeneratedQuestionSchema.safeParse({ ...generated, options: [{ id: "a", text: "4" }, { id: "a", text: "5" }] }).success).toBe(false);
    expect(GeneratedQuestionSchema.safeParse({ ...generated, skillCodes: ["EF06CI01"] }).success).toBe(false);
    expect(GeneratedQuestionSchema.safeParse({ ...generated, skillCodes: ["EF09MA01"] }).success).toBe(false);
  });

  it("não aceita identidade, papel ou pontos concedidos pelo cliente", () => {
    const request = { questionInstanceId: "instance-1", selectedOptionId: "a", idempotencyKey: "submission-1" };
    expect(AttemptSubmissionSchema.safeParse(request).success).toBe(true);
    expect(AttemptSubmissionSchema.safeParse({ ...request, studentId: "outro" }).success).toBe(false);
    expect(AttemptSubmissionSchema.safeParse({ ...request, role: "coordenador" }).success).toBe(false);
    expect(AttemptSubmissionSchema.safeParse({ ...request, points: 100 }).success).toBe(false);
    expect(StudentPreferencesUpdateSchema.safeParse({ interests: ["futebol"], context: "Gosto de campeonatos.", version: 90 }).success).toBe(false);
  });

  it("aceita somente interesses saudáveis sugeridos pela plataforma", () => {
    expect(StudentPreferencesUpdateSchema.safeParse({ interests: ["música", "xadrez"], context: "Prefiro exemplos visuais." }).success).toBe(true);
    expect(StudentPreferencesUpdateSchema.safeParse({ interests: ["tema não aprovado"], context: "" }).success).toBe(false);
  });
});

describe("catálogo", () => {
  it("oferece as seis matérias e os quatro anos, incluindo Ciências para Biologia", () => {
    expect(SUBJECTS).toHaveLength(6);
    expect(GRADES).toEqual([6, 7, 8, 9]);
    expect(SUBJECTS.find((subject) => subject.id === "biologia")?.bnccComponent).toBe("CI");
    expect(isSkillCompatible("EF69LP01", "portugues", 8)).toBe(true);
    expect(isSkillCompatible("EF67LP01", "portugues", 9)).toBe(false);
  });
});

describe("pontuação e patentes confirmadas", () => {
  it("calcula 70% sobre a original e mantém ausência de teto como padrão", () => {
    expect(DEFAULT_RECOVERY_CAP_POINTS).toBeNull();
    expect(calculateRecoveryReward({ originalPoints: 100 })).toBe(70);
    expect(calculateRecoveryReward({ originalPoints: 100, alreadyAwarded: 140 })).toBe(70);
    expect(calculateRecoveryReward({ originalPoints: 50 })).toBe(35);
  });

  it("aplica um teto somente quando fornecido explicitamente", () => {
    expect(calculateRecoveryReward({ originalPoints: 100, alreadyAwarded: 70, capPoints: 100 })).toBe(30);
    expect(calculateRecoveryReward({ originalPoints: 100, alreadyAwarded: 100, capPoints: 100 })).toBe(0);
    expect(calculateRecoveryReward({ originalPoints: 100, capPoints: 0 })).toBe(0);
  });

  it("rejeita pontos inválidos em vez de produzir crédito negativo ou NaN", () => {
    expect(() => calculateRecoveryReward({ originalPoints: -1 })).toThrow(RangeError);
    expect(() => calculateRecoveryReward({ originalPoints: 100, capPoints: Number.NaN })).toThrow(RangeError);
    expect(() => getRankForPoints(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("respeita todos os limiares cumulativos e acumula acima de Onisciente", () => {
    for (const rank of PROPOSED_RANK_THRESHOLDS) {
      expect(getRankForPoints(rank.minimumPoints).id).toBe(rank.id);
    }
    expect(getRankForPoints(999).id).toBe("ferro");
    expect(getRankForPoints(1_000).id).toBe("bronze");
    expect(getRankForPoints(100_000).id).toBe("onisciente");
    expect(getRankProgress(9_100)).toMatchObject({ next: null, pointsToNext: 0, progress: 1 });
  });
});

describe("recuperação", () => {
  it("exige dois acertos consecutivos e zera a sequência após erro", () => {
    const first = advanceRecovery(createRecoveryState(), true);
    expect(first).toMatchObject({ status: "in_progress", consecutiveCorrect: 1 });
    const wrong = advanceRecovery(first, false);
    expect(wrong).toMatchObject({ status: "in_progress", consecutiveCorrect: 0 });
    const recovered = advanceRecovery(advanceRecovery(wrong, true), true);
    expect(recovered).toEqual({ status: "recovered", consecutiveCorrect: 2, answeredCount: 4 });
    expect(advanceRecovery(recovered, false)).toEqual(recovered);
  });

  it("preserva o histórico ao interromper e não reabre estados terminais", () => {
    const interrupted = interruptRecovery(advanceRecovery(createRecoveryState(), true));
    expect(interrupted).toEqual({ status: "interrupted", consecutiveCorrect: 1, answeredCount: 1 });
    expect(advanceRecovery(interrupted, true)).toEqual(interrupted);
    const recovered = advanceRecovery(advanceRecovery(createRecoveryState(), true), true);
    expect(interruptRecovery(recovered).status).toBe("recovered");
  });
});

describe("autorização com papéis e vínculos verificados no servidor", () => {
  it.each(["aluno", "coordenador", "professor", "responsavel"] as const)(
    "nega o papel %s sem vínculo com o estudante", (role) => {
      const unlinked = actor({ roles: [role] });
      expect(canViewStudentData(unlinked, student, "health")).toBe(false);
      expect(canEditStudentData(unlinked, student, "academic_history", "matematica")).toBe(false);
    },
  );

  it("permite ao aluno somente os próprios dados e a própria ficha", () => {
    const own = actor({ studentId: "student-1" });
    expect(canViewStudentData(own, student, "health")).toBe(true);
    expect(canEditStudentData(own, student, "preferences")).toBe(true);
    expect(canEditStudentData(own, student, "health")).toBe(false);
    expect(canViewStudentData(own, { ...student, studentId: "student-2" }, "health")).toBe(false);
  });

  it("restringe professor à turma vinculada e edição à matéria atribuída", () => {
    const teacher = actor({ roles: ["professor"], teacherAssignments: [{ institutionId: "school-1", classId: "class-1", subjectId: "matematica" }] });
    expect(canViewStudentData(teacher, student, "health")).toBe(true);
    expect(canEditStudentData(teacher, student, "academic_history", "matematica")).toBe(true);
    expect(canEditStudentData(teacher, student, "academic_history", "historia")).toBe(false);
    expect(canEditStudentData(teacher, student, "academic_history")).toBe(false);
    expect(canEditStudentData(teacher, student, "support")).toBe(false);
    expect(canViewStudentData(teacher, { ...student, classIds: ["other-class"] }, "health")).toBe(false);
  });

  it("permite ao responsável editar saúde/apoio de filhos vinculados, sem editar histórico", () => {
    const guardian = actor({ roles: ["responsavel"], guardianStudentIds: ["student-1"] });
    expect(canEditStudentData(guardian, student, "health")).toBe(true);
    expect(canEditStudentData(guardian, student, "support")).toBe(true);
    expect(canEditStudentData(guardian, student, "academic_history", "matematica")).toBe(false);
    expect(canViewStudentData(guardian, { ...student, studentId: "student-2" }, "health")).toBe(false);
  });

  it("coordenador consulta na instituição e edita histórico, mas não saúde/apoio", () => {
    const coordinator = actor({ roles: ["coordenador"], coordinatorInstitutionIds: ["school-1"] });
    expect(canViewStudentData(coordinator, student, "support")).toBe(true);
    expect(canEditStudentData(coordinator, student, "academic_history")).toBe(true);
    expect(canEditStudentData(coordinator, student, "health")).toBe(false);
    expect(canEditStudentData(coordinator, student, "support")).toBe(false);
    expect(canViewStudentData(coordinator, { ...student, institutionId: "school-2" }, "health")).toBe(false);
  });
});
