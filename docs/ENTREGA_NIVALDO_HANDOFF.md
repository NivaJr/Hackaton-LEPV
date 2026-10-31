# Handoff de banco, conteúdo e métricas — Nivaldo

Branch: `feat/nivaldo-handoff`. Base integrada: `63a7b16`, preservando o painel e os elogios do responsável entregues por Fabiano.

## Resultado

- Reconhecimentos, notificações e pontos anuais gravados atomicamente; elogios fora do XP e do TOP 10, inclusive desempate.
- Rascunhos e metadados de conteúdo persistidos no Supabase, sem gabarito acessível pelo navegador; gravação com comparação de versão.
- Cota de importações de IA compartilhada entre instâncias, com limite diário e lease; nenhuma cota de processo é usada em produção.
- Transferência com uma única RPC transacional e confirmação da matrícula vista na prévia.
- Busca das contas apenas pelos emails pedidos, sem paginação de todos os usuários Auth.
- Auditoria de importação com coordenador, escola, turma, linhas planejadas e resultados; sem links de cadastro, senhas ou conteúdo do arquivo.
- Métricas agregadas de turma alimentam o painel real da coordenação. O cliente de demonstração conserva os dados fictícios identificados.
- `Fabia` corrigido para `Fabiano` no contrato da Tarefa 03.

## Migrações

Aplicadas em uma transação junto com as entradas no histórico, no projeto confirmado pela configuração de Production: `alkvhjnqfjyjflaswdmi`.

1. `20261031060000_recognition.sql`.
2. `20261031133738_content.sql`.
3. `20261031133820_roster_handoff.sql`.

As migrações anteriores não foram reescritas. O MCP desta sessão aponta para `sufgxlmwhxudykxpnvpa`, que não é o projeto do site; por isso a aplicação usou o CLI vinculado ao projeto de Production. Nenhuma chave é incluída na documentação.

## Contratos e autorização

Assinaturas e endpoints em [Contratos da Tarefa 03](CONTRATOS_NIVALDO_CORE.md#handoff-de-banco-e-integrações--31102026).

Novas RPCs de conteúdo, reconhecimento, auditoria e métricas são exclusivas de `service_role`, chamado depois de `getSessionContext()` e da autorização de domínio. A transferência usa a sessão do coordenador e RLS. A única função nova com `SECURITY DEFINER` fica em `app_private`, é restrita ao servidor e retorna somente ID e email; não expõe credenciais do Auth. As demais usam `SECURITY INVOKER` e permissões explícitas.

O responsável perde a leitura dos avisos quando seu vínculo deixa de estar confirmado. Os gabaritos de rascunhos ficam em schema privado, sem grants para aluno, responsável ou navegador. O conteúdo do arquivo importado não é guardado como anexo; a persistência desta entrega cobre as questões extraídas, sua origem e seus metadados.

## Validação

- Typecheck e build passaram sobre a base integrada.
- 339 testes TypeScript e sete testes Python do arquivador passaram.
- Oito testes novos executam todas as migrações em Postgres/WASM com Auth emulado: transferência com falha após encerramento, prévia obsoleta, escola e papel incorretos, idempotência, limite de elogios, crédito anual sem XP/ranking, responsáveis confirmados, rascunho lido por outra instância, CAS, lote atômico, publicação imutável, acesso proibido a gabaritos, cota distribuída, busca de emails, auditoria sem credenciais e métricas reais filtradas por matéria.
- Testes de serviço verificam omissão dos links na auditoria, busca sem enumerar Auth e perda de avisos após revogação do vínculo.

Os testes com transporte simulado não comprovam o fornecedor. A confirmação de Gemini real, permissões no Supabase hospedado, navegação autenticada, métricas em Production e sobrevivência do rascunho a um redeploy é registrada no PR desta entrega e nos relatórios operacionais locais, sem credenciais. Os relatórios ficam em `.vercel/handoff-*.json`, ignorados pelo Git.

Não há alegação de catálogo curricular completo, BNCC revisada, envio de emails ou armazenamento do PDF/Word original.
