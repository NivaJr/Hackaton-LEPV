# LEPV — base compartilhada do hackathon

Aplicação web de educação adaptativa para o 6º ao 9º ano. Esta entrega estabelece a fundação para quatro pessoas trabalharem em paralelo; os fluxos de negócio completos continuam nas tarefas individuais.

Ambiente publicado: **https://eai-lepv.vercel.app**. Configuração e evidências em [Supabase](docs/CONFIGURACAO_SUPABASE_LEPV.md) e [Vercel](docs/CONFIGURACAO_VERCEL_LEPV.md).

## Acessar a plataforma

1. Abra https://eai-lepv.vercel.app/login. A página inicial também tem o link para o login.
2. Entre com o e-mail e a senha de um dos perfis da tabela abaixo.
3. Depois do login, a plataforma abre a área do perfil: `/aluno`, `/professor`, `/coordenador` ou `/responsavel`. Para ver outro perfil, saia da conta e entre com o e-mail dele.

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Aluno | `student@demo.lepv.test` | `OQ15-5NV80Fvsq0Tf-Qf8px9HutOcUtw` |
| Professor | `teacher@demo.lepv.test` | `jQUpFbbgECVK_pa7f2ww3bz-ng75j2-O` |
| Coordenador | `coordinator@demo.lepv.test` | `TKlLGfsUBry3D0ZHiqM0B0tI3qO4rUMp` |
| Responsável | `guardian@demo.lepv.test` | `hn6HL2smflhNZFySuA0L2yUw-h0KSDM8` |

São contas de demonstração criadas para a avaliação do hackathon, com dados fictícios. Não cadastre dados reais de alunos nelas. Sem login, as páginas `/demo/aluno`, `/demo/professor`, `/demo/coordenador` e `/demo/responsavel` mostram os quatro perfis com dados de exemplo.

O plano de negócio está em [plano-de-negocio/EAI-plano-de-negocio.pdf](plano-de-negocio/EAI-plano-de-negocio.pdf).

## Executar

Requisitos: Node.js 24 LTS e npm. As versões instaladas ficam no `package-lock.json`.

```sh
npm ci
npm run dev
```

Abrir `http://localhost:3000`. A página inicial permite explorar os quatro perfis em `/demo/aluno`, `/demo/coordenador`, `/demo/professor` e `/demo/responsavel`, com dados fictícios e sem persistência. A demonstração não usa chave de IA nem representa autenticação real.

Para conectar o Supabase, copiar `.env.example` para `.env.local`. No PowerShell:

```powershell
Copy-Item .env.example .env.local
```

No Linux/macOS:

```sh
cp .env.example .env.local
```

