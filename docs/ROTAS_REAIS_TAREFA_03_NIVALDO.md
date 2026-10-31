# Rotas reais — Tarefa 03 / Nivaldo

Documento para integração da interface do aluno. Implementação na branch `feat/nivaldo-core`, a partir da base `7bfa3d5`. **Aplicação publicada: https://eai-lepv.vercel.app**. As APIs abaixo estão disponíveis nesse domínio, com autenticação por cookie. A integração à `main` continua como etapa separada do deploy por CLI.

As rotas abaixo existem no código, em `src/app/api/learning/[...path]/route.ts`, com dispatch em `src/features/learning/server/http.ts`. Os exemplos usam dados fictícios. O planejamento geral contém sugestões anteriores de URLs; use os caminhos deste documento para integrar esta implementação.

## Condições para usar

- A aplicação usa a sessão real do Supabase por cookie, validada no servidor. Não enviar `studentId`, papel, escola, gabarito ou pontos no corpo de operações do aluno.
- Banco: no projeto `alkvhjnqfjyjflaswdmi` as migrações `20261030220000_foundation.sql` e `20261031030000_learning.sql` já foram aplicadas. Para uma instalação nova, aplicar nessa ordem. Configurar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` no ambiente apropriado; a chave privada permanece no servidor. Ver [Configuração do Supabase](CONFIGURACAO_SUPABASE_LEPV.md).
- A conta deve ter perfil, papel `aluno` e matrícula ativa. Abrir uma atividade exige ficha salva e política de pontuação explicitamente configurada.
- As atividades precisam de snapshots revisados entregues pelo módulo de conteúdo e seleção inicial pelo coordenador. As APIs não criam conteúdo curricular automaticamente.
- Próxima questão de recuperação usa o gateway de IA existente. O fornecedor da base continua desabilitado; sem o adaptador de Gallotte, essa operação retorna `503 AI_UNAVAILABLE`, preservando a tentativa.

Prefixo de todas as URLs: **`/api/learning`**. Respostas de sucesso retornam HTTP `200`. Respostas privadas usam `Cache-Control: private, no-store`.

## Mapa para o colaborador

| Finalidade | Método | URL |
| --- | --- | --- |
| Ler ficha | GET | `/api/learning/preferences` |
| Salvar ficha | PUT | `/api/learning/preferences` |
| Listar atividades e obter a turma atual | GET | `/api/learning/activities` |
| Abrir ou retomar a original | POST | `/api/learning/activities/:rootQuestionId/open` |
| Consultar instância atribuída | GET | `/api/learning/instances/:questionInstanceId` |
| Enviar resposta final | POST | `/api/learning/attempts` |
| Obter a próxima questão de recuperação | POST | `/api/learning/recoveries/:recoveryId/next` |
| Pedir dica | POST | `/api/learning/instances/:questionInstanceId/hint` |
| Interromper recuperação | POST | `/api/learning/recoveries/:recoveryId/interrupt` |
| Consultar TOP 10 | GET | `/api/learning/ranking?classId=:classId` |

Nos POSTs sem campos, enviar `{}` ou corpo vazio. IDs de raiz, de instância, de tentativa e de recuperação são identificadores diferentes. Guardar os IDs retornados pela API e codificar segmentos com `encodeURIComponent`.

## 1. Ficha

### GET `/api/learning/preferences`

Retorna a própria ficha:

```json
{
  "preferences": {
    "studentId": "00000000-0000-4000-8000-000000000004",
    "interests": ["futebol"],
    "context": "Gosto de campeonatos.",
    "version": 1,
    "updatedAt": "2026-10-30T23:00:00.000Z"
  },
  "saved": true
}
```

Se ainda não existe ficha, `saved` é `false`, os interesses e o contexto vêm vazios e `updatedAt` é omitido. Salvar antes de abrir uma atividade.

### PUT `/api/learning/preferences`

Corpo exato, correspondente a `StudentPreferencesUpdateSchema`:

```json
{"interests":["futebol","música"],"context":"Prefiro exemplos de esportes."}
```

Aceita até 20 interesses, cada um com 1 a 100 caracteres, e contexto de até 2.000 caracteres. A lista pode ser vazia. Campos extras são rejeitados. O retorno é o objeto `StudentPreferences` diretamente, sem o envelope `preferences` do GET. `version`, `studentId` e `updatedAt` vêm do servidor; reenviar dados idênticos não aumenta a versão. Instâncias já atribuídas preservam seu enunciado e a versão anterior da ficha.

## 2. Atividades e questões

### GET `/api/learning/activities`

```json
{
  "classId": "10000000-0000-4000-8000-000000000001",
  "grade": 6,
  "schoolYear": 2026,
  "activities": [{
    "rootQuestionId": "root-01",
    "subjectId": "matematica",
    "grade": 6,
    "skillCodes": ["EF06MA01"],
    "questionInstanceId": null,
    "status": "not_started",
    "recoveryId": null,
    "recoveryStatus": null
  }]
}
```

`status`: `not_started`, `pending` ou `answered`. `recoveryStatus`: `null`, `in_progress`, `recovered` ou `interrupted`. A lista contém somente raízes ativas da turma atual, de todas as matérias; uma seleção vazia retorna `activities: []`. Usar o `classId` retornado para consultar o ranking.

### POST `/api/learning/activities/:rootQuestionId/open`

Retorna a mesma instância quando a atividade já foi aberta. A atribuição inicial entrega o snapshot original revisado; esta rota não chama adaptação inicial por IA.

### GET `/api/learning/instances/:questionInstanceId`

Retorna a mesma estrutura de abertura:

```json
{
  "question": {
    "questionInstanceId": "30000000-0000-4000-8000-000000000001",
    "questionId": "root-01",
    "rootQuestionId": "root-01",
    "subjectId": "matematica",
    "grade": 6,
    "skillCodes": ["EF06MA01"],
    "statement": "Quanto é 2 + 2?",
    "options": [{"id":"a","text":"4"},{"id":"b","text":"5"}],
    "sourceType": "original",
    "preferencesVersion": 1
  },
  "status": "pending"
}
```

`question` obedece a `QuestionForStudentSchema`, sem gabarito, explicação, dica ou política de pontos. Após responder, `status` é `answered` e surge `result`, conforme `AttemptResultSchema`. A recuperação retorna `sourceType: "recuperacao"` e novos IDs de questão e instância, mantendo a raiz. Preservar os IDs das opções ao enviar a resposta; não usar a letra visual depois de alterar a ordem na interface.

## 3. Resposta final

### POST `/api/learning/attempts`

Corpo conforme `AttemptSubmissionSchema`:

```json
{
  "questionInstanceId": "30000000-0000-4000-8000-000000000001",
  "selectedOptionId": "b",
  "idempotencyKey": "7db9f82f-e7ba-415b-a064-86dcfe4f721a"
}
```

Criar uma chave por submissão com `crypto.randomUUID()` e reutilizar a mesma chave e o mesmo corpo nos reenvios por falha de rede. A chave aceita 8 a 128 caracteres. Desabilitar novas escolhas enquanto o resultado está pendente.

Exemplo de resposta incorreta:

```json
{
  "result": {
    "attemptId": "40000000-0000-4000-8000-000000000001",
    "questionInstanceId": "30000000-0000-4000-8000-000000000001",
    "isCorrect": false,
    "explanation": "Dois pares somam quatro.",
    "xpAwarded": 0,
    "rankPointsAwarded": 0,
    "consecutiveCorrect": 0,
    "recoveryStatus": "in_progress"
  },
  "recoveryId": "50000000-0000-4000-8000-000000000001"
}
```

**Validar `payload.result` com `AttemptResultSchema`**, porque `recoveryId` fica no envelope. Original correta retorna `recoveryId: null` e `recoveryStatus: null`. Questão incorreta inicia recuperação; ao concluir a cadeia, o resultado traz `recovered` e `consecutiveCorrect: 2`.

Repetir a mesma alternativa retorna o resultado persistido, sem novo crédito, inclusive com outra chave. Trocar a alternativa de uma instância respondida gera `409 ALREADY_ANSWERED`. Reutilizar a chave para outra instância ou outra alternativa gera `409 IDEMPOTENCY_CONFLICT`. Não somar pontos novamente na interface a cada replay; recarregar o resumo/ranking ou identificar `attemptId` já processado.

## 4. Próxima questão e dica

### POST `/api/learning/recoveries/:recoveryId/next`

Enviar `{}`. Retorna `{ question, status: "pending" }`, com uma nova instância de recuperação e a versão da ficha capturada ao solicitar a geração. Se já existe uma questão pendente, devolve a mesma. A geração é separada da gravação da tentativa.

- `409 GENERATION_IN_PROGRESS`: outra solicitação já está gerando a questão; manter o estado e permitir tentar novamente.
- `503 AI_UNAVAILABLE`: a resposta anterior está salva; informar indisponibilidade e oferecer nova tentativa de carregar a próxima questão.
- `503 INVALID_GENERATED_QUESTION` ou `REPEATED_GENERATED_QUESTION`: a saída foi rejeitada; não criar uma questão fictícia na interface.
- `409 RECOVERY_CLOSED`: recuperação concluída ou interrompida.

Uma nova questão correta aumenta a sequência; erro zera o contador; dois acertos consecutivos encerram a recuperação. A API rejeita variantes com matéria/ano/habilidades diferentes e enunciados repetidos. Validação estrutural não comprova correção pedagógica do conteúdo gerado.

### POST `/api/learning/instances/:questionInstanceId/hint`

Enviar `{}`. Retorna:

```json
{"questionInstanceId":"30000000-0000-4000-8000-000000000002","text":"Conte dois pares."}
```

A dica vem do snapshot salvo da questão de recuperação. Esta rota não chama um fornecedor de IA nem concede pontos. Só funciona enquanto a recuperação está em andamento, a raiz está ativa e a instância ainda não foi respondida. Nos demais estados retorna `409 HINT_UNAVAILABLE`, ou `404` se a raiz/instância não está disponível para a conta.

## 5. Interrupção

### POST `/api/learning/recoveries/:recoveryId/interrupt`

Enviar `{}`. Retorna:

```json
{
  "recoveryId": "50000000-0000-4000-8000-000000000001",
  "state": {"status":"interrupted","consecutiveCorrect":1,"answeredCount":1}
}
```

`state` segue `RecoveryStateSchema`. A contagem inclui somente respostas da recuperação, sem a original. Repetir a interrupção preserva o estado. Interromper uma recuperação já concluída mantém `recovered`. As tentativas e os créditos ficam preservados; uma questão pendente da cadeia interrompida não aceita resposta.

## 6. Ranking

### GET `/api/learning/ranking?classId=:classId`

```json
{
  "classId": "10000000-0000-4000-8000-000000000001",
  "rankCalibration": "proposed",
  "top10": [{
    "position": 1,
    "studentId": "00000000-0000-4000-8000-000000000004",
    "name": "Aluno fictício",
    "xp": 100,
    "rankPoints": 100,
    "rankName": "Ferro (proposta)"
  }]
}
```

Retorna no máximo dez alunos, incluindo alunos com zero pontos quando a turma ainda não possui créditos. Ordena por XP decrescente, pontos anuais decrescentes e ID crescente como desempate. `xp` considera as raízes ativas e a política explicitamente escolhida para as adaptativas; `rankPoints` soma os créditos do ano letivo. A rotação não apaga os pontos anuais.

O aluno acessa a própria turma; professor, responsável e coordenador precisam dos vínculos correspondentes. O ranking não concede acesso à ficha ou aos dados privados dos colegas. As patentes existentes continuam como proposta de calibração, por isso `rankCalibration` e o sufixo no nome.

## Operações complementares

| Método e URL | Uso |
| --- | --- |
| POST `/api/learning/access` com `{}` | Registrar um dia de acesso em Brasília, sem duplicar o dia |
| GET `/api/learning/summary?from=2026-10-01&to=2026-10-31&studentId=:id` | Retorna `{ summary, rankCalibration, accessDaysScope, originalAttempts, recoveryAttempts }`; validar `summary` com `StudentSummarySchema`. O próprio aluno pode omitir `studentId`. Professor recebe somente suas matérias atribuídas; os demais precisam de vínculo |
| POST `/api/learning/activation` | Coordenador seleciona inicialmente dez raízes distintas: `{ classId, subjectId, rootQuestionIds }` |
| POST `/api/learning/rotation` | Coordenador troca duas raízes na semana atual: `{ classId, subjectId, weekStart, incomingRootIds }`; `weekStart` é a segunda-feira em Brasília |

Os contadores do resumo usam o intervalo `from`/`to`; XP é o total elegível atual e pontos anuais correspondem ao ano letivo. Dias de acesso são diferentes de dias com resposta. O professor não recebe a frequência global do aluno: `accessDaysScope` identifica essa restrição.

## Erros e configuração de pontuação

Formato de erro:

```json
{"error":{"code":"ALREADY_ANSWERED","message":"A questão já foi respondida e não pode ser refeita."}}
```

| HTTP | Significado |
| --- | --- |
| 401 | Sem sessão válida |
| 403 | Perfil ou origem sem permissão |
| 404 | Recurso indisponível para a conta, sem vínculo ou atividade removida |
| 409 | Estado conflitante, tentativa já respondida ou geração em andamento |
| 413 | Corpo acima do limite de 65.536 caracteres |
| 422 | JSON/campos/IDs/datas inválidos ou campos extras |
| 503 | Configuração, persistência ou IA indisponível |
| 500 | Falha inesperada, sem detalhes internos na resposta |

O usuário confirmou para a demonstração: `LEPV_ORIGINAL_POINTS=100`, `LEPV_RECOVERY_REFERENCE=previous` e `LEPV_ADAPTIVE_XP_FOLLOWS_ROOT=true`. Cada adaptativa vale 70% do valor nominal anterior: 100 → 70 → 49 → 34,30, sem teto. Esses valores já estão no ambiente local configurado. Um novo ambiente ainda precisa receber as três variáveis; sem configuração válida a abertura retorna `503 SCORING_NOT_CONFIGURED`. A política fica congelada na instância e na cadeia. Os valores mostrados no exemplo do ranking são ilustrativos; a calibração de patentes continua proposta.

## Exemplo mínimo no navegador

```ts
async function learning(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/learning/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(payload.error.message), {
      code: payload.error.code, status: response.status,
    });
  }
  return payload;
}

