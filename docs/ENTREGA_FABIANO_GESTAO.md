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

Consome também `GET /api/recognition?studentId=` e `NotificationBell`, da Tarefa 04, no painel do responsável. Consome sem alterar: `SessionContext`, `StudentSummary`, `canViewStudentData`, `canEditStudentData`, `getSessionContext`, `requireRole`, `LearningAiGateway.summarizeStudent`, `SUBJECTS`, `GRADES`. Nenhum schema central, SQL, `package.json` ou lockfile foi alterado.

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
| GET `/api/roster/students/:id/results` | coordenador | — | resumo real de 30 dias ou `source: "unavailable"` |
| POST `/api/roster/guardian-links` | coordenador | `studentId, fullName, email` | vínculo `pending`; `accessLink` se a conta for nova |
| POST `/api/roster/classrooms/:id/access-links` | coordenador | — | `{ links, activeCount }`: links novos de quem está na turma e não ativou a conta |
| POST `/api/roster/access-links` | coordenador | `personId` | `{ accessLink }`; 409 `ACCOUNT_ALREADY_ACTIVE` se a pessoa já ativou a conta |
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

Na entrega original de Fabiano, nenhuma migração foi criada. Os quatro pedidos abaixo foram implementados no [Handoff de Nivaldo](ENTREGA_NIVALDO_HANDOFF.md), com migrações aplicadas e adaptadores conectados nesta integração; o texto dos pedidos preserva a motivação original.

1. **RPC transacional de transferência.** Hoje a matrícula é encerrada e recriada em duas operações, com restauração se a segunda falhar. Se a restauração também falhar, o aluno fica sem matrícula ativa e a linha retorna `TRANSFER_INCOMPLETE`. Pedido: `transfer_student(enrollment_id, classroom_id)` em uma transação. Ajuste: só `RosterService.transfer`.
2. **Busca de conta por email.** `profiles` não tem email; o adaptador pagina `auth.admin.listUsers`, o que é lento e consulta todos os usuários. Pedido: RPC `service_role` que receba a lista de emails. Ajuste: só `supabase-directory.ts`.
3. **Auditoria de importação.** Sem tabela não há registro de quem importou o quê. Pedido: decidir se entra na reserva `20261031040000_import_feedback.sql`.
4. **Métricas por turma.** `/api/learning/summary` é por aluno. O painel do coordenador precisa de agregado por turma para evitar uma chamada por aluno.

## Fixtures/stubs

- `fixtureRosterMetrics` preserva exemplos identificados para testes. O runtime do coordenador usa agora o agregado real de turmas do núcleo, com `source: "real"` e o ator da sessão.
- O painel do responsável usa o resumo real da Tarefa 03, repassando o ator para o núcleo repetir a autorização. Qualquer falha aparece como `source: "unavailable"`, nunca como número de exemplo. `fixtureFamilyMetrics` fica só para testes.
- Métrica de exemplo nunca é enviada ao fornecedor de IA. Com métricas reais, o gateway recebe só `StudentSummary`, sem saúde ou apoio. Sem IA, a tela mostra mensagem automática identificada.
- Sem `SUPABASE_SECRET_KEY`, a importação falha com `PROVISIONING_UNAVAILABLE`, sem simular contas.

## Cobertura

Quatro séries e seis matérias vêm do catálogo. Esta tarefa não envolve questões; a contagem de questões revisadas não se aplica.

## Checks

Resultados no commit desta entrega:

- `npm run typecheck`: passou.
- `npm test`: 327 de 328 testes passaram em 28 arquivos, incluindo `roster-import`, `roster-service`, `roster-directory`, `family-service`, `family-recognitions` e `roster-database`. A falha é `llm-prompts`, somente em checkout Windows, que converte `PROMPTS/04-gallotte-templates-ia.md` para CRLF.
- `npm run build`: passou.

## Percurso realmente executado

- `next start` sem Supabase: rotas de gestão e família retornaram 401; `/coordenador` e `/responsavel` redirecionaram ao login.
- Migração real em PGlite com Auth emulado: formatos SQL dos adaptadores sob RLS, papéis e escolas diferentes.
- Telas no Chrome headless com respostas simuladas, em rota temporária já removida: desktop com dados; 390 px real apenas no estado vazio. A tabela de prévia preenchida nessa largura não foi observada; ela tem rolagem própria.
- Tema escuro e 390 px com painéis preenchidos no Chrome, com respostas simuladas: sem rolagem horizontal da página.
- Login real da conta fictícia de coordenador em produção: `/api/me` retornou o papel `coordenador`. `/api/roster/overview` retornou 404 naquele momento; em 31/10/2026, após a publicação, a rota de gestão responde 401 sem sessão. O painel autenticado em produção não foi reexecutado.
- Leitor XLSX testado com arquivo gerado por openpyxl, além dos arquivos sintéticos dos testes.

