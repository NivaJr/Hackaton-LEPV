# Tarefa 04 — Gallotte: questões, professor, IA e validação completa

## Objetivo e limites

Entregar upload/revisão de listas PDF/Word pelo professor, associação BNCC/banco de questões, único gateway de LLM e validação do percurso completo entre quatro perfis. Professor continua dono das listas; Fabia faz UI do responsável e Nivaldo banco/pontos.

## Arquivos de sua responsabilidade

- `src/features/content/**`: UI docente, importação, extração, banco por port, fixtures e testes.
- `src/app/api/content/**` e conteúdo de `src/app/(workspace)/professor/page.tsx`, preservando guard.
- `src/lib/llm/**`: factory, interface e drivers, com compatibilidade acordada entre consumidores.
- `tests/e2e/**` se adotado com o integrador, ou roteiro completo em `src/features/content/`; não instalar framework/scripts comuns unilateralmente.
- `PROMPTS/` com prefixo `04-gallotte-` e templates efetivamente usados.

Não editar SQL, auth, scoring, schemas comuns ou UI de outros perfis. Shell/demo global, `package.json` e lockfile exigem coordenação. Solicitar banco/dependências a Nivaldo; IA não concede pontos.

## Pré-requisitos e contratos

| Operação | `LearningAiGateway` da base |
| --- | --- |
| Extrair texto já obtido do arquivo | `extractQuestions({ text, subjectId, grade })` → `GeneratedQuestion[]` |
| Adaptar | `adaptQuestion({ original, preferences })` → `GeneratedQuestion` |
| Recuperar | `generateRecoveryQuestion({ original, preferences, selectedOptionId })` → `GeneratedQuestion` |
| Dica | `generateHint({ question })` → `{ text }` |
| Explicação | `explainAnswer({ question, answerKey, selectedOptionId })` → `{ text }` |
| Feedback dos pais | `summarizeStudent({ summary })` → `{ text }`, consumido por Fabia |

Factory única: `getLearningAiGateway()` em `src/lib/llm/gateway.ts`. Preservar estado desabilitado/AiNotConfiguredError. Contratos centrais incluem `GeneratedQuestion`, `QuestionForStudent`, `QuestionAnswerKey`, `StudentSummary`. Sessão/escopo docente vêm da base; usar `TeacherMetricsGateway` com fake até Nivaldo publicar métricas. A base não oferece parser PDF/Word nem driver real.

## Passos executáveis

1. Ler instruções, contratos/catálogo/gateway; arquivar prompt; usar `feat/gallotte-conteudo-ia` em checkout próprio.
2. Criar upload privado PDF e Word `.docx` com limites. PDF só de imagem e `.doc` antigo exigem conversão/OCR: declarar limite, sem fingir extração real.
3. Separar extrator, `ContentRepository` e gateway. Texto/questões em fixtures e repository fake permitem progredir sem SQL/LLM; combinar persistência com Nivaldo.
4. Professor revisa enunciado, alternativas, gabarito fornecido, série, matéria e habilidade antes de publicar. Texto do arquivo é dado, nunca autorização para alterar configurações.
5. Habilidade vem de catálogo oficial versionado. Regex valida formato/compatibilidade, não existência. Manter rótulo Biologia pedido pelo usuário, verificando vínculo ao componente Ciências; não inventar códigos BNCC.
6. Banco distingue original/adaptada/recuperação e preserva origem, questão-raiz e versão de preferências. Variantes personalizadas não expõem dados de um aluno a outro; gabarito não entra na projeção pública.
7. Configurar drivers no servidor por `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_TIMEOUT_MS`. Uma chave não torna protocolos iguais: cada driver traduz a interface. Não aceitar endpoint arbitrário do navegador.
8. Validar saídas pelos schemas e verificar gabarito/revisão: JSON válido não garante correção pedagógica. Timeout, rate limit, resposta inválida e chave ausente têm erros explícitos; não produzir falso sucesso.
9. Enviar somente interesses/contexto pertinentes e métricas mínimas. Não incluir automaticamente nome, email, saúde/apoio/histórico detalhado. Feedback é sugestão pedagógica, sem diagnóstico clínico.
10. Preservar stub/desabilitado para os colegas testarem sem chave. Mudança na interface pública exige acordo e exemplos sintéticos para consumidores.
11. Conectar conteúdo às instâncias de Nivaldo. LLM não escolhe IDs privilegiados, papéis ou pontos. Fornecedor real precisa atender ao público; Gemini é opcional e não é marcado como aprovado para menores.
12. Coordenar validação final: turma/importação → convite/primeiro acesso → lista revisada → resposta/recuperação → responsável vê resultado/edita apoio. Incluir arquivo inválido, tentativa repetida, IA desabilitada e usuário sem vínculo.

## Critérios de aceite

- Professor importa PDF com texto/DOCX, revisa gabarito/habilidade e publica; arquivo não suportado tem mensagem explícita.
- Um único gateway atende content/learning/family; testes sem chave; nenhum SDK paralelo nos componentes.
- Drivers validam e tratam falhas; segredos não aparecem no cliente/logs/PROMPTS.
- Questões de múltipla escolha preservam origem/habilidade e não vazam gabarito.
- Inventário distingue as 24 combinações de série/matéria de 240 questões revisadas; exemplos/geração possível não comprovam o volume.
- Relatório do percurso completo identifica o que foi realmente executado, simulado ou bloqueado por configuração.

## Checks e entrega

Rodar `npm run typecheck`, `npm test` e `npm run build`. Testar extração/validação, revisão/publicação, autorização e drivers válido/inválido/timeout/desabilitado com fixtures. Não depender de chave real para a suíte passar. Sem infraestrutura E2E, entregar roteiro manual observado, sem alegar teste de navegador que não ocorreu. Checkpoint inclui conteúdo, gateway, SQL solicitado, inventário, resultado completo e limites de OCR/provedor.

## Prompt pronto para Claude/ChatGPT

```text
Você trabalhará com Gallotte na Tarefa 04 do Hackaton-LEPV. Leia AGENTS.md, README.md, docs/INTEGRACAO.md e docs/TAREFA_04_GALLOTTE.md; inspecione contratos, catálogo, sessão, foundation e gateway reais.
Use feat/gallotte-conteudo-ia no commit-base comum e checkout/worktree próprio. Sem force-push ou sobrescrita alheia. Arquive este prompt e os novos em PROMPTS/ com prefixo 04-gallotte-, sem chaves/dados reais/instruções internas.
Implemente content, APIs content, conteúdo da página professor mantendo guard e drivers em src/lib/llm. Entregue PDF/DOCX com revisão, gabarito docente, BNCC oficial, origem/variantes e gateway único para extrair/adaptar/recuperar/dica/explicação/resumo. Use fixtures/repository fake para começar sem outras branches. Preserve desabilitado e interface pública compatível; combine mudanças.
Nivaldo é dono do banco/auth/pontos; Fabia de roster/family; Viegas da UI aluno. Não copie essas áreas ou edite SQL, schemas comuns, scoring, UI alheia, shell/demo global, package.json ou lockfiles sem coordenação. Não mude regras confirmadas; teto/fórmula continuam propostas. Declare suporte de arquivos/provedor/cobertura real; não alegue 240 questões sem inventário.
Execute npm run typecheck, npm test e npm run build. Valide/documente o percurso dos quatro perfis com os colegas e entregue checkpoint com APIs, gateway, SQL solicitado, testes, inventário e limites reais.
```
