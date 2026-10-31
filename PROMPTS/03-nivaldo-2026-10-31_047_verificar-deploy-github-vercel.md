# Sincronização do deploy com o GitHub

Data: 2026-10-31
Autoria: Nivaldo (usuário)

## Texto original

o deploy no vercel tá atualizando com o repo no github? as mudanças não estão aparecendo

## Diagnóstico e resultado observado

O projeto Vercel hackaton-lepv estava sem link GitHub e o domínio público servia o commit 982c5fa. A tentativa de conectar o repositório privado retornou HTTP 400, repo_not_found; a conta GitHub atual tem push, sem administração. A autorização da integração pelo proprietário do repositório continua necessária para o deploy automático.

O push e o merge do PR #7 foram concluídos, e o workflow da main 9fa3cb5 passou, incluindo 7 testes Python, testes JavaScript, typecheck e build. A main foi publicada manualmente de checkout limpo na Vercel e promovida para https://eai-lepv.vercel.app. Deployment: dpl_5FT39jjpZcTvgLhKQhGHCXHZxMF3. Metadados confirmam gitCommitSha 9fa3cb5cd470ab8b0813dd376a1e8b3d2094fc12 e source cli. O Node do projeto foi alinhado ao 24.x já declarado no repositório.

Em 31/10/2026 às 11:39:59 UTC, o navegador confirmou o domínio público, health JSON, API sem sessão 401, guard, demonstração nova do aluno, login real do aluno, ficha e resposta salva somente leitura, login do coordenador, turmas, responsáveis e resultados por aluno. A API de resultados do coordenador retornou os créditos reais persistidos da conta sintética. A automação GitHub/Vercel permanece desconectada; nenhuma chave ou senha foi publicada.