// Depois do login e da ficha salva:
const { classId, activities } = await learning("activities");
// Verificar activities.length antes de selecionar uma atividade.
const opened = await learning(
  `activities/${encodeURIComponent(activities[0].rootQuestionId)}/open`, "POST", {},
);
// A alternativa deve vir da escolha do aluno, usando option.id.
const submission = {
  questionInstanceId: opened.question.questionInstanceId,
  selectedOptionId: "b",
  idempotencyKey: crypto.randomUUID(),
};
const answered = await learning("attempts", "POST", submission);
if (answered.recoveryId && answered.result.recoveryStatus === "in_progress") {
  // Tratar AI_UNAVAILABLE e GENERATION_IN_PROGRESS preservando answered.
  await learning(`recoveries/${encodeURIComponent(answered.recoveryId)}/next`, "POST", {});
}
await learning(`ranking?classId=${encodeURIComponent(classId)}`);
```

## Estado de validação e limites

Validação local concluída: `npm run typecheck`, **82 testes aprovados** e `npm run build`. Foram exercitados os contratos HTTP, o serviço com repositório em memória e a migração com PostgreSQL/WASM (PGlite), usando identidades e conteúdo fictícios. O servidor de produção local também reconheceu os seis grupos de rotas e retornou `401 UNAUTHENTICATED` às chamadas sem sessão. O adaptador em memória é exclusivo dos testes.

O Supabase hospedado foi criado e validado com sessões reais dos quatro perfis e de outro aluno, usando somente dados sintéticos. As rotas foram exercitadas por HTTP local com cookies reais, incluindo reenvios, recuperação, dica, interrupção e rotação: XP 219 → 0, pontos anuais preservados em 219. No domínio da Vercel também foram verificados login, permissões, ficha, atividades, atribuição concorrente, ranking e resumo. As variantes usadas na validação da recuperação foram fixtures privadas; a chamada real de IA permanece desabilitada. Convites administrativos, publicação pelo módulo de conteúdo e integração das telas continuam pendentes. Detalhes em [Configuração do Supabase](CONFIGURACAO_SUPABASE_LEPV.md) e [Configuração da Vercel](CONFIGURACAO_VERCEL_LEPV.md).
