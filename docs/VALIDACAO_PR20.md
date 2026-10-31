# Validação da atualização do PR #20

Data: 31/10/2026 (America/Sao_Paulo).
Responsável: Nivaldo, com Codex.
PR: https://github.com/NivaJr/Hackaton-LEPV/pull/20.
Branch: `feat/integrar-acessibilidade-aluno`.

## Integração conferida

- Cabeça do PR antes desta atualização: `01f55d70f34881e4e4ed8fde8351197fc97a97bd`.
- `main` incorporada: `a12f6d8e1714ae20bcc09013c0c7d27721792153`, incluindo os PRs #16, #17 e #21.
- A integração de conteúdo ocorreu sem conflitos. O README preserva as regras de pontuação do PR #20 e as instruções de acesso vindas da `main`.
- O painel real do professor, os boletins, a navegação e os ajustes de notificações da `main` foram preservados.
- Corrigida uma incompatibilidade entre os PRs #16 e #20: ambos renderizavam `NotificationBell` para o aluno. O sino fica apenas no cabeçalho de `AppShell`, evitando componentes, consultas periódicas e avisos duplicados.
- A migração `20261031150000_learning_scoring_confirmed.sql` preserva as tentativas já persistidas com a política anterior. Novas respostas usam a regra confirmada, inclusive em questões emitidas antes da migração.
- O trabalho foi realizado em worktree separado, preservando os arquivos pendentes do checkout principal e o histórico remoto.

## Checks locais

- `npm ci`: concluído com o lockfile existente.
- `npm run typecheck`: aprovado.
- `npm test -- --maxWorkers=2`: 376 testes aprovados em 34 arquivos. A limitação de concorrência evitou timeouts locais de cinco segundos sem alterar os testes ou seus limites.
- `python -B -m unittest discover -s tests -p test_archive_prompts.py`: sete testes aprovados.
- `npm run build`: aprovado (Next.js 16.4.3, Node.js 24.13.0).
- `git diff --check origin/main`: sem erros.

Os testes existentes exercitam erro na questão original, recuperação com 35 pontos de patente e 0 XP, encerramento após dois acertos consecutivos, persistência atômica, idempotência, permissões e rotação. Os testes de banco aplicam as migrações em PostgreSQL/WASM (PGlite), com Auth emulado. O teste do gateway Gemini usa respostas simuladas.

## Produção confirmada e migração aplicada

Em 31/10/2026, a configuração Production do projeto Vercel `hackaton-lepv` foi consultada com `vercel env pull --environment production`. A variável `NEXT_PUBLIC_SUPABASE_URL` confirma `https://alkvhjnqfjyjflaswdmi.supabase.co`. O alias `eai-lepv.vercel.app` aponta para um deployment Production pronto desse projeto. As chaves permaneceram em arquivos ignorados.

O MCP está ligado ao projeto diferente `sufgxlmwhxudykxpnvpa`; a consulta anterior não verificava o banco publicado. Nenhuma migração foi aplicada nesse outro projeto.

O banco correto tinha sete acertos antigos de recuperação com 70/49 pontos e duas instâncias de recuperação pendentes sob a política anterior. A migração original rejeitava o histórico antigo ao persistir uma nova operação. Quatro testes novos reproduzem essa transição, preservação do histórico, retomada com 35 pontos/0 XP e recusa de créditos forjados ou alterações retroativas.

Antes da aplicação, a migração foi executada em transação no banco correto, seguida de gravação dos estados existentes e `ROLLBACK`. O histórico foi aceito e a definição anterior foi confirmada intacta após a reversão.

A migração foi aplicada em **31/10/2026 às 15:44 UTC (12:44 de Brasília)** no projeto **`alkvhjnqfjyjflaswdmi`**, com substituição da função e registro da versão `20261031150000` na mesma transação. A aplicação verificou os pré-requisitos e recusaria sobrescrever uma função alterada após a inspeção.

Conferência posterior no banco hospedado:

- Versão `20261031150000`, nome `learning_scoring_confirmed`, presente no histórico.
- Texto do histórico e corpo da função iguais ao arquivo validado.
- SHA-256 do SQL normalizado para LF: `edeb11b4baf64d3e8b83834cdfe208aa0a25c7c6e4330a47c36a43ee14b530a9`.
- MD5 do corpo da função: `01e1a64a58cad9b0cf6bc4c3c9234c36`.
- Regra de 35 pontos presente; `search_path` fixado em `pg_catalog`.
- `EXECUTE` concedido a `service_role`; recusado a `anon` e `authenticated`.
- Créditos e tentativas anteriores preservados, sem conversão retroativa da pontuação.

O pré-requisito de banco para o merge está atendido. Os checks locais e a aplicação da migração não substituem o percurso na publicação atualizada.

## Teste após o merge

Executar `scripts/verify-learning-scoring.mjs` com ambiente privado, `--project-ref alkvhjnqfjyjflaswdmi`, `--base-url https://eai-lepv.vercel.app` e `--credentials` apontando para o arquivo ignorado da conta fictícia. A rotina escolhe uma questão ainda não iniciada, erra a original, solicita a recuperação, acerta-a e verifica +35 pontos de patente e +0 XP, inclusive reenvio idempotente. Interrompe a sequência de teste se ela permanecer aberta e grava somente um relatório sem credenciais quando `--report` aponta para um caminho ignorado.

As chaves privilegiadas e o gabarito usados para conferir a conta fictícia permanecem no processo de teste; as projeções públicas são verificadas para não conter gabarito. A rotina não integra o fluxo do navegador nem roda em `npm test`. O resultado na publicação deve ser registrado no PR após a execução real; até lá, não declarar esse percurso ou o fornecedor de IA validados.
