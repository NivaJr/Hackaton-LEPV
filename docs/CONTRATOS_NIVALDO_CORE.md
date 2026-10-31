# Contratos da Tarefa 03

Branch: `feat/nivaldo-core`. Base: `7bfa3d5`.

Estes contratos aditivos estão implementados na branch `feat/nivaldo-core` e preservam os schemas existentes em `src/contracts`. O acordo externo com os demais integrantes continua pendente do encaminhamento pelo usuário. O planejamento geral usa uma distribuição anterior por números; prevalece a distribuição nominal em `docs/DIVISAO_EQUIPE.md` e na Tarefa 03 enviada pelo usuário. O documento completo para encaminhar ao colaborador é [Rotas reais](ROTAS_REAIS_TAREFA_03_NIVALDO.md).

## Integração com os outros domínios

- Viegas consome as rotas abaixo; as respostas de questão e tentativa seguem `QuestionForStudent` e `AttemptResult` existentes.
- Gallotte publica snapshots revisados pela operação interna `LearningService.registerActivity`; esta operação não substitui o banco de conteúdo, upload, catálogo BNCC ou revisão do professor. O snapshot guarda a versão entregue, a ordem das opções e o gabarito privado. Não há endpoint público para cadastrar gabaritos.
- Fabia e Gallotte consomem o resumo autorizado. O aluno consulta a si; responsável consulta filhos confirmados; coordenador consulta a instituição; professor consulta apenas matérias atribuídas à turma do aluno.
- Não são alteradas dependências, schemas públicos existentes, telas ou assinaturas do gateway de IA. A migração nova usa tabelas de aprendizagem e não cria um segundo banco de conteúdo.

## Rotas implementadas

Prefixo: `/api/learning`. Sessão real por cookie; sem fallback para memória em produção. Respostas privadas usam `Cache-Control: private, no-store`.

Domínio publicado: `https://hackaton-lepv.vercel.app`. O frontend usa a mesma origem da aplicação, com as rotas e os cookies do próprio app. Detalhes em [Configuração da Vercel](CONFIGURACAO_VERCEL_LEPV.md).

| Método e caminho | Entrada | Resultado |
| --- | --- | --- |
| GET `/preferences` | — | `{ preferences, saved }` |
| PUT `/preferences` | `StudentPreferencesUpdate` | Ficha persistida, versão atribuída pelo banco |
| GET `/activities` | — | `{ classId, grade, schoolYear, activities }` |
| POST `/activities/:rootQuestionId/open` | `{}` | Instância original imutável, sem gabarito |
| GET `/instances/:id` | — | `{ question, status, result? }`; resultado só após resposta |
| POST `/attempts` | `AttemptSubmission` | `{ result: AttemptResult, recoveryId }` |
| POST `/recoveries/:id/next` | `{}` | Próxima questão via gateway comum; geração separada da tentativa |
| POST `/recoveries/:id/interrupt` | `{}` | `{ recoveryId, state: RecoveryState }`, preservando pontos e tentativas |
| POST `/instances/:id/hint` | `{}` | Dica salva da questão de recuperação ainda não respondida |
| GET `/summary` | `studentId?`, `from`, `to` (datas ISO) | `{ summary: StudentSummary, rankCalibration, accessDaysScope, originalAttempts, recoveryAttempts }` |
| GET `/ranking` | `classId` | Somente TOP 10 da turma autorizada |
| POST `/access` | `{}` | Registro idempotente do dia de acesso em Brasília |
| POST `/activation` | `classId, subjectId, rootQuestionIds[10]` | Primeira seleção de dez originais revisadas; coordenador |
| POST `/rotation` | `classId, subjectId, weekStart, incomingRootIds[2]` | Duas saídas e duas entradas, uma vez por semana/matéria/turma; coordenador |

Erros têm `{ error: { code, message } }`: 401 sem sessão, 403 perfil inadequado, 404 recurso sem vínculo, 409 conflito/estado encerrado, 422 entrada inválida, 503 configuração ou IA indisponível. Uma geração em andamento retorna conflito recuperável; repetir depois permite retomar a mesma instância. Reutilizar a chave em outra instância ou mudar a alternativa respondida causa conflito.

## Transações e persistência

O serviço TypeScript é o único caminho de cálculo e aplica as funções puras existentes. O repositório persiste o estado por aluno com revisão e comparação atômica; uma revisão da turma protege contra rotação concorrente. As tentativas e o livro de pontos também possuem índices relacionais com unicidade por aluno/instância e por tentativa/tipo. O commit valida matrícula e escola novamente e grava todos os efeitos na mesma transação. Conflitos causam releitura e recálculo, sem repetir geração externa.

Os snapshots e gabaritos ficam no esquema privado, sem SELECT para o navegador. RPCs de persistência são exclusivas de `service_role`, chamadas apenas depois da sessão validada. O cliente não escolhe ator, escola, correção ou crédito. O registro de acesso diferencia dia de acesso de dia com tentativa.

## Decisões pendentes

O usuário confirmou a política da demonstração em [Decisões](DECISOES.md): original 100, adaptativas a 70% do valor nominal anterior, XP acompanhando a raiz e ausência de teto (`null`). O ambiente local já contém essa configuração explícita. Novos ambientes devem receber as três variáveis; não há fallback silencioso. Os testes cobrem ambas as referências, original/anterior, sem transformar outras políticas em padrão.

As patentes existentes são uma calibração proposta e serão identificadas como tal na resposta. A rotação usa segunda-feira como início da semana em Brasília, ordena saídas por data de ativação e desempata por ID. O ranking desempata por XP, pontos anuais e ID, sem expor posições além das dez primeiras.
