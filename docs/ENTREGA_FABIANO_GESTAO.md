# Entrega — Tarefa 02

Pessoa: Fabiano. Tarefa: 02, gestão escolar e família. Branch: `feat/fabiano-gestao`. Commit-base: `7bfa3d5`.

## Objetivo entregue

- Coordenador: turmas, matrícula e transferência manual, atribuição de professor por matéria e importação CSV/XLSX de alunos e professores, com prévia e confirmação.
- Responsável: seletor dos filhos vinculados, resultados, feedback, edição de saúde e apoio e histórico somente para consulta.
- O nome Fabia foi corrigido para Fabiano em instruções, documentos e na página `/tarefas`. Os registros antigos de `PROMPTS/` preservam o texto original.

## Arquivos alterados

- Novos: `src/features/roster/**`, `src/features/family/**`, `src/app/api/roster/**`, `src/app/api/family/**`, `tests/roster-*.test.ts`, `tests/family-service.test.ts` e helpers de teste.
- Conteúdo das páginas `coordenador` e `responsavel`, mantendo `requireRole`.
- `src/lib/supabase/admin.ts`: **cópia idêntica** ao arquivo de `feat/nivaldo-core`, para que o merge não gere conflito. Nivaldo continua dono do arquivo.

## Contratos consumidos / mudanças combinadas

Consome sem alterar: `SessionContext`, `StudentSummary`, `canViewStudentData`, `canEditStudentData`, `getSessionContext`, `requireRole`, `LearningAiGateway.summarizeStudent`, `SUBJECTS`, `GRADES`. Nenhum schema central, SQL, `package.json` ou lockfile foi alterado.

XLSX não usa pacote novo: há um leitor próprio sobre `node:zlib`. Ele lê valores da primeira aba, nunca avalia fórmulas, descarta o resultado em cache, recusa macros e DOCTYPE e limita a descompressão a 16 MB por parte interna.

## Endpoints

Todos usam a sessão por cookie e respondem `{ error: { code, message } }` em falha. A escola sempre vem da sessão.

| Método e caminho | Papel | Entrada | Retorno |
| --- | --- | --- | --- |
| GET `/api/roster/overview` | coordenador | — | turmas, matrículas, atribuições, pessoas, métricas com `source` |
| POST `/api/roster/classrooms` | coordenador | `name, grade, schoolYear` | turma |
| PATCH / DELETE `/api/roster/classrooms/:id` | coordenador | campos parciais / — | turma / `{ deleted }` |
| POST `/api/roster/assignments` | coordenador | `classroomId, teacherId, subjectId` | atribuição |
| DELETE `/api/roster/assignments/:id` | coordenador | — | `{ deleted }` |
| POST `/api/roster/enrollments` | coordenador | `classroomId, studentId, expectedEnrollmentId?` | `{ enrollment, status }`; 409 sem confirmação de transferência |
| DELETE `/api/roster/enrollments/:id` | coordenador | — | `{ removed }` |
| POST `/api/roster/imports/preview` | coordenador | multipart `kind, classroomId, file` | `ImportPreview`, sem gravar |
| POST `/api/roster/imports/confirm` | coordenador | `ImportConfirm` | `ImportResult` por linha |
| POST `/api/roster/guardian-links` | coordenador | `studentId, fullName, email` | vínculo `pending`; convida se a conta não existir |
| PATCH `/api/roster/guardian-links/:id` | coordenador | `status: confirmed` ou `revoked` | vínculo |
| GET `/api/roster/templates/:arquivo` | coordenador | `modelo-alunos.csv`, `modelo-professores.csv` | CSV |
| GET `/api/family/children` | responsável | — | filhos confirmados |
| GET `/api/family/students/:id` | responsável vinculado | — | aluno, saúde, apoio, histórico, métricas com `source` |
| GET `/api/family/students/:id/feedback` | responsável vinculado | — | `{ text, origin, metricsSource }` |
| PUT `/api/family/students/:id/health` e `/support` | responsável vinculado | `{ details }` | `{ details, updatedAt }` |

ID sem vínculo retorna 404, igual a um inexistente.

## Contrato do lote

A prévia devolve `new`, `enroll_existing`, `already_in_class`, `transfer_available`, `assign_existing`, `already_assigned` ou `invalid`, com erros por linha. A confirmação reclassifica cada linha com dados atuais.

