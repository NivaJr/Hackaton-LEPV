# Tarefa 03 — Nivaldo: banco, autenticação e pontuação

## Objetivo e limites

Evoluir o núcleo existente sem reimplementá-lo: persistência dos novos domínios, autorização, APIs de aprendizagem, tentativa única, recuperação e créditos de XP/pontos anuais. **Nivaldo é o único dono de configuração, cálculo, concessão, persistência, agregação e rotação da pontuação.** Viegas apresenta resultados; Fabiano/Gallotte não copiam esse cálculo.

## Arquivos de sua responsabilidade

- `src/features/learning/server/**`: serviços, repositórios e transações.
- `src/features/learning/domain/**` e `src/config/scoring.ts`: política central e regras puras.
- `src/app/api/learning/**`: ficha, atividades, resposta, dica, interrupção, ranking e métricas.
- `src/lib/auth/**`, `src/lib/supabase/**`, `src/proxy.ts`, `src/app/login/**`, `src/app/auth/**`: extensões/correções do núcleo, sem refazer a base.
- `supabase/migrations/**`, seed/configuração SQL: único autor de mudanças de banco acordadas com as features.
- Contratos/configuração/dependências comuns: integrar mudanças somente após coordenar consumidores, incluindo `package.json`/lockfile.
- Testes de domínio/servidor e `PROMPTS/` com prefixo `03-nivaldo-`.

Não editar UI/estado do aluno, páginas de Fabiano/Gallotte ou drivers `src/lib/llm/**`. APIs roster/family/content pertencem aos respectivos donos; fornecer núcleo/contratos necessários sem tomar esses arquivos.

## O que já existe

A base tem Supabase browser/server, login/primeiro acesso com convite validado antes da senha, proxy e guards. `getOptionalSession()` é perfil mínimo; `getSessionContext()` já carrega vínculos confirmados e atribuições no servidor para construir `SessionContext`. A migração `supabase/migrations/20261030220000_foundation.sql` cria identidade, papéis, turmas, matrículas, professores, responsáveis, preferências, histórico, saúde/apoio e RLS. Contratos Zod e domínio puro já têm testes iniciais. Autenticação real/Supabase remoto não são comprovados sem configuração externa.

## Contratos a preservar e publicar

| Área | Entrada/saída |
| --- | --- |
| Identidade/permissão | `SessionContext`, `canViewStudentData`, `canEditStudentData`, `canEditStudentPreferences`; nunca confiar em vínculos do cliente |
| Ficha | `StudentPreferences`, `StudentPreferencesUpdate`; versão/identidade controladas no servidor |
| Questão/gabarito | `QuestionForStudent` público; `QuestionAnswerKey` somente servidor/docente autorizado |
| Resposta | `AttemptSubmission` → `AttemptResult`; uma resposta por aluno/instância |
| IA | `GeneratedQuestion` validado e `LearningAiGateway` de Gallotte, ou stub da base |
| Métricas | `StudentSummary` para UI e ports de Fabiano/Gallotte |
| Regras | `calculateRecoveryReward`, `advanceRecovery`, `interruptRecovery`, `getRankForPoints` existentes |

Publicar URLs/payloads e exemplos sintéticos para `StudentLearningClient` de Viegas e métricas de Fabiano/Gallotte. Eles podem usar fake enquanto APIs são implementadas. Não criar acoplamento por imports privados entre features.

## Passos executáveis

