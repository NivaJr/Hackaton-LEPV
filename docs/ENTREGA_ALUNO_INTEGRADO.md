# Área do aluno — integração do handoff de Viegas

Continuidade por Nivaldo em 31/10/2026, na branch `feat/viegas-aluno`, a partir de `c355708` (anterior: `98838df`). Foram integradas a `main` em `216f3d1` e `feat/nivaldo-core` em `982c5fa`, preservando o histórico e os componentes existentes. Os merges não apresentaram conflitos. Alterações locais não commitadas do checkout da `main` foram preservadas.

## Comportamento entregue

- `/demo/aluno` mantém o cliente fake, com dados sintéticos identificados e sem persistência remota.
- `/aluno` mantém `requireRole("aluno")` e usa `createHttpStudentLearningClient()`.
- A lista exibe todas as atividades da matéria: abrir, continuar, consultar resposta e identificar recuperação em andamento, concluída ou interrompida.
- Respostas já registradas são somente leitura. A interface preserva a alternativa e a chave de idempotência em um reenvio após falha de transporte durante a sessão; o servidor continua garantindo unicidade da tentativa e do crédito.
- Operações concorrentes na interface são bloqueadas, inclusive duplo envio, troca de matéria durante envio e dica/interrupção simultâneas.
- A recuperação pode ser interrompida enquanto uma questão está pendente. Ao reabrir a original, prevalece o estado atual da recuperação, em vez do estado histórico da primeira tentativa.
- Ficha não preenchida orienta o aluno a salvar seus interesses. Edição confirmada é relida do Supabase; alterações da ficha não recalculam tentativas anteriores.
- O calendário autenticado usa datas reais de respostas. A matriz mostra os códigos de habilidades com erros devolvidos pelo servidor; não exibe percentuais de domínio inventados. As visualizações sintéticas permanecem na demonstração.
- XP, pontos anuais e TOP 10 são lidos do servidor. A interface não concede créditos nem aplica limites de patente.

## Contratos e banco

Os onze caminhos do handoff são preservados: ficha (`GET`/`PUT preferences`), atividades (`GET activities`, `POST activities/:id/open`), instância (`GET instances/:id`), resposta (`POST attempts`), dica (`POST instances/:id/hint`), recuperação (`POST recoveries/:id/next`, `POST recoveries/:id/interrupt`), resumo (`GET summary?from=...&to=...`) e ranking (`GET ranking?classId=...`), todos sob `/api/learning/`.

O cliente também registra o acesso por `POST /api/learning/access`, já existente no núcleo. IDs, escola, turma e permissões continuam derivados de `getSessionContext()` e dos vínculos persistidos. Schemas estritos e políticas RLS foram preservados. Gabaritos não entram na projeção pública de uma questão pendente.

Campos aditivos:

- `GET activities`: `className` (nome atual completo da turma) e `activities[].recoveryConsecutiveCorrect`.
- `GET summary`: `activityDates`, datas únicas de respostas autorizadas no período e no horário de Brasília, fora do schema compartilhado `StudentSummary`.

A migração **`20261031050000_learning_classroom_name.sql`** acrescenta uma RPC exclusiva de `service_role`, consultando o nome por escola e turma. Mantém compatíveis os payloads estritos das RPCs já publicadas, sem reescrever migrações aplicadas. Foi aplicada e registrada no histórico do Supabase LEPV. Os testes verificam atualização do nome, isolamento entre escolas e recusa a `anon`/`authenticated` nessa RPC administrativa.

A validação de origem das mutações usa o `Host` solicitado e o protocolo da requisição, pois a URL interna do Next pode usar outro endereço de escuta. Origem externa, protocolo diferente e `Origin: null` continuam recusados; um `X-Forwarded-Host` arbitrário não autoriza a chamada. Referência: [OWASP — identificação da origem de destino](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#identifying-the-target-origin).

## Pontuação e IA

Foi preservada a decisão explícita da demonstração em [DECISOES.md](DECISOES.md): original 100, adaptativas a 70% do valor nominal anterior, XP acompanhando a raiz e sem teto. O cálculo continua no servidor. Ambientes sem configuração explícita mantêm `SCORING_NOT_CONFIGURED`. Limites de patente e bônus adicionais continuam como propostas.

A IA real continua desabilitada: `AI_UNAVAILABLE` preserva a tentativa e permite nova tentativa de carregar a recuperação ou interrompê-la. Não há fallback de geração fictícia no runtime autenticado.

## Verificação

- `npm run typecheck`: aprovado.
- `npm test`: 151 testes aprovados em 12 arquivos, incluindo ponte entre cliente HTTP, handler e serviço, nome da turma no Postgres/WASM, falha de rede, idempotência, origem e recuperação encerrada.
- `npm run build`: aprovado, incluindo `/aluno` e as APIs de aprendizagem/gestão.

Percurso executado com Playwright/Chromium contra o build local de produção e o Supabase hospedado, com aluno fictício autenticado. Registro de 31/10/2026, `04:25:56 UTC` (01:25 em Brasília):

- Guard de `/aluno` redireciona sem sessão; `/demo/aluno` percorre erro, recuperação, dica e interrupção com cliente fake identificado.
- Nome completo da turma, matérias restritas à série, edição da ficha na interface e leitura após recarregar.
- A resposta de uma tentativa foi perdida propositalmente depois do commit no servidor. O reenvio usou exatamente a mesma alternativa e chave, gerou crédito único e atualizou XP, pontos anuais e ranking. O JSON continha somente os três campos do contrato da tentativa.
- Reabertura de questão respondida bloqueou novo envio e permitiu consulta do resultado salvo.
- Com a IA real desabilitada, `503 AI_UNAVAILABLE` manteve a tentativa e sua explicação.
- Para exercitar dica, dois acertos (70 e 49), conclusão persistida e interrupção de questão pendente, foram inseridas variantes **administrativas, privadas e explicitamente sintéticas** na conta fictícia. Isso verifica persistência e interface; não comprova geração por IA. Nenhum fornecedor fake foi ativado no runtime autenticado.
- Telas em 375px, temas claro/escuro e movimento reduzido, sem rolagem horizontal da página. O calendário possui rolagem própria.
- Após a inspeção visual, os textos de matérias, contexto, título do treino e rótulos da ficha passaram a usar os tokens do tema. A nova verificação no navegador confirmou as cores em ambos os temas, sem alterar dados ou repetir tentativas.

O conteúdo original da ficha fictícia foi restaurado após o teste; tentativas e créditos sintéticos permanecem como histórico da validação. Relatório e capturas locais: `supabase/.temp/student-browser-report.json` e `student-*.png`, ignorados pelo Git. Credenciais e sessões não foram publicadas.

## Limites

As questões da validação são sintéticas. Não se declara catálogo curricular de 240 questões revisadas, integração real de IA, aprovação de limites de patente ou avaliação pedagógica de domínio. O banco de conteúdo e o fornecedor de IA permanecem sob a frente de Gallotte.
