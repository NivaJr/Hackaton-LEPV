# Integração das quatro frentes

## Base comum e limite da entrega

A base concentra Next.js/TypeScript, Tailwind, Supabase, login/convite, sessão/proxy, quatro shells protegidos, contratos Zod, catálogo, regras puras/testes, gateway desabilitado e migração de identidade/vínculos/preferências/histórico/saúde/apoio. Inspecionar README/código recebidos para confirmar assinaturas e estado dos checks. Não reimplementar a base.

`getOptionalSession()` é perfil mínimo; `getSessionContext()` já monta contexto completo com vínculos confirmados e atribuições lidos no servidor. RLS está na foundation. Login/Supabase real requer configuração externa e não é comprovado por build local.

APIs reais de learning/content/roster/family continuam tarefas. Shells, fixtures e gateway desabilitado não significam jornadas prontas, banco completo ou IA integrada.

## Pessoas, branches e propriedade

Todos começam no mesmo commit-base, em checkout/worktree próprio. Não usar quatro agentes no mesmo diretório/branch, last-writer-wins, force-push ou cópia de arquivos inteiros para apagar conflitos.

| Pessoa | Branch sugerida | Donos | Como começa sem esperar |
| --- | --- | --- | --- |
| Viegas | `feat/viegas-aluno` | `learning/ui`, `client`, `fixtures`; conteúdo da página aluno | StudentLearningClient fake e contratos |
| Fabiano | `feat/fabiano-gestao` | features/APIs roster/family; páginas coordenador/responsável | Ports de métricas/repositórios fake e auth/RLS da base |
| Nivaldo | `feat/nivaldo-core` | SQL/banco/auth; learning/server, learning/domain, config/scoring, APIs learning | Repositório em memória e IA desabilitada |
| Gallotte | `feat/gallotte-conteudo-ia` | content/API content; página professor; lib/llm; validação completa | Texto/questões/repository fake e contratos |

**Pontuação inteira tem dono único: Nivaldo.** `src/config/scoring.ts` configura; `src/features/learning/domain/scoring.ts` calcula; `src/features/learning/server/**` autoriza/persiste; `src/app/api/learning/**` expõe resultados; SQL assegura unicidade; projeções alimentam ranking. UI, importação e driver LLM não concedem pontos nem duplicam fórmula.

Cada dono troca apenas conteúdo de sua página `src/app/(workspace)/<perfil>/page.tsx`, preservando guard. Shell/dashboard globais e `src/app/demo/[role]/page.tsx` exigem acordo. Criar componentes locais em vez de tomar arquivos globais.

## Contratos e arquivos compartilhados

Nivaldo integra SQL, identidade, autorização, contratos centrais, catálogo e dependências/lockfiles após combinar consumidores. Gallotte mantém IA; a interface pública/factory é compartilhada e não pode quebrar chamadores unilateralmente.

- Contrato novo/alterado: propor entrada/saída, erros, motivo e consumidores afetados antes de editar. Não criar schema paralelo para esconder incompatibilidade.
- Dependência: informar pacote/versão/necessidade/alternativa. Um único integrador altera `package.json` e lockfile; não instalar simultaneamente no mesmo checkout.
- Auth e fornecedor não são copiados em cada feature. Ports/adapters permitem trabalho paralelo; adapter fake é trocado por real preservando contrato.

| Área | Fonte comum |
| --- | --- |
| Identidade/catálogo | Role, Grade, SubjectId, SessionContext, SUBJECTS, GRADES |
| Ficha/questões | StudentPreferences, StudentPreferencesUpdate, QuestionForStudent, QuestionAnswerKey, GeneratedQuestion |
| Resposta/métricas | AttemptSubmission, AttemptResult, StudentSummary |
| Regras | calculateRecoveryReward, advanceRecovery, interruptRecovery, getRankForPoints |
| Permissões | canViewStudentData, canEditStudentData, canEditStudentPreferences |
| Sessão | src/lib/auth/session.ts: getSessionContext, requireRole, getOptionalSession |
| IA | src/lib/llm/gateway.ts: LearningAiGateway, getLearningAiGateway e desabilitado explícito |

Assinaturas vêm do código. Regex de BNCC não comprova existência de habilidade oficial. QuestionAnswerKey não entra em GET destinado ao aluno. SessionContext é construído no servidor, nunca confiado do JSON do cliente.

## Acordo mínimo entre pessoas

1. Viegas publica operações de StudentLearningClient; Nivaldo devolve endpoints/payloads alinhados aos schemas. Fake permite começar antes da API real.
2. Fabiano publica prévia/confirmação de importação e metrics ports. Nivaldo combina dados/provisionamento; feedback usa summarizeStudent de Gallotte.
3. Gallotte publica port de conteúdo/origem. Nivaldo combina tabelas e vínculo de instâncias/tentativas à raiz. LLM não escolhe créditos, papéis ou identidade.
4. Gallotte preserva gateway compatível e exemplos stub; todos testam sem chave. Fixture não se apresenta como consulta real.

