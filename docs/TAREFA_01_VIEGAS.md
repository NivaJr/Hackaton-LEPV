# Tarefa 01 — Viegas: telas e fluxo do aluno

## Objetivo e limites

Entregar a interface e o estado do cliente do aluno: ficha inicial editável, painel, atividades de múltipla escolha, explicação, recuperação, dica, interrupção, perfil, ranking e patente. **Nivaldo é dono de banco, correção e pontos; Gallotte é dono da IA.** Não reimplementar esses módulos no navegador.

## Arquivos de sua responsabilidade

- `src/features/learning/ui/**`: componentes e testes da interface.
- `src/features/learning/client/**`: port HTTP, estado e adapters fake/real.
- `src/features/learning/fixtures/**`: dados sintéticos e inventário da demonstração.
- Conteúdo de `src/app/(workspace)/aluno/page.tsx`, preservando o guard.
- Novos registros em `PROMPTS/` com prefixo `01-viegas-`.

Não editar `src/features/learning/domain/**`, `server/**`, `src/config/scoring.ts`, `src/app/api/learning/**`, SQL, auth ou `src/lib/llm/**`. Contratos compartilhados, shell/dashboard global, `src/app/demo/[role]/page.tsx`, dependências e lockfiles exigem coordenação.

## Pré-requisitos e contratos

Ler AGENTS, README, contratos e catálogo reais antes de escrever imports. A base fornece sessão, guard, catálogo, contratos Zod, domínio puro e gateway desabilitado; a API real de aprendizagem ainda é tarefa de Nivaldo.

| Operação | Entrada/saída |
| --- | --- |
| Página protegida | `requireRole("aluno")`, mantendo o guard existente |
| Ler/editar ficha | `StudentPreferences` / `StudentPreferencesUpdate`; só o próprio aluno |
| Exibir questão | `QuestionForStudent`; sem `QuestionAnswerKey` ou explicação reveladora |
| Enviar alternativa | `AttemptSubmission`; sem pontos, correção ou identidade confiável no JSON |
| Mostrar resultado | `AttemptResult`, vindo do servidor: correção, explicação, créditos e recuperação |
| Painel e catálogo | `StudentSummary`, `Grade`, `SubjectId`, `GRADES`, `SUBJECTS` |

Criar `StudentLearningClient` em `client/` com operações para painel, ficha, atividades, resposta, dica, interrupção e ranking. Um adapter fake permite trabalhar agora; o HTTP usa contratos/URLs acordados com Nivaldo depois. Não importar serviços privados do servidor para a UI.

## Passos executáveis

1. Arquivar o prompt e usar `feat/viegas-aluno`, no commit-base comum e checkout/worktree próprio.
2. Construir ficha com interesses/contexto, leitura e edição persistente. Saúde/apoio não são editáveis pelo aluno. Alterar interesses não altera tentativas/pontos passados.
3. Trocar o conteúdo da página do aluno, reutilizando o shell. Construir fluxo inteiro com fixtures identificadas enquanto as APIs reais avançam.
4. Percurso: questão original → resposta → explicação se erro → questão nova análoga/adaptada → dica opcional → dois acertos consecutivos encerram recuperação, ou aluno interrompe.
5. Encerrar a instância respondida na UI; evitar duplo clique e reutilizar a mesma idempotency key ao repetir a requisição. Nivaldo garante tentativa única no servidor.
6. Exibir pontuação recebida do servidor, XP ativo e pontos anuais separados, TOP 10 da turma e progresso da patente. Não conceder/calcular pontos no cliente.
7. Conectar o adapter HTTP quando disponível. A questão adaptativa tem outro ID, mesma habilidade e origem preservada; dica pertence à questão ainda não respondida.
8. Tratar erro, carregamento, indisponibilidade e gateway desabilitado sem apresentar fixture como geração real.

## Critérios de aceite

- Ficha editável reaparece na leitura; só o aluno vinculado a edita pelo fluxo autenticado.
- Demonstração percorre acerto, erro, explicação, recuperação, dica e interrupção usando fake sem esperar outras branches.
- Gabarito não chega na carga inicial; servidor decide correção e pontos. Reenvio não duplica estado/crédito.
- Dois acertos são critério operacional da atividade, sem alegar diagnóstico ou domínio amplo.
- Estrutura cobre 6º–9º ano e Matemática, Português, Inglês, História, Geografia e Biologia. Declarar exemplos existentes: 24 filtros não equivalem a 240 questões revisadas.
- 70% são preservados; base de 100 pontos, limiares, teto e fórmula completa continuam propostas, sem regras novas embutidas na UI.

## Checks e entrega

Rodar `npm run typecheck`, `npm test` e `npm run build`. Testar transições, envio sem pontuação, idempotência do cliente e estados de falha com fake; não duplicar testes puros da base. Entregar o checkpoint de `docs/INTEGRACAO.md`, incluindo operações do port, URLs consumidas, checks e stubs restantes.

## Prompt pronto para Claude/ChatGPT

```text
Você trabalhará com Viegas na Tarefa 01 do Hackaton-LEPV. Leia AGENTS.md, README.md, docs/INTEGRACAO.md e docs/TAREFA_01_VIEGAS.md. Inspecione contratos, catálogo e guards reais; não invente imports ou assinaturas.
Use feat/viegas-aluno a partir do commit-base comum, em checkout/worktree próprio. Sem sobrescrita de trabalho alheio, last-writer-wins ou force-push. Arquive este prompt e os novos em PROMPTS/ com prefixo 01-viegas-, sem segredos, dados reais ou instruções internas.
Implemente apenas learning/ui, learning/client, learning/fixtures e o conteúdo da página aluno, preservando guard. Use StudentLearningClient fake para não bloquear em APIs e conecte depois Nivaldo. Banco, correção e pontos são de Nivaldo; IA é de Gallotte. Não copie esses módulos nem conceda pontos no navegador.
Não edite schemas compartilhados, auth, SQL, scoring, APIs learning, shell/demo global, package.json ou lockfiles sem coordenação. Preserve regras confirmadas e propostas como propostas. Declare cobertura real; não alegue 240 questões sem inventário.
Execute npm run typecheck, npm test e npm run build. Entregue checkpoint com arquivos, contrato do cliente, rotas, resultados e limites.
```
