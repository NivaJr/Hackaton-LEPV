# Configuração do Supabase LEPV

Registro de 30/10/2026, horário de Brasília. Projeto criado e configurado após autorização do usuário.

## Projeto e ambiente local

- Projeto: `hackaton-lepv`.
- Ref: `alkvhjnqfjyjflaswdmi`.
- Organização: `nivaldo-raiz's Org`.
- Região: São Paulo (`sa-east-1`).
- PostgreSQL: 17.11; `supabase/config.toml` alinhado à versão principal 17.
- [Painel do projeto](https://supabase.com/dashboard/project/alkvhjnqfjyjflaswdmi).
- URL da API: `https://alkvhjnqfjyjflaswdmi.supabase.co`.
- Checkout configurado: `C:\Users\nival\Hackaton-LEPV-nivaldo-core`, branch `feat/nivaldo-core`.

URL, chave publicável, chave privada e senha do banco estão no `.env.local` desse checkout. O arquivo é ignorado pelo Git. O ref do vínculo está em `supabase/.temp/project-ref`, também ignorado. Nenhuma chave, senha ou sessão foi adicionada à documentação ou ao repositório.

## Migrações e autenticação

O banco estava vazio antes da aplicação, com zero tabelas públicas e zero contas Auth. Foram aplicadas e registradas no histórico:

1. `20261030220000_foundation.sql`.
2. `20261031030000_learning.sql`.
3. `supabase/seed.sql`, com a escola fictícia e as seis matérias.

A conexão TCP com o pooler falhou nesta máquina. A aplicação foi realizada por `supabase db query --linked` via HTTPS, usando cópias transacionais dos arquivos originais. Cada migração e sua entrada em `supabase_migrations.schema_migrations` foram confirmadas juntas na mesma transação. As cópias estão em `supabase/.temp/apply-*.sql`; não reaplicá-las em um projeto já migrado. Conferir o histórico antes de aplicar qualquer migração futura.

Configuração remota conferida com `supabase config diff`: zero diferenças nas propriedades declaradas. Oito propriedades remotas não declaradas no arquivo local foram preservadas.

- Cadastro público desativado: `auth.enable_signup = false`.
- Site URL: `https://eai-lepv.vercel.app`.
- Callbacks autorizados: `https://eai-lepv.vercel.app/auth/callback`, `https://hackaton-lepv.vercel.app/auth/callback`, `http://localhost:3000/auth/callback` e `http://127.0.0.1:3000/auth/callback`.
- REST expõe somente `public`; `app_private` permanece fora dos schemas expostos.
- Chave privada utilizada exclusivamente pelo servidor e pelas ferramentas administrativas locais.

Nenhum convite ou mensagem foi enviado. Login de demonstração usa contas fictícias criadas administrativamente, com emails confirmados apenas para os testes.

## Política escolhida pelo usuário

```dotenv
LEPV_ORIGINAL_POINTS=100
LEPV_RECOVERY_REFERENCE=previous
LEPV_ADAPTIVE_XP_FOLLOWS_ROOT=true
```

Adaptativas: 70% do valor nominal anterior, com duas casas decimais; 100 → 70 → 49 → 34,30. Sem teto. A retirada da raiz remove o XP vinculado e preserva os pontos anuais. Ver [Decisões](DECISOES.md). As patentes continuam sinalizadas como proposta.

## Contas e conteúdo de validação

Foram criadas cinco contas fictícias: coordenador, professor de Matemática, aluno, responsável confirmado e aluno de outra escola. Senhas e IDs ficam somente em `supabase/.temp/lepv-demo-credentials.json`, arquivo local ignorado. Os emails usam `@demo.lepv.test`; não são contatos reais.

A turma `6º A — Validação sintética LEPV` possui doze snapshots de aritmética identificados como sintéticos, para verificar ativação e rotação. Eles não representam cobertura curricular, catálogo BNCC validado ou questões geradas por IA. As variantes de recuperação usadas na verificação foram fixtures privadas inseridas pela ferramenta administrativa; não foi adicionado um adaptador fictício ao gateway da aplicação.

Ferramenta opcional, sempre com alvo explícito:

```powershell
node --env-file=.env.local scripts/verify-supabase-demo.mjs --project-ref alkvhjnqfjyjflaswdmi --provision
node --env-file=.env.local scripts/verify-supabase-demo.mjs --project-ref alkvhjnqfjyjflaswdmi --verify --base-url http://127.0.0.1:3000
```

`--provision` prepara apenas contas e dados fictícios conhecidos e não envia email. `--verify` exige o servidor local ativo, realiza operações nas contas de demonstração, consome raízes ainda não respondidas e testa a rotação semanal. Não executar essa rotina como teste padrão ou contra dados reais.

## Validação real observada

Execução registrada em `2026-10-31T02:56:15.002Z`, equivalente à noite de 30/10 em Brasília:

- Login real nos quatro perfis e no aluno de outra escola.
- RLS: isolamento entre escolas, recusa de elevação de papel, histórico limitado à matéria do professor e edição de saúde/apoio limitada ao responsável confirmado.
- Vínculos pendente e revogado recusam leitura; vínculo fictício foi restaurado após os testes.
- Gabaritos privados e RPCs administrativas não são acessíveis ao aluno/anônimo.
- HTTP com cookies reais: ficha, atividades, instâncias, resposta, dica, interrupção, resumo, TOP 10 e registro de acesso.
- Oito reenvios concorrentes produziram a mesma tentativa, sem crédito duplicado.
- Original correta concedeu 100; duas variantes sintéticas corretas concederam 70 e 49 e encerraram a recuperação.
- Cinco tentativas e dez entradas no livro de pontos.
- Rotação idempotente: XP **219 → 0**; pontos anuais **219 → 219**.
- IA desabilitada retornou `503 AI_UNAVAILABLE`, sem perder a tentativa já persistida.

O relatório sem credenciais está em `supabase/.temp/lepv-verification-report.json`. O build de produção com o novo ambiente passou antes da verificação HTTP. Os 82 testes locais e o workflow GitHub do commit `0de7b11` também passaram.

## Etapas seguintes

A aplicação está publicada em https://eai-lepv.vercel.app, com variáveis de produção na Vercel e callbacks do Supabase atualizados. O endereço anterior permanece autorizado para compatibilidade. Ver [Configuração da Vercel](CONFIGURACAO_VERCEL_LEPV.md). O fornecedor real de IA, os convites administrativos e a integração das telas dos demais integrantes permanecem pendentes.
