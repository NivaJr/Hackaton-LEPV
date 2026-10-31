import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecognitionsContent } from "@/features/family/ui/recognitions-panel";
import { recognitionApi, type StudentRecognitions } from "@/features/recognition/ui/api";

const STUDENT = "11111111-1111-4111-8111-111111111111";
const data: StudentRecognitions = {
  studentId: STUDENT,
  annualPoints: { schoolYear: 2026, points: 40 },
  recognitions: [{
    id: "r1", studentId: STUDENT, classId: "c1", subjectId: "matematica", reason: "outro", reasonLabel: "Outro motivo",
    note: "Ajudou um colega", points: 20, teacherName: "Marta Ramos", schoolYear: 2026, createdAt: "2026-10-31T02:00:00.000Z",
  }],
};
const render = (value: StudentRecognitions) => renderToStaticMarkup(createElement(RecognitionsContent, { data: value }));

afterEach(() => { vi.unstubAllGlobals(); });

describe("elogios no painel do responsável", () => {
  it("mostra motivo, nota, professor, matéria, pontos do ano e data de Brasília", () => {
    const html = render(data);
    for (const text of ["Outro motivo", "Ajudou um colega", "Marta Ramos", "Matemática", "40 pontos de patente em 2026", "30/10/2026"]) expect(html).toContain(text);
  });

  it("explica a lista vazia e omite o total ausente", () => {
    const html = render({ ...data, annualPoints: null, recognitions: [] });
    expect(html).toContain("Nenhum elogio registrado ainda.");
    expect(html).not.toContain("pontos de patente");
  });

  it("consulta o filho selecionado pela API de reconhecimento", async () => {
    const fetchMock = vi.fn(async () => Response.json(data));
    vi.stubGlobal("fetch", fetchMock);
    await expect(recognitionApi.forStudent(STUDENT)).resolves.toEqual(data);
    expect(fetchMock.mock.calls[0]).toContain(`/api/recognition?studentId=${STUDENT}`);
  });

  it("repassa a indisponibilidade enquanto a migração não existe", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { code: "STORE_UNAVAILABLE", message: "Indisponível." } }, { status: 503 }));
    await expect(recognitionApi.forStudent(STUDENT)).rejects.toMatchObject({ code: "STORE_UNAVAILABLE", status: 503 });
  });
});
