# Contratos da Tarefa 03

Branch: `feat/nivaldo-core`. Base: `7bfa3d5`.

Estes contratos aditivos estão implementados na branch `feat/nivaldo-core` e preservam os schemas existentes em `src/contracts`. O acordo externo com os demais integrantes continua pendente do encaminhamento pelo usuário. O planejamento geral usa uma distribuição anterior por números; prevalece a distribuição nominal em `docs/DIVISAO_EQUIPE.md` e na Tarefa 03 enviada pelo usuário. O documento completo para encaminhar ao colaborador é [Rotas reais](ROTAS_REAIS_TAREFA_03_NIVALDO.md).

## Integração com os outros domínios

- Viegas consome as rotas abaixo; as respostas de questão e tentativa seguem `QuestionForStudent` e `AttemptResult` existentes.
- Gallotte publica snapshots revisados pela operação interna `LearningService.registerActivity`; esta operação não substitui o banco de conteúdo, upload, catálogo BNCC ou revisão do professor. O snapshot guarda a versão entregue, a ordem das opções e o gabarito privado. Não há endpoint público para cadastrar gabaritos.
- Fabiano e Gallotte consomem o resumo autorizado. O aluno consulta a si; responsável consulta filhos confirmados; coordenador consulta a instituição; professor consulta apenas matérias atribuídas à turma do aluno.
- Não são alteradas dependências, schemas públicos existentes, telas ou assinaturas do gateway de IA. A migração nova usa tabelas de aprendizagem e não cria um segundo banco de conteúdo.

## Rotas implementadas

Prefixo: `/api/learning`. Sessão real por cookie; sem fallback para memória em produção. Respostas privadas usam `Cache-Control: private, no-store`.

Domínio publicado: `https://eai-lepv.vercel.app`. O frontend usa a mesma origem da aplicação, com as rotas e os cookies do próprio app. Detalhes em [Configuração da Vercel](CONFIGURACAO_VERCEL_LEPV.md).

| Método e caminho | Entrada | Resultado |
| --- | --- | --- |
| GET `/preferences` | — | `{ preferences, saved }` |
| PUT `/preferences` | `StudentPreferencesUpdate` | Ficha persistida, versão atribuída pelo banco |
| GET `/activities` | — | `{ classId, className, grade, schoolYear, activities }` |
| POST `/activities/:rootQuestionId/open` | `{}` | Instância original imutável, sem gabarito |
| GET `/instances/:id` | — | `{ question, status, result? }`; resultado só após resposta |
| POST `/attempts` | `AttemptSubmission` | `{ result: AttemptResult, recoveryId }` |
| POST `/recoveries/:id/next` | `{}` | Próxima questão via gateway comum; geração separada da tentativa |
| POST `/recoveries/:id/interrupt` | `{}` | `{ recoveryId, state: RecoveryState }`, preservando pontos e tentativas |
| POST `/instances/:id/hint` | `{}` | Dica salva da questão de recuperação ainda não respondida |
| GET `/summary` | `studentId?`, `from`, `to` (datas ISO) | `{ summary: StudentSummary, rankCalibration, accessDaysScope, originalAttempts, recoveryAttempts }` |
| GET `/ranking` | `classId` | Somente TOP 10 da turma autorizada |
| POST `/access` | `{}` | Registro idempotente do dia de acesso em Brasília |
| POST `/activation` | `classId, subjectId, rootQuestionIds[10]` | Primeira seleção de dez originais revisadas; professor da turma e matéria, ou coordenador se não houver professor atribuído |
| POST `/rotation` | `classId, subjectId, weekStart, incomingRootIds[2]` | Duas saídas e duas entradas, uma vez por semana/matéria/turma; coordenador |

Erros têm `{ error: { code, message } }`: 401 sem sessão, 403 perfil inadequado, 404 recurso sem vínculo, 409 conflito/estado encerrado, 422 entrada inválida, 503 configuração ou IA indisponível. Uma geração em andamento retorna conflito recuperável; repetir depois permite retomar a mesma instância. Reutilizar a chave em outra instância ou mudar a alternativa respondida causa conflito.

## Transações e persistência

