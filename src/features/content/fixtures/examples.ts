import type { GeneratedQuestion, Grade, SubjectId } from "@/contracts";

/**
 * EXEMPLOS DE DEMONSTRAÇÃO escritos pela equipe de desenvolvimento.
 * Não foram revisados por professor e não contam como banco real. Ao importar um exemplo,
 * ele vira rascunho e só é publicado depois da revisão do professor.
 * skillCheck: "alta_confianca" = código conhecido pela equipe, ainda sem conferência no texto oficial;
 * "a_conferir" = provável, precisa ser checado na BNCC antes de uso em sala.
 */
export type DemoExample = {
  id: string;
  skillCheck: "alta_confianca" | "a_conferir";
  body: GeneratedQuestion;
};

const mc = (texts: string[]) => texts.map((text, index) => ({ id: String.fromCharCode(97 + index), text }));

export const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: "exemplo-7-ma-01", skillCheck: "alta_confianca",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA04"], difficulty: "facil",
      statement: "Às 6h a temperatura em uma cidade era de −3 °C. Até o meio-dia ela subiu 8 °C. Qual era a temperatura ao meio-dia?",
      options: mc(["5 °C", "−11 °C", "11 °C", "−5 °C"]), correctOptionId: "a",
      explanation: "Subir 8 graus a partir de −3 é calcular −3 + 8 = 5. A temperatura ficou em 5 °C.",
      hint: "Imagine a reta numérica: comece no −3 e ande 8 casas para a direita.",
    },
  },
  {
    id: "exemplo-7-ma-02", skillCheck: "alta_confianca",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA04"], difficulty: "facil",
      statement: "Um mergulhador está a 12 metros abaixo do nível do mar (−12 m) e sobe 5 metros. Em que posição ele fica?",
      options: mc(["−17 m", "−7 m", "7 m", "17 m"]), correctOptionId: "b",
      explanation: "Subir 5 metros é somar 5: −12 + 5 = −7. Ele continua abaixo do nível do mar, a 7 metros.",
      hint: "Subir aproxima do zero. O resultado ainda é negativo?",
    },
  },
  {
    id: "exemplo-7-ma-03", skillCheck: "a_conferir",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA08"], difficulty: "media",
      statement: "Qual das frações é maior: 3/4 ou 5/8?",
      options: mc(["3/4", "5/8", "As duas são iguais", "Não dá para comparar frações com denominadores diferentes"]), correctOptionId: "a",
      explanation: "3/4 é o mesmo que 6/8. Como 6/8 é maior que 5/8, a fração 3/4 é a maior.",
      hint: "Tente escrever as duas frações com o mesmo denominador.",
    },
  },
  {
    id: "exemplo-7-ma-04", skillCheck: "a_conferir",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA02"], difficulty: "media",
      statement: "Uma camiseta custava R$ 80,00 e entrou em promoção com 25% de desconto. Qual é o novo preço?",
      options: mc(["R$ 60,00", "R$ 55,00", "R$ 20,00", "R$ 100,00"]), correctOptionId: "a",
      explanation: "25% de 80 é 20, porque 80 ÷ 4 = 20. O novo preço é 80 − 20 = R$ 60,00.",
      hint: "25% é a quarta parte do valor.",
    },
  },
  {
    id: "exemplo-7-ma-05", skillCheck: "alta_confianca",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA18"], difficulty: "media",
      statement: "Ana pensou em um número, multiplicou por 3 e somou 7. O resultado foi 25. Em que número ela pensou?",
      options: mc(["6", "4", "8", "10"]), correctOptionId: "a",
      explanation: "A equação é 3x + 7 = 25. Tirando 7 dos dois lados, 3x = 18, e então x = 6.",
      hint: "Escreva a frase como uma equação e desfaça as operações de trás para frente.",
    },
  },
  {
    id: "exemplo-7-ma-06", skillCheck: "alta_confianca",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA18"], difficulty: "facil",
      statement: "Qual é o valor de x na equação 2x − 5 = 11?",
      options: mc(["x = 3", "x = 6", "x = 8", "x = 16"]), correctOptionId: "c",
      explanation: "Somando 5 aos dois lados, 2x = 16. Dividindo por 2, x = 8.",
      hint: "Primeiro isole o termo 2x.",
    },
  },
  {
    id: "exemplo-7-ma-07", skillCheck: "alta_confianca",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA04"], difficulty: "facil",
      statement: "Durante 3 noites seguidas a temperatura caiu 4 °C por noite. Qual foi a variação total da temperatura?",
      options: mc(["−12 °C", "12 °C", "−7 °C", "−1 °C"]), correctOptionId: "a",
      explanation: "Cair 4 graus três vezes é 3 × (−4) = −12. A temperatura ficou 12 °C mais baixa.",
      hint: "Uma queda é um número negativo. Quantas vezes ela aconteceu?",
    },
  },
  {
    id: "exemplo-7-ma-08", skillCheck: "alta_confianca",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA04"], difficulty: "media",
      statement: "Bruno tinha R$ 50,00 na conta e fez uma compra de R$ 80,00 no débito com limite especial. Qual é o saldo dele agora?",
      options: mc(["R$ 30,00", "−R$ 130,00", "−R$ 30,00", "R$ 130,00"]), correctOptionId: "c",
      explanation: "O saldo é 50 − 80 = −30. A conta fica negativa em R$ 30,00.",
      hint: "Ele gastou mais do que tinha. O saldo fica acima ou abaixo de zero?",
    },
  },
  {
    id: "exemplo-7-ma-09", skillCheck: "alta_confianca",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA18"], difficulty: "media",
      statement: "Uma pizza foi dividida igualmente entre 4 amigos. Cada um ainda ganhou 3 pedaços extras e ficou com 8 pedaços. Quantos pedaços a pizza tinha?",
      options: mc(["11", "20", "32", "44"]), correctOptionId: "b",
      explanation: "A equação é x ÷ 4 + 3 = 8. Tirando 3, x ÷ 4 = 5, então x = 20.",
      hint: "Desfaça as operações de trás para frente: primeiro tire os pedaços extras.",
    },
  },
  {
    id: "exemplo-7-ma-10", skillCheck: "alta_confianca",
    body: {
      subjectId: "matematica", grade: 7, skillCodes: ["EF07MA18"], difficulty: "dificil",
      statement: "Qual é o valor de x na equação 5x = 3x + 14?",
      options: mc(["x = 2", "x = 7", "x = 14", "x = 28"]), correctOptionId: "b",
      explanation: "Tirando 3x dos dois lados, 2x = 14. Dividindo por 2, x = 7.",
      hint: "Junte os termos com x do mesmo lado da igualdade.",
    },
  },
  {
    id: "exemplo-7-ge-01", skillCheck: "alta_confianca",
    body: {
      subjectId: "geografia", grade: 7, skillCodes: ["EF07GE11"], difficulty: "facil",
      statement: "Qual bioma brasileiro tem clima semiárido, chuvas irregulares e vegetação que perde as folhas na estação seca?",
      options: mc(["Mata Atlântica", "Caatinga", "Pampa", "Amazônia"]), correctOptionId: "b",
      explanation: "A Caatinga ocupa grande parte do Nordeste. Muitas plantas perdem as folhas na seca para economizar água.",
      hint: "Pense no bioma que existe só no Brasil e fica no Sertão nordestino.",
    },
  },
  {
    id: "exemplo-7-ge-02", skillCheck: "alta_confianca",
    body: {
      subjectId: "geografia", grade: 7, skillCodes: ["EF07GE11"], difficulty: "media",
      statement: "A Mata de Araucárias, onde cresce o pinheiro-do-paraná, aparece principalmente em qual região do Brasil?",
      options: mc(["Norte", "Nordeste", "Centro-Oeste", "Sul"]), correctOptionId: "d",
      explanation: "A araucária precisa de clima mais frio e úmido, comum nas áreas altas do Sul, como no Paraná e em Santa Catarina.",
      hint: "O nome da árvore lembra um estado.",
    },
  },
  {
    id: "exemplo-7-ge-03", skillCheck: "alta_confianca",
    body: {
      subjectId: "geografia", grade: 7, skillCodes: ["EF07GE11"], difficulty: "facil",
      statement: "Que vegetação predomina no Centro-Oeste, com árvores de tronco retorcido, casca grossa e raízes profundas?",
      options: mc(["Cerrado", "Manguezal", "Floresta Amazônica", "Mata de Araucárias"]), correctOptionId: "a",
      explanation: "Essas são marcas do Cerrado. As raízes profundas ajudam as plantas a buscar água durante a estação seca.",
      hint: "É o bioma do Planalto Central, onde fica Brasília.",
    },
  },
  {
    id: "exemplo-7-ge-04", skillCheck: "alta_confianca",
    body: {
      subjectId: "geografia", grade: 7, skillCodes: ["EF07GE12"], difficulty: "media",
      statement: "No Sistema Nacional de Unidades de Conservação (SNUC), a que grupo pertence um Parque Nacional?",
      options: mc(["Proteção Integral", "Uso Sustentável", "Reserva Extrativista", "Área Urbana Protegida"]), correctOptionId: "a",
      explanation: "Parques Nacionais são de Proteção Integral: permitem visitação e pesquisa, mas não a retirada de recursos naturais.",
      hint: "Num Parque Nacional é possível caçar ou extrair madeira?",
    },
  },
  {
    id: "exemplo-7-ge-05", skillCheck: "a_conferir",
    body: {
      subjectId: "geografia", grade: 7, skillCodes: ["EF07GE09"], difficulty: "facil",
      statement: "Um mapa usa cores diferentes para mostrar quantos habitantes por quilômetro quadrado vivem em cada estado. Que tipo de mapa é esse?",
      options: mc(["Mapa temático", "Mapa político", "Mapa de relevo", "Planta de bairro"]), correctOptionId: "a",
      explanation: "Ele mostra um tema específico, a densidade demográfica. Por isso é um mapa temático.",
      hint: "O mapa foi feito para mostrar um assunto escolhido.",
    },
  },
];

export function findExample(id: string): DemoExample | undefined {
  return DEMO_EXAMPLES.find((example) => example.id === id);
}

export function examplesFor(subjectId: SubjectId, grade: Grade): DemoExample[] {
  return DEMO_EXAMPLES.filter((example) => example.body.subjectId === subjectId && example.body.grade === grade);
}
