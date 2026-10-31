# LEPV — base compartilhada do hackathon

Aplicação web de educação adaptativa para o 6º ao 9º ano. Esta entrega estabelece a fundação para quatro pessoas trabalharem em paralelo; os fluxos de negócio completos continuam nas tarefas individuais.

Ambiente publicado: **https://eai-lepv.vercel.app**. Configuração e evidências em [Supabase](docs/CONFIGURACAO_SUPABASE_LEPV.md) e [Vercel](docs/CONFIGURACAO_VERCEL_LEPV.md).

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
- Domínio de recuperação, pontuação confirmada, patentes cumulativas e permissões, com testes.
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
- Exercício comum vale 50 pontos de patente e 0 XP; desafio semanal vale 100 de patente e 100 XP; acerto de recuperação vale 35 de patente e 0 XP.
- Patentes são cumulativas e avançam a cada 1.000 pontos, de Ferro até Onisciente.
- XP ativo e pontos anuais são separados. Dez desafios ficam ativos; entram dois por semana e saem os dois mais antigos. A saída remove o XP do ranking, não os pontos anuais.
- Saúde e apoio: leitura por perfis vinculados e edição pelo responsável confirmado. Histórico: professor edita somente sua matéria/turma; coordenador edita na instituição.
- A ficha é editada pelo próprio aluno. Consulta por outros perfis segue pendente e está restrita na base.

## O que falta implementar

As demais frentes ainda cobrem CRUD/importação de alunos, convites administrativos, listas PDF/Word e armazenamento, banco de conteúdo, catálogo BNCC, interfaces, amizades e feedback da IA. Integrar essas frentes às APIs de aprendizagem e ao registro explícito de acesso. A base não contém 240 questões curriculares prontas nem uma LLM integrada. A Tarefa 03 validou Supabase e APIs hospedadas na Vercel com dados sintéticos; IA real e integração das telas continuam pendentes.

## Configuração de IA

O contrato está em `src/lib/llm/gateway.ts`. O adaptador inicial rejeita as operações com `AiNotConfiguredError`. Gallotte implementará os fornecedores usando configuração no servidor: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_BASE_URL` quando aplicável e `LLM_TIMEOUT_MS`.

Escolher um fornecedor cujas condições atendam ao público-alvo antes de uso real. Não enviar automaticamente nome, email ou informações de saúde; o contexto de adaptação usa interesses pertinentes e a habilidade trabalhada. Não colocar chave no cliente, em prompts públicos ou em commits.

## Git e estado da publicação

Repositório solicitado: `https://github.com/VivasLasViegas/Hackaton-LEPV`.

A base foi preparada em diretório isolado porque o conteúdo remoto não pôde ser lido pela conexão disponível. Não sobrescrever a branch principal nem usar push forçado. Se o push desta entrega não estiver disponível, usar o pacote/bundle e seguir [Integração](docs/INTEGRACAO.md) depois que o acesso estiver liberado. Uma revisão em branch separada preserva qualquer código já existente.

Cada integrante registra seus prompts em `PROMPTS/`. O hook local preparado para Codex depende de runtime compatível e revisão/confiança; não registra automaticamente conversas nos sites de Claude ou ChatGPT.
