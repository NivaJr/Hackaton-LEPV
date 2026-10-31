# Registro de prompts — hackaton-LEPV

Esta pasta deve acompanhar o código no repositório GitHub para atender à regra do hackathon.

- `2026-10-30_001_escopo-inicial.md`: texto do pedido inicial, registrado manualmente nesta conversa.
- `2026-10-30_004_decisoes-do-usuario.md`: respostas do usuário e endereço do repositório.
- `2026-10-30_006_permissoes-patentes-e-llm.md`: permissões, ampliação aos quatro perfis e decisões de recuperação, matérias e integração configurável.
- `2026-10-30_008_pedido-planejamento.md`: pedido do planejamento de implementação dividido entre quatro integrantes.
- Os registros de revisão e preparação do hook identificam prompts usados pelo assistente com subagentes, separados das decisões do usuário.
- Arquivos criados pelo hook: prompts diretos por turno e prompts recuperados da transcrição antes da compactação, com origem identificada. O índice auxilia a conciliar as duas fontes sem duplicar a mesma ocorrência.
- Novos prompts manuais: usar `AAAA-MM-DD_NNN_assunto.md`, preservando ocorrências repetidas e o texto original.
- Prompts de chamadas de IA da futura aplicação também devem ser guardados aqui, identificados separadamente dos prompts de desenvolvimento.

O hook está em `../.codex/hooks.json`; implementação e instruções em `../scripts/`. Ele depende de runtime compatível e revisão/confiança pelo usuário no Codex local. Não é um hook ativo da orquestração Work Cloud.

Não incluir instruções internas, raciocínio oculto, resultados de ferramentas, credenciais ou dados reais de alunos nos registros públicos. Qualquer supressão necessária deve ser indicada, sem afirmar que o arquivo é cópia literal integral.

Nenhum commit ou push foi realizado nesta etapa.