Importação real em produção com `inviteUserByEmail`, em 31/10/2026: a planilha foi lida e todas as linhas falharam no envio do convite, inclusive com dois endereços Gmail. A causa exata não foi lida no log do Auth; a documentação do Supabase restringe o email padrão aos membros da organização e a cerca de 2 envios por hora.

Cadastro por link em produção, em 31/10/2026: Fabiano importou contas, abriu o link, concluiu o cadastro e confirmou as contas salvas no banco. Isso exercita `generateLink`, `/convite`, a definição de senha e os adaptadores de gestão contra o Supabase hospedado.

**Não executado:** cadastro por link de professor e de responsável, se não fizeram parte desse percurso; validade do link no projeto; bloqueio de "Novo link" para conta ativada contra o Supabase real; elogios com dados reais, pois a migração de reconhecimento não existe; arquivo salvo pelo Excel.

## Configuração externa necessária

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (somente servidor) e `NEXT_PUBLIC_APP_URL` para o link do convite.

## Decisões em aberto

Registradas em 31/10/2026, sem decisão tomada:

1. **Ativação e rotação de atividades:** hoje só o coordenador pode executá-las pelas APIs, e nenhuma tela as chama. Fabiano entende que a função interessa ao professor e ao aluno; a passagem das APIs ao professor segue por definir com a equipe.

## Cadastro por link

Decidido por Fabiano em 31/10/2026, depois da falha dos convites por email. Aluno, professor e responsável usam o mesmo fluxo, sem envio de email:

1. Ao confirmar a importação ou criar um vínculo com email novo, `generateLink` cria a conta e devolve um token. A resposta traz `accessLink`.
2. O coordenador copia o link ou baixa um CSV com nome, email e link. O link não é gravado: fora daquela resposta, só gerando outro.
3. O link abre `/convite`, e o token só é validado no botão "Continuar". Prévias de link de aplicativos fazem GET e gastariam um token de uso único.
4. Em `/primeiro-acesso` a pessoa define a senha. O aluno escolhe preencher a ficha agora (`/aluno#perfil`) ou depois.

Na tela da turma, "Gerar links da turma" lista e baixa em CSV os links de alunos e professores que ainda não ativaram a conta. Como os links não são salvos, cada geração cria novos e invalida os anteriores dessas pessoas; a tela pede confirmação. "Novo link" faz o mesmo para uma pessoa. A conta fica com `app_metadata.access_pending` até a senha ser definida; contas ativadas e coordenadores são recusados, para que o link nunca sirva para assumir a conta de alguém. A validade segue o limite de OTP do projeto, 1 hora por padrão no Supabase. O email não é verificado neste fluxo: quem recebe o link confirma ter a conta. Com SMTP próprio, o convite por email pode voltar.

Falhas do Supabase Auth registram apenas código e status no log do servidor, sem email nem link.

## Menu do coordenador

Painel real, em `src/components/app-shell.tsx`: "Visão geral", "Acompanhamento" (`#acompanhamento`), "Turmas e pessoas" (`#turmas`), "Importação" (`#importacao`) e "Responsáveis" (`#vinculos`). Por decisão de Fabiano em 31/10/2026, "Atividades" e "Meu espaço" saíram; "Meu espaço" pode voltar se a equipe sentir falta. Sem turma selecionada, os links que dependem dela levam ao aviso para selecionar uma. A demonstração `/demo/coordenador` mantém o menu antigo. Esta mudança vai por PR para a equipe ver antes do merge.

## Menu e elogios do responsável

Painel real: "Visão geral", "Resultados" (`#resultados`), "Elogios" (`#elogios`), "Saúde e apoio" (`#saude-apoio`) e "Histórico" (`#historico`). A demonstração `/demo/responsavel` mantém o menu antigo.

A seção de elogios lista motivo, nota, professor, matéria, data e pontos, com o total de pontos de patente do ano. O vínculo confirmado é conferido no servidor, e a falha dessa seção não afeta as demais.

## Limitações e pendências

- Resultados: a visão por aluno e o agregado por turma usam o núcleo real após o handoff de Nivaldo; falhas não geram números de exemplo.

- Dois responsáveis editando o mesmo registro: prevalece a última gravação.
- O histórico é consultado, mas a edição por coordenador e professor não tem tela nesta tarefa.
- `docs/CONTRATOS_NIVALDO_CORE.md` foi corrigido para citar Fabiano.
- `/demo/*` segue com os dados e os menus antigos.
- Nos menus do coordenador e do responsável, "Visão geral" continua destacada ao navegar pelas âncoras, porque todas ficam na mesma página.
- Enquanto a migração de reconhecimento não for aplicada, a seção de elogios mostra que ainda não está disponível e o sino informa a falha ao ser aberto. O restante do painel continua funcionando.
