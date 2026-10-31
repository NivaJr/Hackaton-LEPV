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
- A migração `20261031150000_learning_scoring_confirmed.sql` foi preservada sem alterações.
- O trabalho foi realizado em worktree separado, preservando os arquivos pendentes do checkout principal e o histórico remoto.

## Checks locais

- `npm ci`: concluído com o lockfile existente.
- `npm run typecheck`: aprovado.
- `npm test`: 372 testes aprovados em 33 arquivos.
- `python -B -m unittest discover -s tests -p test_archive_prompts.py`: sete testes aprovados.
- `npm run build`: aprovado (Next.js 16.4.3, Node.js 24.13.0).
- `git diff --check origin/main`: sem erros.

Os testes existentes exercitam erro na questão original, recuperação com 35 pontos de patente e 0 XP, encerramento após dois acertos consecutivos, persistência atômica, idempotência, permissões e rotação. Os testes de banco aplicam as migrações em PostgreSQL/WASM (PGlite), com Auth emulado. O teste do gateway Gemini usa respostas simuladas.

## Condição para o merge e publicação

O merge do PR na `main` permanece condicionado à confirmação de Nivaldo de que `20261031150000_learning_scoring_confirmed.sql` está aplicada no banco de produção. Nenhuma migração remota foi aplicada nesta atualização.

Consulta somente de leitura ao projeto Supabase conectado pelo MCP (`sufgxlmwhxudykxpnvpa`):

- O histórico retorna seis migrações, sem a versão `20261031150000`.
- A definição de `learning_commit_student(uuid,uuid,bigint,bigint,jsonb)` não contém a regra de recuperação `then 35` presente na migração do PR.
- A documentação anterior ainda referencia outro projeto (`alkvhjnqfjyjflaswdmi`); essa consulta não comprova qual projeto está configurado na publicação de produção. É necessário confirmar o alvo de produção e a aplicação da migração antes do merge.

Não foram realizados nesta atualização testes no navegador com sessão real, chamadas ao fornecedor de IA ou operações de escrita no Supabase hospedado. Os checks locais não substituem a validação em produção.

Após a confirmação da migração e o merge, executar com conta de teste autorizada: errar uma questão, abrir a recuperação e acertá-la. Conferir acréscimo de 35 pontos de patente e 0 XP. Se a resposta falhar por incompatibilidade com a migração, interromper a validação e aplicar a migração imediatamente ou reverter o merge, conforme a orientação do usuário.
