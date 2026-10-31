# Entrega — Tarefa 03

Pessoa: Nivaldo. Branch: `feat/nivaldo-core`. Commit-base: `7bfa3d5`.
Checkout: `C:\Users\nival\Hackaton-LEPV-nivaldo-core`.
Solicitação mais recente: publicar a branch da Tarefa 03 e iniciar as configurações. O usuário autorizou a publicação após a entrega local do documento de rotas.

## Implementação

- Serviço único de aprendizagem com snapshots imutáveis da questão, versão do conteúdo, ficha e política de pontuação.
- APIs reais em `/api/learning`: ficha, atividades, instâncias, tentativa, recuperação, dica, interrupção, resumo, TOP 10, acesso, ativação e rotação. Payloads completos em [Rotas reais](ROTAS_REAIS_TAREFA_03_NIVALDO.md).
- Port de repositório, adaptador Supabase por RPC e adaptador em memória exclusivo dos testes. A produção exige Supabase configurado, sem dados fictícios como fallback.
- Migração aditiva `20261031030000_learning.sql`: estado privado versionado, snapshots por turma, tentativas relacionais e livro de pontos. Nenhuma alteração na foundation ou no banco de conteúdo de Gallotte.
- Uma transação grava tentativa, recuperação e dois créditos únicos. Revisões de aluno e turma evitam sobrescrita concorrente e respostas após rotação. Índices garantem uma tentativa por aluno/instância e um crédito por tentativa/tipo.
- Geração externa separada, com reserva temporária por recuperação. Reenvios reaproveitam a questão pendente; interrupção invalida uma geração em andamento; falhas preservam a tentativa.
- RLS para leitura das próprias respostas finalizadas e créditos. Snapshots/gabaritos privados e RPCs de persistência não podem ser acessados por `anon` ou `authenticated`.
- Resumos verificam vínculo; professor recebe somente matéria e turma atribuídas. Ranking publica no máximo dez posições. Dias de acesso e atividade são contagens distintas em Brasília.
- Ativação inicial protegida de dez originais por matéria. Rotação de duas entradas/saídas por semana, idempotente e com desempate por data/ID. Créditos anuais permanecem intactos.

## Contratos e coordenação

Os schemas públicos existentes e as assinaturas do gateway foram preservados. Não houve alteração de dependências, lockfile, telas de outros integrantes ou drivers de IA. A proposta de integração foi registrada antes da implementação em [Contratos](CONTRATOS_NIVALDO_CORE.md); o acordo externo com os integrantes ainda depende do encaminhamento pelo usuário.

Gallotte deve chamar a operação interna `LearningService.registerActivity` a partir de seu fluxo autorizado de publicação, com snapshot revisado, raiz estável e versão. O coordenador ativa a seleção inicial. A abertura atribui o original revisado; adaptação inicial automática por perfil não foi adicionada. Recuperação consome o gateway existente, cuja implementação real continua com Gallotte.

## Pontuação

A abertura exige escolhas explícitas em `LEPV_ORIGINAL_POINTS`, `LEPV_RECOVERY_REFERENCE` e `LEPV_ADAPTIVE_XP_FOLLOWS_ROOT`. Após a entrega local, o usuário confirmou para a demonstração original 100, referência na questão anterior, XP acompanhando a raiz e ausência de teto. A política fica congelada na cadeia e a calibração de patentes continua como proposta. A confirmação está em [Decisões](DECISOES.md).

## Validação observada

- `npm ci --no-audit --no-fund`: passou, sem alterar o lockfile.
- `npm run typecheck`: passou.
- `npm test`: **82 testes em seis arquivos passaram**; 44 testes da base e 38 testes novos.
- `npm run build`: passou e incluiu `/api/learning/[...path]` como rota dinâmica.
- Servidor de produção local, porta 3187: ficha, atividades, respostas, dica, interrupção e ranking retornaram `401 UNAUTHENTICATED` sem cookie. Servidor encerrado após a verificação.
- Migrações executadas em PostgreSQL/WASM com Auth emulado: persistência após criar outro serviço, atomicidade com rollback de crédito inválido, unicidade, revisão concorrente, imutabilidade, privilégios, RLS e ranking após rotação.
- Serviço/HTTP: 30 respostas concorrentes sem crédito duplicado, 20 pedidos concorrentes sem gerar duas variantes, falha e saída inválida de IA, interrupção durante geração, dois acertos consecutivos, referência original/anterior, elegibilidade explícita após rotação e ausência de acesso a colegas/turmas anteriores.

## Pendências externas e limites

O Supabase `hackaton-lepv` foi configurado após autorização do usuário. As duas migrações e o seed estão aplicados, cinco contas fictícias foram provisionadas sem envio de mensagens e as rotas foram verificadas por HTTP com cookies reais. A rotação preservou 219 pontos anuais enquanto retirou os 219 de XP das raízes desativadas. Credenciais permanecem locais e ignoradas. Relatório e limites em [Configuração do Supabase](CONFIGURACAO_SUPABASE_LEPV.md). Hospedagem pública, convites administrativos e fornecedor real de IA continuam pendentes; o gateway permanece desabilitado.

O estado privado agrega o histórico por aluno e usa CAS para o MVP; crescimento além do hackathon exige paginação/compactação e revisão do custo de leitura. Os fatos relacionais de tentativa/crédito já têm índices e não são apagados por rotação. Os testes PGlite exercitam SQL real com conexão emulada, sem alegar ensaio de carga com múltiplas conexões do Supabase.

Os prompts visíveis desta etapa estão em `PROMPTS/03-nivaldo-2026-10-30_024...` a `029...`. A entrega foi publicada na branch `feat/nivaldo-core`, commit `0de7b11`, cujo workflow GitHub passou. A configuração e a validação posteriores do Supabase são registradas nesta etapa. Integração à `main` e deploy são etapas separadas da publicação da branch.
