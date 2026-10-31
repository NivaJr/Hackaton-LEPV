# Resolver conflitos e preparar o PR 20

Data: 2026-10-31
Autoria: Nivaldo (usuário)
Origem: pedido direto nesta sessão do Codex; inclui a condição de merge recebida do usuário.

## Texto original

Se a atualização foi o Nivaldo aplicar a migração em produção, pode fazer o merge. Se não foi isso, ainda não faça. No GitHub não vejo nenhuma confirmação da migração, e não tenho acesso para consultar o banco de produção.

Condição	Situação
Conflitos do #20	Nenhum; o PR está limpo e mergeável
Checks do GitHub	Aprovados
Novidades na main	Nenhum commit novo desde a última conferência
Novidades no PR #20	Nenhum comentário, revisão ou commit novo
Migração 20261031150000_learning_scoring_confirmed.sql em produção	Sem confirmação
Uma migração aplicada direto no Supabase não aparece no GitHub, então ele pode já ter feito isso sem deixar sinal aqui. Só ele pode confirmar.

Antes do merge, pergunte ao Nivaldo: "A 20261031150000_learning_scoring_confirmed.sql já está aplicada em produção?"

Se sim: pode fazer o merge.
Se não: espere. Sem ela, acertar uma questão de recuperação dá erro para o aluno em produção.
Depois do merge, faça um teste rápido: erre uma questão e acerte a recuperação. Devem entrar 35 pontos e 0 XP. Se aparecer erro nesse passo, é sinal de que a migração não foi aplicada, e aí reverta o merge ou peça ao Nivaldo para aplicá-la na hora.

O registro deste prompt (02-fabiano-2026-10-31_057_reconferir-merge-pr-20.md) está em PROMPTS/, sem commit.

resolva os conflitos sem erro ao ponto de deixar o pr20 pronto para dar merge