1. Inspecionar base/contratos/testes, arquivar prompt e trabalhar em `feat/nivaldo-core` em checkout separado.
2. Combinar campos/IDs/erros dos ports com os três integrantes. Centralizar propostas de schema/SQL/dependências e publicar checkpoint do contrato acordado.
3. Criar migrações aditivas para conteúdo, instâncias, tentativas, recuperação, lançamentos e, se necessário, importação/feedback. Não recriar objetos da foundation nem editar migração já aplicada.
4. Preservar RLS/checagem server-side. `school_id` persistido e `institutionId` do contrato se conciliam no resolver, não por contexto privilegiado enviado pelo navegador.
5. Implementar APIs learning com adapter em memória para testes. Validar sessão, instância atribuída, alternativa válida e tentativa anterior; separar questão pública de gabarito.
6. Persistir resposta, recuperação e pontos transacionalmente, com restrições de unicidade e idempotência. Duas requisições concorrentes não podem gerar dois créditos ou duas próximas questões.
7. Usar domínio puro: dois acertos consecutivos encerram recuperação, erro reinicia a sequência e interrupção segue o estado previsto. Questão nova vem do gateway comum com origem/habilidade preservadas.
8. Centralizar política em `src/config/scoring.ts` e cálculo em `src/features/learning/domain/scoring.ts`. Confirmados: 0,7, XP ativo separado de pontos anuais e tentativa única. Base de 100 pontos, limiares, teto e fórmula completa são propostas. **`DEFAULT_RECOVERY_CAP_POINTS` é `null`; não ativar teto silenciosamente.**
9. Criar lançamentos auditáveis ligados à tentativa/questão-raiz. IA e cliente não escolhem créditos. Combinar a elegibilidade do XP adaptativo quando a raiz sai da rotação, antes de fechar a query/regra final.
10. Ranking TOP 10, agregação anual e rotação de duas questões por matéria/semana devem ser idempotentes. Remover elegibilidade de XP não apaga o histórico anual; publicar configuração de empate/rotação.
11. Verificar login/convite e políticas em Supabase real quando houver configuração; registrar limites quando não houver. Preservar guards usados pelas páginas dos colegas.

## Critérios de aceite

- Um caminho único de pontos: config central → função pura → serviço autorizado → transação/lançamento → projeção/ranking.
- Reenvio/concorrência não duplicam tentativa, geração ou crédito; cliente/LLM não concedem pontos.
- APIs públicas não vazam gabarito e dados respeitam a matriz/vínculos.
- SQL é aditivo, tem políticas, nomes acordados e preserva foundation.
- XP/anuais e recuperação/interrupção seguem o domínio; propostas não viram decisões silenciosas.
- Os demais recebem contratos estáveis; servidor pode ser testado em memória sem chave de LLM.

## Checks e entrega

Rodar `npm run typecheck`, `npm test` e `npm run build`. Acrescentar testes úteis de autorização, tentativa/crédito duplicado, concorrência, rotação e projeção sem gabarito. Se houver banco configurado, aplicar migrações e testar RLS com papéis distintos; não declarar isso sem executar. Entregar checkpoint de contratos/endpoints, SQL/políticas, política proposta de pontuação e resultados.

## Prompt pronto para Claude/ChatGPT

```text
Você trabalhará com Nivaldo na Tarefa 03 do Hackaton-LEPV. Leia AGENTS.md, README.md, docs/INTEGRACAO.md e docs/TAREFA_03_NIVALDO.md. Inspecione base, contratos, foundation, auth, domínio/testes e gateway antes de editar; não refaça a base.
Use feat/nivaldo-core em checkout/worktree próprio no commit-base comum. Sem force-push, last-writer-wins ou sobrescrita de colegas. Arquive este prompt e os novos em PROMPTS/ com prefixo 03-nivaldo-, sem segredos/dados reais/instruções internas.
Você é dono do banco/SQL, auth, domínio/config de pontuação e APIs learning. Concessão de pontos deve ter caminho único server-side, autorizado, transacional e idempotente. Viegas faz UI aluno; Fabiano roster/family; Gallotte content/IA. Use ports/contratos e gateway único, sem copiar outro domínio.
Preserve 70%, dois acertos consecutivos, tentativa única, XP ativo e pontos anuais. Base 100, teto e fórmula completa seguem propostas; não ative teto silenciosamente. Migrações são aditivas; não reescreva foundation. Mudanças em contratos/dependências/lockfile exigem coordenação prévia. Não altere UI dos colegas/demo global por conveniência.
Execute npm run typecheck, npm test e npm run build e entregue checkpoint com APIs, SQL, políticas, testes de duplicação, cobertura e limites de Supabase/auth real.
```
