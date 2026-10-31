# Continuidade do Viegas — 31/10/2026

Branch de entrega: `codex/acessibilidade-aluno`. Ponto de partida: `9ee428b`, o mesmo HEAD do ZIP recebido. A comparação encontrou 233 arquivos iguais ao remoto, além do registro 049 e do levantamento de pendências presentes somente no ZIP; ambos foram preservados.

ZIP de referência: `Hackaton-LEPV.zip`, SHA-256 `b15a3f0708f8f90bf66ed9968fff84cbc02dffa8456b56542b318979c8c9cd43`.

Foi integrada a `main` em `7c6176e`, que contém o [PR #17](https://github.com/NivaJr/Hackaton-LEPV/pull/17), priorizado pelo usuário e mergeado depois dos checks. Histórico, cadastro por link, boletins, reconhecimento, métricas e recuperação de Gallotte foram preservados. A publicação desta entrega é na branch do Viegas; sua promoção a Production é uma etapa separada.

## O que foi concluído

| Pendência encontrada | Resultado e evidência |
| --- | --- |
| Integração com as entregas recentes | `main` com PR #17 incorporada; persistência privada e cota distribuída de conteúdo reaproveitadas, sem segundo banco de questões |
| Disciplina → conteúdo → atividade | Importação define conteúdo e tipo; catálogo devolve `activityType`, `contentId`, `contentTitle`, `contentDefinedBy`; teste do publicador até a resposta persistida do aluno |
| Exercícios confundidos com desafios | Exercício publicado fica ativo e vale 50 patente/0 XP; omissão do tipo resulta em exercício, inclusive no backfill |
| Desafios semanais | Dez por disciplina e turma, conforme confirmação no prompt 051; troca semanal de dois mais antigos da disciplina, com remoção do XP e preservação anual; novos desafios exigem dificuldade alta |
| Recuperação e compatibilidade | 35 patente/0 XP por acerto, mesmo depois de dez erros; dois acertos consecutivos encerram; snapshots anteriores conservam valor e elegibilidade de XP |
| Mapa de progresso real | Numerador e denominador calculados no servidor sobre exercícios publicados; teste 200/2.000 = 10%; disciplinas do professor filtradas; elogios e desafios excluídos desse mapa |
| Interesses seguros | Lista fechada no contrato, no adapter privilegiado e em constraint SQL; valores legados não aprovados filtrados/limpos sem reescrever tentativas |
| Publicação concorrente | A versão revisada é reservada em `publicando`; edição fica bloqueada; falha de transporte retoma o mesmo snapshot e não cria outra atividade |
| Originais PDF/Word | Adapter de Storage e bucket privado `teaching-sources`, com políticas por escola/turma/disciplina; gabaritos permanecem no banco privado e fora da projeção do aluno |
| Interface | Acessibilidade e som do Viegas preservados; som não impede resposta se o dispositivo falhar; progresso da patente usa os pontos atuais; títulos, autoria, links do professor e contraste dos desafios no tema escuro corrigidos |

Nenhum teto de créditos foi ativado. O gráfico limita sua representação visual a 100%, sem cortar os créditos do servidor. Contagem de exemplos ou filtros não representa catálogo curricular revisado.

## Verificação executada

- `npm run typecheck`: passou.
- `npm test`: 382 testes em 35 arquivos passaram.
- `python -B -m unittest discover -s tests -p test_archive_prompts.py`: sete testes passaram.
- `npm run build`: passou com páginas e APIs dos quatro perfis.
- PostgreSQL/WASM: todas as migrações reais, Auth emulado e tabelas de Storage emuladas; RPCs privadas, isolamento, CAS, política de créditos, legado, rejeição de interesses, publicação e acesso ao bucket verificados. Isso não comprova Storage ou Auth hospedado.

Playwright/Chromium contra o build de produção local, concluído em **31/10/2026 às 15:03 UTC**:

- demonstração acessível: erro, explicação, dica, dois acertos consecutivos e conclusão, sem áudio;
- interface normal: som no acerto, instância respondida somente para consulta e ausência de som ao reabrir a resposta;
- ficha com sugestões aprovadas e salvamento da escolha;
- âncoras do aluno, temas claro/escuro, modos normal/acessível, larguras 375/768/1440 px, sem rolagem horizontal da página;
- demonstração do professor: disciplina, conteúdo e turma, exemplo importado, gabarito confirmado, revisão e publicação explicitamente em memória;
- páginas públicas HTTP 200; os quatro acessos reais redirecionam ao login sem sessão; aprendizagem retorna 401; conteúdo informa `503 NOT_CONFIGURED` quando o ambiente está sem credenciais;
- nenhuma exceção não tratada no navegador. Inspeção adicional confirmou o contraste dos desafios e o cartão vertical da patente no tema escuro em 375 px.

Relatório e capturas locais, ignorados pelo Git: `supabase/.temp/viegas-browser-report.json`, `student-*.png`, `teacher-review-publication.png`, `weekly-dark-375.png` e `rank-dark-375.png`.

## Migrações e limite da publicação

A branch inclui a migração do ZIP `20261031110000_learning_scoring_confirmed.sql` e a nova migração aditiva `20261031143534_student_handoff_integration.sql`. A nova migração preserva o banco privado do PR #17, acrescenta retomada de publicação, a lista segura de interesses, backfill do catálogo, Storage privado e validação por snapshot para não invalidar tentativas antigas. Migrações anteriormente aplicadas não foram editadas.

As duas migrações de pontuação desta branch **não foram aplicadas em Production nesta continuação**. A configuração documentada de Production aponta para `alkvhjnqfjyjflaswdmi`; o MCP conectado aponta para `sufgxlmwhxudykxpnvpa`, cujo histórico consultado mostrou fundação, aprendizagem e nome da turma. Não foi usado esse MCP para alterar o projeto de Production.

Antes de promover a branch, conferir o histórico no projeto efetivamente usado pelo ambiente, preservar backup consistente e aplicar as migrações pendentes junto da versão compatível do app. Não aplicar o backfill isoladamente enquanto a versão antiga ainda exige o contrato anterior do catálogo. Rollback de produção deve restaurar código e contrato de dados compatíveis, preservando tentativas e créditos.

Não foram executadas novas sessões autenticadas hospedadas dos quatro perfis, upload no Storage hospedado nem chamadas reais a Gemini nesta continuação. A implementação foi validada localmente; evidências históricas hospedadas permanecem separadas nos registros anteriores. Catálogo completo, revisão BNCC e usabilidade com alunos neurodivergentes continuam exigindo suas próprias validações.
