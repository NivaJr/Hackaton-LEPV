# Publicação na Vercel

Aplicação: **https://eai-lepv.vercel.app**. Configuração iniciada em 31/10/2026, após o usuário escolher preparar o deploy na Vercel.

## Projeto e código

- Conta: `nivaldojr15-6919`; escopo `Nivaldo's projects` (`nivaldos-projects-d24cfc1f`).
- Projeto Vercel: `hackaton-lepv`, ID `prj_at9moJeGpwIvs3smh1LQsw2yPCx0`.
- [Painel da aplicação](https://vercel.com/nivaldos-projects-d24cfc1f/hackaton-lepv).
- Repositório conectado: `NivaJr/Hackaton-LEPV`, com branch de produção `main`.
- Framework: Next.js. Runtime requerido pelo projeto: Node.js 24.x, alinhado com `.nvmrc`, o lockfile e o workflow GitHub.
- A publicação inicial foi feita pelo CLI a partir da Tarefa 03. Em 31/10/2026, a `main` integrada (`9fa3cb5`) foi publicada manualmente e o usuário conectou o novo repositório à Vercel. A API do projeto confirmou `github`, proprietário `NivaJr`, repositório `Hackaton-LEPV` e produção em `main`.
- O remoto local `origin` passou a usar o novo repositório; o anterior foi preservado como `upstream`. Pushes e merges de produção devem usar o novo `origin`.

## Banco usado pelo site e verificação da integração

A configuração Production da Vercel continua apontando para `https://alkvhjnqfjyjflaswdmi.supabase.co`. A consulta à API do Supabase confirmou o projeto `hackaton-lepv` na organização `pnwmxlwhvdmrgttxcwin`, com proprietário `nivaldo-raiz`. Conectar o novo repositório GitHub não transfere a propriedade do projeto Supabase.

Na consulta de 31/10/2026, não havia conexão GitHub cadastrada para esse projeto na API de integrações do Supabase. O projeto de destino da conta NivaJR precisa ser identificado antes de alterar o banco e as chaves do runtime. Nenhuma credencial deve entrar no Git.

O deploy manual de `9fa3cb5` foi promovido para o domínio público e validado no navegador: demonstração nova do aluno, login real, ficha, resposta salva somente leitura, turmas, responsáveis e resultados por aluno do coordenador. A publicação automática do novo vínculo GitHub deve ser acompanhada pelo SHA do commit e pelo estado `READY` da Vercel; um vínculo cadastrado sozinho não comprova que um build foi concluído.

## Endereço gratuito

O usuário escolheu um endereço gratuito da Vercel e confirmou manter `eai-lepv.vercel.app`. O nome exato `eai.vercel.app` já estava em uso e não pertence à conta conectada. `eai-lepv.vercel.app` foi adicionado aos domínios do projeto `hackaton-lepv`, para acompanhar as próximas publicações de produção. Não houve compra ou configuração do domínio `eai.com`.

O endereço inicial `https://hackaton-lepv.vercel.app` permanece como alias de compatibilidade. A URL de produção declarada no ambiente e no Supabase é `https://eai-lepv.vercel.app`.

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
| `LLM_PROVIDER` | `gemini` |
| `LLM_API_KEY` | Chave do Gemini, marcada como sensível na Vercel |
| `LLM_MODEL` | `gemini-3.5-flash-lite` |
| `LLM_TIMEOUT_MS` | `15000` |
| `TEACHER_METRICS_SOURCE` | `learning` |
| `RECOGNITION_STORE` | `supabase` |
| `NEXT_PUBLIC_APP_URL` | `https://eai-lepv.vercel.app` |

A senha direta do PostgreSQL e as senhas de demonstração não são variáveis de hospedagem. O runtime usa PostgREST/RPC com sessão verificada e a chave administrativa apenas no servidor. `.vercelignore` exclui `.env*`, `supabase/.temp/`, caches e metadados locais dos uploads. `.vercel/` e os arquivos de credenciais locais são ignorados pelo Git.

## Autenticação

O Supabase tem Site URL `https://eai-lepv.vercel.app` e os callbacks:

- `https://eai-lepv.vercel.app/auth/callback`.
- `https://hackaton-lepv.vercel.app/auth/callback`.
- `http://localhost:3000/auth/callback`.
- `http://127.0.0.1:3000/auth/callback`.

Cadastro público permanece desativado. Nenhum convite/email foi enviado nesta configuração. As cinco contas fictícias, seus papéis e as respectivas senhas estão somente no arquivo local `supabase/.temp/lepv-demo-credentials.json`. Uma conta Auth sem perfil, papel e vínculos não recebe acesso às APIs protegidas.

As chamadas de interface usam a mesma origem da aplicação, com cookies. O frontend deve integrar as rotas da branch da Tarefa 03 ao próprio app; os exemplos de `fetch` relativos no documento de rotas preservam esse contrato.

## Validação observada em produção

Verificação por HTTPS executada inicialmente no endereço `hackaton-lepv.vercel.app`, com relatório em `2026-10-31T03:16:18.988Z`, e repetida em `eai-lepv.vercel.app` em `2026-10-31T03:39:28.744Z`:

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

A infraestrutura e as APIs da Tarefa 03 estão disponíveis. O conteúdo de validação é sintético. O Gemini está configurado em Production e a extração de uma questão sintética foi executada pelo endpoint real, com HTTP 201; isso não comprova revisão pedagógica nem a validação de todas as operações de IA. As migrações de reconhecimento, conteúdo e handoff foram aplicadas; a integração e a validação hospedada desta etapa estão no [Handoff de Nivaldo](ENTREGA_NIVALDO_HANDOFF.md). Envio administrativo de emails e conteúdo curricular/BNCC revisado permanecem fora desta validação.

## Atualização de Production em 31/10/2026

As variáveis acima foram conferidas na API da Vercel. A URL do Supabase existente foi preservada, assim como as chaves sensíveis já cadastradas. `TEACHER_METRICS_SOURCE` e `RECOGNITION_STORE` foram adicionadas e seus valores conferidos sem caracteres extras. O modelo foi definido explicitamente porque o [Google limita modelos 2.5 a projetos que já os utilizavam](https://ai.google.dev/gemini-api/docs/models); a extração real funcionou com `gemini-3.5-flash-lite`.

Com sessões de contas previamente identificadas como fictícias, foram exercitados `/api/me` (aluno, professor e responsável), ficha, dez atividades, abertura de questão, ranking e painel do professor. APIs privadas sem sessão continuam retornando HTTP 401. Nenhum email foi enviado, nenhuma senha foi alterada e nenhum dado de aluno real foi usado.

O teste real também revelou uma incompatibilidade na recuperação: o núcleo passava `studentId` e `updatedAt` junto às preferências, mas o contrato `GenerationContext` e a validação estrita do gateway aceitam somente `interests`, `context` e `version`. A correção em `learning/server/service.ts` projeta esses três campos, preservando os contratos e o driver de Gallotte.

O novo teste `tests/learning-gemini-integration.test.ts` reproduziu `AI_UNAVAILABLE` antes da correção. Após a correção, o teste percorre ficha persistida, erro na original, duas variantes pelo gateway Gemini com HTTP simulado, créditos de 70 e 49 com referência `previous` e encerramento por dois acertos consecutivos. Também confere a ausência de identidade no conteúdo enviado ao provedor. Esse teste não usa a API real.

Validação local sobre a `main` atualizada (`ebf3d1f`) com a correção: typecheck, 321 testes TypeScript, sete testes Python do arquivador e build. Os relatórios operacionais locais, sem valores de credenciais, ficam em `.vercel/production-environment-audit.json` e `.vercel/production-verification.json`, ignorados pelo Git. O resultado da recuperação na publicação final deve ser confirmado nesse relatório após o deploy; o teste local sozinho não comprova a operação hospedada.
