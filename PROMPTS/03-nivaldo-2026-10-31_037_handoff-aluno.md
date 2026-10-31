# Encaminhar handoff da área do aluno para Nivaldo

Data: 2026-10-31 (America/Sao_Paulo)
Autoria: usuário (NivaJr / Nivaldo)
Origem: solicitação direta nesta conversa; registro manual.

## Texto original

Envie este handoff ao Nivaldo:

> Continue a área do aluno a partir da branch `feat/viegas-aluno`, atualmente no commit `c355708`. O commit anterior principal é `98838df`.
>
> Próximos passos:
>
> 1. Atualizar as referências remotas e integrar `feat/viegas-aluno` com a `main` atual e com `feat/nivaldo-core`, preservando os componentes de aluno e resolvendo conflitos sem substituir arquivos inteiros.
> 2. Manter:
>    - `/demo/aluno` usando o cliente fake.
>    - `/aluno` autenticado usando `createHttpStudentLearningClient()`.
> 3. Alinhar as APIs de aprendizagem com o contrato existente em `src/features/learning/client/`:
>    - `GET /api/learning/preferences`
>    - `PUT /api/learning/preferences`
>    - `GET /api/learning/activities`
>    - `POST /api/learning/activities/:id/open`
>    - `GET /api/learning/instances/:id`
>    - `POST /api/learning/attempts`
>    - `POST /api/learning/instances/:id/hint`
>    - `POST /api/learning/recoveries/:id/next`
>    - `POST /api/learning/recoveries/:id/interrupt`
>    - `GET /api/learning/summary?from=...&to=...`
>    - `GET /api/learning/ranking?classId=...`
> 4. Incluir `className` no retorno de atividades. Atualmente o adapter utiliza somente “7º ano” como fallback quando a API não fornece o nome completo da turma.
> 5. Validar com um aluno autenticado:
>    - Carregamento da ficha.
>    - Edição e nova leitura da ficha.
>    - Matérias restritas à série vinculada.
>    - Abertura de atividade.
>    - Resposta e idempotência.
>    - Atualização de XP, pontos anuais e ranking.
>    - Erro, explicação, recuperação, dica e interrupção.
>    - Reabertura de questão já respondida.
> 6. Não confiar em `studentId`, turma, papel ou pontos enviados pelo navegador. Usar `getSessionContext()` e RLS.
> 7. Não calcular pontos no cliente. A interface apenas exibe os créditos devolvidos pelo servidor.
> 8. Não ativar base de 100 pontos, limites de patente ou teto de recuperação sem decisão explícita da equipe. Se a política continuar ausente, manter o erro claro `SCORING_NOT_CONFIGURED`.
> 9. Quando a IA estiver desabilitada, preservar a tentativa e informar indisponibilidade; não apresentar fixture como geração real.
> 10. Executar `npm run typecheck`, `npm test` e `npm run build`, depois testar manualmente `/aluno` com Supabase real.
>
> Estado atual: interface demonstrativa, tema claro/escuro, patentes, pontuação anual, XP ativo, ranking, matriz de habilidades, frequência, ficha e recuperação estão implementados. A última suíte executada teve 49 testes aprovados.

Registrei este pedido em [PROMPTS/01-viegas-2026-10-31_039-handoff-para-nivaldo.md](</E:/Documentos/Programação/Python/Hackaton-LEPV/PROMPTS/01-viegas-2026-10-31_039-handoff-para-nivaldo.md>). O registro ainda não foi commitado.


## Encaminhamento realizado

Handoff preservado na issue #2, atribuída a NivaJr: https://github.com/VivasLasViegas/Hackaton-LEPV/issues/2. Os dez passos e as referências de commit foram conferidos. Foi incluída nota separada sobre a política de pontuação da demonstração já confirmada pelo usuário.