- Transferir exige `decision: "transfer"` e o `expectedEnrollmentId` visto na prévia. Matrícula diferente resulta em `STALE_PREVIEW`.
- A idempotência é por estado: linha reenviada encontra matrícula ou atribuição já aplicada e retorna `already_applied`. Repetir o lote completa apenas o que falhou.
- Conta sem perfil ou sem papel é retomada, sem nova identidade.
- Email de outra escola é recusado. Conta da escola sem o papel esperado também: nenhum papel é concedido automaticamente.

## Banco: solicitações a Nivaldo

Nenhuma migração foi criada.

1. **RPC transacional de transferência.** Hoje a matrícula é encerrada e recriada em duas operações, com restauração se a segunda falhar. Se a restauração também falhar, o aluno fica sem matrícula ativa e a linha retorna `TRANSFER_INCOMPLETE`. Pedido: `transfer_student(enrollment_id, classroom_id)` em uma transação. Ajuste: só `RosterService.transfer`.
2. **Busca de conta por email.** `profiles` não tem email; o adaptador pagina `auth.admin.listUsers`, o que é lento e consulta todos os usuários. Pedido: RPC `service_role` que receba a lista de emails. Ajuste: só `supabase-directory.ts`.
3. **Auditoria de importação.** Sem tabela não há registro de quem importou o quê. Pedido: decidir se entra na reserva `20261031040000_import_feedback.sql`.
4. **Métricas por turma.** `/api/learning/summary` é por aluno. O painel do coordenador precisa de agregado por turma para evitar uma chamada por aluno.

## Fixtures/stubs

- `fixtureRosterMetrics` e `fixtureFamilyMetrics` geram números de exemplo, sempre com `source: "fixture"` e aviso visível na tela. Adapter real: resumo autorizado da Tarefa 03, trocando uma linha em cada `server/runtime.ts`, depois do merge de `feat/nivaldo-core`.
- Métrica de exemplo nunca é enviada ao fornecedor de IA. Com métricas reais, o gateway recebe só `StudentSummary`, sem saúde ou apoio. Sem IA, a tela mostra mensagem automática identificada.
- Sem `SUPABASE_SECRET_KEY`, a importação falha com `PROVISIONING_UNAVAILABLE`, sem simular contas.

## Cobertura

Quatro séries e seis matérias vêm do catálogo. Esta tarefa não envolve questões; a contagem de questões revisadas não se aplica.

## Checks

Resultados no commit desta entrega:

- `npm run typecheck`: passou.
- `npm test`: passou, 7 arquivos e 106 testes, dos quais 62 são novos: `roster-import`, `roster-service`, `family-service` e `roster-database`.
- `npm run build`: passou, com `/api/roster/[...path]` e `/api/family/[...path]`.

## Percurso realmente executado

- `next start` sem Supabase: rotas de gestão e família retornaram 401; `/coordenador` e `/responsavel` redirecionaram ao login.
- Migração real em PGlite com Auth emulado: formatos SQL dos adaptadores sob RLS, papéis e escolas diferentes.
- Telas no Chrome headless com respostas simuladas, em rota temporária já removida: desktop com dados; 390 px real apenas no estado vazio. A tabela de prévia preenchida nessa largura não foi observada; ela tem rolagem própria.
- Leitor XLSX testado com arquivo gerado por openpyxl, além dos arquivos sintéticos dos testes.

**Não executado:** Supabase hospedado, PostgREST, adaptadores Supabase contra servidor real, envio de convite, login real, arquivo salvo pelo Excel e fornecedor de IA.

## Configuração externa necessária

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (somente servidor) e `NEXT_PUBLIC_APP_URL` para o link do convite.

## Limitações e pendências

- Dois responsáveis editando o mesmo registro: prevalece a última gravação.
- O histórico é consultado, mas a edição por coordenador e professor não tem tela nesta tarefa.
- `docs/CONTRATOS_NIVALDO_CORE.md`, em `feat/nivaldo-core`, ainda cita "Fabia" e deve ser ajustado por Nivaldo.
- O shell global aponta "Turmas e pessoas" para `/tarefas`, e `/demo/*` segue com os dados antigos. Ambos exigem acordo, e `feat/viegas-aluno` já altera os mesmos itens do menu. Os painéis têm âncoras prontas: `/coordenador#turmas`, `#importacao`, `#vinculos`; `/responsavel#resultados`, `#saude-apoio`, `#historico`.
