# Publicação na Vercel

Aplicação: **https://hackaton-lepv.vercel.app**. Configuração iniciada em 31/10/2026, após o usuário escolher preparar o deploy na Vercel.

## Projeto e código

- Conta: `nivaldojr15-6919`; escopo `Nivaldo's projects` (`nivaldos-projects-d24cfc1f`).
- Projeto Vercel: `hackaton-lepv`, ID `prj_at9moJeGpwIvs3smh1LQsw2yPCx0`.
- [Painel da aplicação](https://vercel.com/nivaldos-projects-d24cfc1f/hackaton-lepv).
- Branch de implementação: `feat/nivaldo-core`. A integração à `main` continua separada da publicação por CLI.
- Framework: Next.js. Runtime requerido pelo projeto: Node.js 24.x, alinhado com `.nvmrc`, o lockfile e o workflow GitHub.
- Publicação executada pelo CLI a partir do checkout da Tarefa 03. Não presumir que outra branch será publicada automaticamente; coordenar a política de integração/deploy com a equipe.

## Variáveis de produção

Configuradas no ambiente **Production**, sem valores privados no código:

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto LEPV |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publicável usada na autenticação |
| `SUPABASE_SECRET_KEY` | Chave privada do servidor, marcada como sensível na Vercel |
| `LEPV_ORIGINAL_POINTS` | `100` |
| `LEPV_RECOVERY_REFERENCE` | `previous` |
| `LEPV_ADAPTIVE_XP_FOLLOWS_ROOT` | `true` |
| `LLM_PROVIDER` | `disabled` |
| `LLM_TIMEOUT_MS` | `15000` |
| `NEXT_PUBLIC_APP_URL` | `https://hackaton-lepv.vercel.app` |

A senha direta do PostgreSQL e as senhas de demonstração não são variáveis de hospedagem. O runtime usa PostgREST/RPC com sessão verificada e a chave administrativa apenas no servidor. `.vercelignore` exclui `.env*`, `supabase/.temp/`, caches e metadados locais dos uploads. `.vercel/` e os arquivos de credenciais locais são ignorados pelo Git.

## Autenticação

O Supabase tem Site URL `https://hackaton-lepv.vercel.app` e os callbacks:

- `https://hackaton-lepv.vercel.app/auth/callback`.
- `http://localhost:3000/auth/callback`.
- `http://127.0.0.1:3000/auth/callback`.

Cadastro público permanece desativado. Nenhum convite/email foi enviado nesta configuração. As cinco contas fictícias, seus papéis e as respectivas senhas estão somente no arquivo local `supabase/.temp/lepv-demo-credentials.json`. Uma conta Auth sem perfil, papel e vínculos não recebe acesso às APIs protegidas.

As chamadas de interface usam a mesma origem da aplicação, com cookies. O frontend deve integrar as rotas da branch da Tarefa 03 ao próprio app; os exemplos de `fetch` relativos no documento de rotas preservam esse contrato.

## Validação observada em produção

Verificação por HTTPS no domínio público, com relatório inicial em `2026-10-31T03:16:18.988Z`:

- Página inicial, login e `/api/health` responderam HTTP 200.
- APIs privadas sem sessão retornaram HTTP 401.
- As sessões dos cinco usuários fictícios foram reconhecidas pelo runtime da Vercel, com ID e papel corretos em `/api/me`.
- Ficha, dez atividades, TOP 10 e resumo autorizado usaram o Supabase real.
- Oito aberturas concorrentes retornaram a mesma instância, sem duplicar a atribuição ou conceder pontos.
- Aluno de outra escola não acessou instância, ranking ou resumo; professor não executou operação exclusiva do aluno.
- XP permaneceu em 0 após a rotação e pontos anuais em 219, consistentes com a validação do banco.
- A resposta pública da questão e os assets do navegador inspecionados não continham os valores privados locais.

O relatório sem credenciais está em `supabase/.temp/lepv-vercel-verification-report.json`. `/api/health` informa configuração presente; a validação real do banco foi feita pelos testes de sessão, RLS e persistência registrados, não por esse endpoint de health.

O build remoto de produção passou. A configuração completa de ambiente precisa de novo deploy quando alterada; o domínio público permanece o mesmo ao promover a versão seguinte. Os 82 testes locais e o workflow de Node 24 passaram no preparo da hospedagem.

## Limites atuais

A infraestrutura e as APIs da Tarefa 03 estão disponíveis. O conteúdo de validação é sintético. As telas ainda dependem da integração dos outros integrantes com essas APIs. Fornecedor real de IA, envio administrativo de convites e conteúdo curricular/BNCC revisado permanecem pendentes. Recuperação sem fornecedor configurado retorna `503 AI_UNAVAILABLE` e preserva a tentativa.
