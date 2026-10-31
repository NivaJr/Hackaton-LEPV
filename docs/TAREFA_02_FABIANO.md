# Tarefa 02 — Fabiano: coordenador, turmas, importações e responsável

## Objetivo e limites

Entregar gestão de turmas/alunos/professores, importação CSV/XLSX com prévia e confirmação de transferências, e UI/API do responsável para consultar resultados e editar saúde/apoio de filhos vinculados. Reutilizar auth, tabelas, vínculos e RLS da base; Nivaldo mantém o núcleo e Gallotte a IA.

## Arquivos de sua responsabilidade

- `src/features/roster/**` e `src/features/family/**`: UI, serviços, ports, adapters, fixtures e testes.
- `src/app/api/roster/**` e `src/app/api/family/**`.
- Conteúdo das páginas `src/app/(workspace)/coordenador/page.tsx` e `responsavel/page.tsx`, preservando guards.
- `PROMPTS/` com prefixo `02-fabiano-`.

Não editar SQL, auth, scoring/domínio de aprendizagem, drivers LLM, schemas centrais, shell/demo global, `package.json` ou lockfiles sem coordenação. Solicitações de novas tabelas/colunas vão a Nivaldo; não criar migração paralela.

## Pré-requisitos e contratos

| Área | Entrada/saída e regra |
| --- | --- |
| Autorização | `getSessionContext()` já resolve `SessionContext` e vínculos no servidor; `requireRole` protege a página |
| Gestão | Tabelas base `classrooms`, `enrollments`, `teacher_assignments`, `profiles`, `user_roles` |
| Alunos CSV/XLSX | Cabeçalhos `nome completo`, `email`; aceitar alias `email do aluno` |
| Professores | Nome completo, email, matéria validada em `SUBJECTS` |
| Família | `guardian_links` confirmados; `StudentSummary`; `canViewStudentData`/`canEditStudentData` |
| Feedback | `getLearningAiGateway().summarizeStudent({ summary })`, sem fornecedor direto |

Criar `RosterMetricsGateway` e `FamilyMetricsGateway` locais com fake para painéis. Provisionamento usa port apoiado no convite/primeiro acesso da base; não permitir criar senha sabendo só email. Prévia/confirmação da importação são contratos locais da feature, acordados antes de persistência com Nivaldo.

## Passos executáveis

1. Ler instruções, migração e contratos, arquivar prompt e usar `feat/fabiano-gestao` em checkout próprio.
2. Implementar CRUD mínimo de turmas e alocação de alunos/professores por matéria no escopo da escola autenticada.
3. Disponibilizar modelos CSV e aceitar CSV/XLSX. Validar tamanho, cabeçalhos, nomes, emails e linhas; não executar fórmulas/macros. Pacote novo de XLSX depende de coordenação do lockfile.
4. Separar parser da gravação. Prévia devolve linhas válidas, erros por linha, duplicatas internas, aluno já na turma e transferência possível.
5. Aluno existente: mostrar turma atual e perguntar se transfere ou mantém. Não duplicar identidade nem transferir automaticamente; não permitir transferência entre escolas sem escopo.
6. Confirmação revalida no servidor e é idempotente. Lotes parciais informam status por linha e permitem repetir apenas falhas sem duplicar sucessos. Coordenar transação/provisionamento com Nivaldo.
7. Montar painéis de frequência/desempenho com metrics ports fake enquanto os dados reais avançam. Engajamento é frequência, não quantidade de cliques.
8. Responsável vê seletor só de filhos autorizados, resultados e feedback; edita `student_health` e `student_support` existentes. Histórico/ficha têm donos de edição próprios.
9. Validar vínculo em toda leitura/gravação. Responsável edita saúde/apoio; perfis vinculados podem ler; colegas não têm acesso. Responsável não edita histórico nem interesses.
10. Feedback usa gateway comum e métricas mínimas; sem IA, mostrar indisponibilidade/mensagem determinística identificada. Não enviar saúde/apoio automaticamente ao fornecedor.

## Critérios de aceite

- Turmas, atribuições e importação CSV/XLSX com prévia funcionam com dados sintéticos.
- Erros têm linha; email existente não cria identidade duplicada; transferência só após confirmação explícita.
- Reenvio não duplica lote/transferência; outro papel/escola não executa mutações de coordenador.
- Responsável acessa e edita saúde/apoio só do filho vinculado; ID de outro aluno não concede acesso.
- Histórico é leitura para responsável; interesses continuam editáveis pelo aluno.
- Painéis e fluxos podem ser desenvolvidos com ports/fakes sem esperar Nivaldo/Gallotte; fixtures são identificadas.
- Catálogo preserva quatro séries e seis matérias; não há alteração local de pontuação.

## Checks e entrega

Rodar `npm run typecheck`, `npm test` e `npm run build`. Testar parsing/aliases, prévia, duplicatas, transferência, idempotência e autorização por vínculo. Entregar checkpoint com endpoints, contrato do lote, ports, banco solicitado a Nivaldo, checks e limitações.

## Prompt pronto para Claude/ChatGPT

```text
Você trabalhará com Fabiano na Tarefa 02 do Hackaton-LEPV. Leia AGENTS.md, README.md, docs/INTEGRACAO.md e docs/TAREFA_02_FABIANO.md; inspecione contratos, sessão, permissões e migração-base.
Use feat/fabiano-gestao no commit-base comum e checkout/worktree próprio. Sem sobrescrita alheia, last-writer-wins ou force-push. Arquive este prompt e novos em PROMPTS/ com prefixo 02-fabiano-, sem chaves/dados reais/instruções internas.
Implemente roster, family, APIs dessas áreas e conteúdo das páginas coordenador/responsavel mantendo guards. CSV/XLSX exige prévia, duplicatas e transferência só por confirmação. Saúde/apoio só são editáveis pelo responsável vinculado; histórico/interesses preservam donos. Use ports/fakes para começar sem outras branches e LearningAiGateway para feedback, sem SDK direto.
Nivaldo é dono de banco, auth e pontos. Não crie implementação paralela nem edite SQL, schemas comuns, IA, shell/demo global, package.json ou lockfiles sem coordenação. Proponha mudanças necessárias com motivo/impacto.
Preserve regras e execute npm run typecheck, npm test e npm run build. Entregue checkpoint com endpoints, alterações de banco solicitadas, testes, fixtures e limites.
```