O serviço TypeScript é o único caminho de cálculo e aplica as funções puras existentes. O repositório persiste o estado por aluno com revisão e comparação atômica; uma revisão da turma protege contra rotação concorrente. As tentativas e o livro de pontos também possuem índices relacionais com unicidade por aluno/instância e por tentativa/tipo. O commit valida matrícula e escola novamente e grava todos os efeitos na mesma transação. Conflitos causam releitura e recálculo, sem repetir geração externa.

Os snapshots e gabaritos ficam no esquema privado, sem SELECT para o navegador. RPCs de persistência são exclusivas de `service_role`, chamadas apenas depois da sessão validada. O cliente não escolhe ator, escola, correção ou crédito. O registro de acesso diferencia dia de acesso de dia com tentativa.

## Decisões pendentes

O usuário confirmou a política da demonstração em [Decisões](DECISOES.md): original 100, adaptativas a 70% do valor nominal anterior, XP acompanhando a raiz e ausência de teto (`null`). O ambiente local já contém essa configuração explícita. Novos ambientes devem receber as três variáveis; não há fallback silencioso. Os testes cobrem ambas as referências, original/anterior, sem transformar outras políticas em padrão.

As patentes existentes são uma calibração proposta e serão identificadas como tal na resposta. A rotação usa segunda-feira como início da semana em Brasília, ordena saídas por data de ativação e desempata por ID. O ranking desempata por XP, pontos anuais e ID, sem expor posições além das dez primeiras.

## Handoff de banco e integrações — 31/10/2026

Entrega e critérios de verificação em [Entrega do handoff](ENTREGA_NIVALDO_HANDOFF.md). Os contratos abaixo substituem as solicitações ainda pendentes da entrega original de gestão:

| Pedido | Contrato implementado | Consumidor |
| --- | --- | --- |
| Transferência | `transfer_student(p_enrollment_id uuid, p_classroom_id uuid) -> EnrollmentRecord`; sessão do coordenador, RLS e uma transação | `RosterRepository.transferEnrollment`; preserva `expectedEnrollmentId` da prévia |
| Conta por email | `accounts_by_emails(p_emails text[]) -> { userId, email }[]`; até 1.000 emails, somente servidor | `AccountDirectory.findByEmails`; perfil e papéis continuam vindo do banco |
| Auditoria | Início antes dos efeitos, resultado por linha ao terminar; `GET /api/roster/imports/audit` retorna os 50 lotes recentes da escola | Coordenador; sem senha, token, link de acesso ou arquivo original |
| Métricas por turma | `GET /api/learning/classes/:classId/metrics?from=AAAA-MM-DD&to=AAAA-MM-DD` -> `{ source: "real", from, to, metrics }` | Coordenação da escola e professor atribuído; professor limitado às próprias matérias |

`RosterMetricsGateway.classMetrics` recebe o `SessionContext` completo e os IDs das turmas. O painel real do coordenador usa uma RPC agregada para todas as turmas, com os últimos 30 dias; não usa mais `fixtureRosterMetrics`. O contrato de resultados individuais é preservado.

As métricas incluem quantidade de alunos, respostas, acertos, dias de acesso, dias elegíveis e percentuais. Frequência é uso registrado nos dias de calendário elegíveis da matrícula ativa, no fuso de Brasília; não representa presença escolar. Acertos incluem respostas originais e de recuperação do período e da turma. Ausência de registros retorna contadores zero, sem números de exemplo. Falha de persistência é erro explícito.

Rascunhos e metadados publicados usam `ContentRepository` com `storage: "supabase"`, CAS de versão e gabaritos em `app_private`. O gateway de IA e os schemas das questões não mudam. A cota de leitura de documentos também é compartilhada no banco entre instâncias. Memória permanece restrita ao desenvolvimento e aos clientes de demonstração.

Elogios concedem somente os 20 pontos anuais definidos pelo módulo de reconhecimento. A RPC grava elogio, avisos e lançamento em uma transação, revalida matrícula e atribuição, deriva responsáveis confirmados do banco e mantém três elogios por professor/aluno/dia de Brasília. O resumo de patente inclui esses pontos; XP e todos os critérios do TOP 10 consideram apenas tentativas.