## Regras que não mudam na divisão

- Quatro perfis desde o início; professor importa listas PDF/Word; responsável vê apenas filhos vinculados.
- 6º–9º ano e Matemática, Português, Inglês, História, Geografia e Biologia. Verificar BNCC oficial, inclusive componente Ciências para o rótulo Biologia.
- Questão respondida não pode ser refeita. Erro mostra explicação e gera nova análoga/adaptada; dica na questão nova. Dois acertos consecutivos ou interrupção encerram recuperação.
- 70% confirmados. Base de 100, limiares, teto/fórmula e referência de adaptações sucessivas continuam propostas. O teto na base é null; não ativar silenciosamente.
- XP soma matérias dos exercícios ativos; retirada não apaga pontos anuais. TOP 10 da turma. Política final de rotação/empate/XP adaptativo deve ficar explícita no núcleo.
- Aluno edita interesses; professor histórico da sua matéria/turma e coordenador seu escopo. Responsável edita saúde/apoio. Leitura por tipos de perfil continua limitada ao vínculo, nunca aos colegas.
- Chaves só no servidor; fornecedor configurável não equivale a aprovado para o público. Não enviar dados pessoais/sensíveis automaticamente.

## Ordem das migrações

Somente Nivaldo escreve/aplica SQL comum. Fabiano/Gallotte enviam necessidades por contrato, sem migrações concorrentes. Preservar a foundation existente; mudanças são aditivas e com RLS coerente.

1. `20261030220000_foundation.sql`: base existente.
2. `20261031010000_core_extensions.sql`: extensões comuns/provisionamento, somente se necessárias.
3. `20261031020000_content.sql`: listas/banco/versões/habilidades/origem acordados com Gallotte.
4. `20261031030000_learning.sql`: instâncias/tentativas/recuperação/lançamentos/rotação.
5. `20261031040000_import_feedback.sql`: auditoria de importação/cache de feedback, se necessários a Fabiano.

Nomes novos são reservas sugeridas, não arquivos já existentes. Inspecionar a base antes de criar objetos; não referenciar tabelas/IDs não acordados nem reescrever migração aplicada. Testar políticas com papéis diferentes quando houver banco configurado e declarar quando não foi possível.

## Ordem de integração e validação completa

Publicar contratos primeiro. Sugestão: extensões core de Nivaldo → gestão/família de Fabiano → content/gateway de Gallotte → UI aluno de Viegas. Isso não bloqueia desenvolvimento: usar fakes e, se preciso, integrar feature desabilitada/stub explícito antes. Depois de cada merge, executar checks e um percurso sintético.

Gallotte coordena validação com os quatro: turma/importação → convite/primeiro acesso → lista revisada/publicada → resposta/recuperação → responsável vê métricas/edita apoio. Incluir arquivo inválido, tentativa repetida, IA desabilitada e usuário sem vínculo. Navegador/serviço externo só é declarado testado quando houve execução observada.

## Cobertura e demonstração

4 séries × 6 matérias = 24 combinações. Dez questões em cada uma exigem **240 questões revisadas**. Filtros, enums, fixtures repetidas ou geração possível não comprovam esse volume. Informar combinações navegáveis, questões reais/revisadas, exemplos sintéticos, adaptações stub/geradas e lacunas. Não afirmar geração, extração ou BNCC validada quando o dado veio de fixture.

## Checkpoint de entrega

Preencher no PR ou arquivo da própria feature, não disputar um documento comum:

```text
Pessoa / tarefa / branch / commit-base:
Objetivo entregue:
Arquivos alterados:
Contratos consumidos / mudanças combinadas:
Endpoints: método, caminho, papel permitido, entrada e retorno:
Banco: solicitações a Nivaldo / migrações implementadas por ele:
Fixtures/stubs: simulações e adapter real a conectar:
Cobertura: séries, matérias, questões revisadas e lacunas:
Checks:
- npm run typecheck: passou/falhou + motivo
- npm test: passou/falhou + testes relevantes
- npm run build: passou/falhou + motivo
Percurso manual/E2E realmente executado:
Configuração externa necessária (nomes, nunca valores):
Limitações e pendências:
```

Checks em cada branch e após integração. Não transformar falha de configuração em aprovação nem enfraquecer testes comuns para passar feature.

## Prompts e segredos

Prompts efetivamente usados ficam em PROMPTS/ com prefixos 01-viegas-, 02-fabiano-, 03-nivaldo-, 04-gallotte-. Distinguir desenvolvimento de templates de IA; sem chaves, dados reais de menores, logs de ferramentas ou instruções internas. Hook local não captura sites Claude/ChatGPT automaticamente: registrar manualmente por turno e antes de compactação manual, sem prometer callback automático.