Preencher `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, aplicar a migração/seed e provisionar os perfis conforme [supabase/README.md](supabase/README.md). Nenhum segredo real está incluído. A chave privilegiada, quando necessária para provisionamento futuro, fica somente no servidor.

## O que já está implementado

- Next.js, React, TypeScript, Tailwind e lockfile compartilhado.
- Página inicial, layout e telas-base dos quatro perfis; demonstração identificada separada dos acessos reais.
- Login por senha com Supabase; callback de convite e definição de senha depois de validar a sessão.
- Refresh de sessão, verificação de usuário no servidor e proteção das páginas por papel.
- Resolver de permissões que carrega vínculos confirmados e atribuições do banco, sem confiar no papel enviado pelo navegador.
- `GET /api/me` autenticado; `GET /api/catalog` com anos/matérias; `GET /api/health` com estado de configuração, sem testar conexão externa.
- Contratos Zod estritos que separam enunciado público, gabarito privado e submissão de resposta.
- Domínio puro de recuperação, recompensa de 70%, patentes propostas e permissões, com testes.
- Migração de identidade, escola, turmas, vínculos, ficha, histórico, saúde e apoio; seed sem senhas.
- Contrato do gateway de LLM, inicialmente desabilitado, com erro explícito em vez de geração fictícia.
- Workflow de checks e registro de prompts em `PROMPTS/`.
- Tarefa 03: APIs de ficha, atividades, resposta, recuperação, dica, interrupção, resumo e TOP 10; migração aditiva com tentativas/créditos atômicos e rotação protegida. Contratos em [Rotas da Tarefa 03](docs/ROTAS_REAIS_TAREFA_03_NIVALDO.md), validação em [Entrega de Nivaldo](docs/ENTREGA_NIVALDO_CORE.md) e ambiente real em [Configuração do Supabase](docs/CONFIGURACAO_SUPABASE_LEPV.md).

Login e permissões foram exercitados com contas fictícias no projeto Supabase LEPV; as evidências estão no registro de configuração. As rotas `/aluno`, `/coordenador`, `/professor` e `/responsavel` são protegidas. A área do aluno já consome as APIs reais de aprendizagem; as frentes individuais mantêm os demais fluxos.

## Quatro tarefas individuais

| Pessoa | Responsabilidade | Ficha para executar |
| --- | --- | --- |
| **Viegas** | Telas e fluxo do aluno; integra os contratos de conteúdo, tentativas e ranking | [Tarefa 01](docs/TAREFA_01_VIEGAS.md) |
| **Fabiano** | Coordenador, turmas, importação de alunos e painel do responsável | [Tarefa 02](docs/TAREFA_02_FABIANO.md) |
| **Nivaldo** | Banco, autenticação, permissões, tentativas e pontuação | [Tarefa 03](docs/TAREFA_03_NIVALDO.md) |
| **Gallotte** | Professor, importação das questões, IA e validação do fluxo completo | [Tarefa 04](docs/TAREFA_04_GALLOTTE.md) |

As telas de professor ficam com Gallotte, e as do responsável com Fabiano, reaproveitando os layouts-base. Nivaldo mantém a fundação de dados/auth/pontuação; os demais podem implementar os endpoints de seu domínio usando essa fundação, sem duplicar autenticação ou cálculo de pontos.

Ler [Divisão da equipe](docs/DIVISAO_EQUIPE.md) e [Integração](docs/INTEGRACAO.md) antes de começar. Cada tarefa inclui arquivos de propriedade, contratos, critérios de aceite e um prompt para usar na LLM.

Tarefa 02: escopo, validação e limites em [Entrega da Tarefa 02](docs/ENTREGA_FABIANO_GESTAO.md).

Tarefa 01: `/aluno` integrado às APIs e ao Supabase real; `/demo/aluno` preserva o cliente fake. Fluxos, migração e validação no navegador em [Área do aluno integrada](docs/ENTREGA_ALUNO_INTEGRADO.md).

## Validação

```sh
npm run typecheck
npm test
npm run build
```

O workflow `.github/workflows/checks.yml` executa esses comandos com Node 24. A validação do banco remoto, convite por email, armazenamento e fornecedor de IA exige os serviços reais da equipe; configuração presente não significa conexão validada.

`tests/database.test.ts` aplica a migração e o seed reais em PostgreSQL/WASM (PGlite), com esquema Auth mínimo emulado e operações sob papéis não proprietários. Isso exercita RLS, grants e vínculos sem credenciais externas; não substitui os testes no Supabase hospedado. A prévia gerenciada disponível nesta sessão não iniciou o Next.js por incompatibilidade dos argumentos injetados, portanto a inspeção visual no navegador ficou pendente.

## Regras que a base preserva

- Seis matérias: Matemática, Português, Inglês, História, Geografia e Biologia. Biologia usa o componente BNCC `CI` (Ciências).
- Questões de múltipla escolha e associação a habilidades reais. A validação sintática dos códigos não substitui um catálogo oficial, que ainda será carregado.
- Questão respondida não pode ser refeita. Erro produz outra questão e explicação; recuperação termina após dois acertos consecutivos ou interrupção.
- A primeira adaptativa vale 70% da original. O teto por sequência e a fórmula de bônus continuam pendentes; `DEFAULT_RECOVERY_CAP_POINTS = null` não aprova um teto silenciosamente.
- Base de 100 pontos e limites anuais das patentes são propostas identificadas em `src/config/scoring.ts`, não regras aprovadas.
- XP ativo e pontos anuais são separados. A Tarefa 03 implementa persistência de tentativas, livro de pontos e rotação, com migrações aplicadas no Supabase LEPV. Integrar as telas às APIs existentes.
- Saúde e apoio: leitura por perfis vinculados e edição pelo responsável confirmado. Histórico: professor edita somente sua matéria/turma; coordenador edita na instituição.
- A ficha é consultada e editada somente pelo próprio aluno.

## O que falta implementar

O catálogo curricular completo, a revisão BNCC, o armazenamento dos arquivos originais, amizades e os demais itens ainda abertos nas entregas individuais continuam pendentes. A aplicação não contém 240 questões curriculares revisadas. Gestão e aluno já consomem APIs reais; o gateway Gemini possui extração e recuperação, com validação hospedada registrada separadamente dos testes simulados. Persistência de conteúdo, reconhecimentos, auditoria e métricas agregadas estão descritas no [Handoff de Nivaldo](docs/ENTREGA_NIVALDO_HANDOFF.md).

## Configuração de IA

O contrato está em `src/lib/llm/gateway.ts`. O driver Gemini usa configuração somente no servidor: `LLM_PROVIDER=gemini`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_BASE_URL` quando aplicável e `LLM_TIMEOUT_MS`. `LLM_PROVIDER=disabled` e configuração ausente/inválida recusam a geração explicitamente. Production usa um modelo definido no ambiente; veja [Configuração da Vercel](docs/CONFIGURACAO_VERCEL_LEPV.md). A existência da configuração não substitui a chamada real ao fornecedor.

Escolher um fornecedor cujas condições atendam ao público-alvo antes de uso real. Não enviar automaticamente nome, email ou informações de saúde; o contexto de adaptação usa interesses pertinentes e a habilidade trabalhada. Não colocar chave no cliente, em prompts públicos ou em commits.

## Git e estado da publicação

Repositório atual: `https://github.com/NivaJr/Hackaton-LEPV`. O histórico do repositório anterior, `VivasLasViegas/Hackaton-LEPV`, foi preservado; neste checkout, o remoto anterior é `upstream` e o novo é `origin`.

A base foi preparada em diretório isolado porque o conteúdo remoto não pôde ser lido pela conexão disponível. Não sobrescrever a branch principal nem usar push forçado. Se o push desta entrega não estiver disponível, usar o pacote/bundle e seguir [Integração](docs/INTEGRACAO.md) depois que o acesso estiver liberado. Uma revisão em branch separada preserva qualquer código já existente.

Cada integrante registra seus prompts em `PROMPTS/`. O hook local preparado para Codex depende de runtime compatível e revisão/confiança; não registra automaticamente conversas nos sites de Claude ou ChatGPT.
