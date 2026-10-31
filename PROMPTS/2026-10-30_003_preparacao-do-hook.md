# Prompts 003–007 — preparação do hook

Data: 30/10/2026 (America/Sao_Paulo).
Origem: prompts do assistente para um subagente LLM nesta sessão; não são novas instruções do usuário.

## Prompt 003 — tarefa

Agora implemente SOMENTE o mecanismo de auditoria de prompts solicitado, sem aplicação. Crie em /workspace/scratch/f3ab505fa5b7: .codex/hooks.json e scripts/archive_prompts.py (Python stdlib), com UserPromptSubmit para salvar texto direto em PROMPTS/ e PreCompact (auto|manual) para exportar prompts do transcript_path como backup. Docs oficiais lidas: https://learn.chatgpt.com/docs/hooks e config-advanced. stdin JSON shared fields session_id, cwd, transcript_path, hook_event_name; submit tem prompt, turn_id; precompact tem trigger, turn_id. stdout PreCompact aceita continue:false para impedir compactação se erro de arquivamento. Não alegue ativação runtime, não altere config global nem confiança. Projeto ainda não é git. Use comando que resolve scripts a partir de ancestral do cwd (ou git root seguro) e funciona em subpastas; configurar commandWindows se necessário. Exportar somente mensagens de usuário (nunca system/developer/tool/internal reasoning), filtrar blocos automáticos conhecidos de environment/AGENTS; transcript formato instável, se inexistente ou não suportado retornar erro visível / impedir compactação quando não há como verificar cobertura, sem falso sucesso. Evitar duplicatas em reexecução e não perder prompts repetidos. Não depender de banco sqlite nem ler históricos de outras conversas. Escreva README curto em scripts/PROMPT_HOOK.md com limitações e modo manual via stdin. Execute smoke tests significativos em /tmp com fixtures (submit, reexecução idempotente, transcript Codex JSONL, ausência de transcript/erro, português, subpasta). Não crie pasta de testes no projeto. Retorne resultados e arquivos criados. Eu escrevo briefing e PROMPTS/README.md e prompt inicial.

## Prompt 004 — documentação e limitação do ambiente

Schema {"description":"...","hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"python3 ...","commandWindows":"python ...","timeout":20,"statusMessage":"..."}]}],"PreCompact":[{"matcher":"auto|manual","hooks":[{"type":"command","command":"python3 ...","timeout":20}]}]}}. IMPORTANTE docs https://learn.chatgpt.com/docs/hooks linhas 1194-1196 agora lidas: Work Cloud NÃO suporta command/shell hooks nem local config hooks. Apenas orquestração+execução local (Codex/local-only Work) suporta estes. Portanto artefato preparatório para Codex local, NÃO para esta conversa cloud. Documente claramente. Eu salvo manualmente prompt inicial e AGENTS orienta registro ao início de cada turno aqui; esse é best-effort, não hook ativo. Pode simplificar comando para git-root com shell seguro ou busca ancestral python, mas sem command substitution de campos do usuário.

## Prompt 005 — conclusão da tarefa

Para manter a entrega proporcional, foque concluir arquivador e smoke tests em seguida. Já criei AGENTS.md, BRIEFING_HACKATHON.md e PROMPTS/README.md + prompt inicial. Vou empacotar tudo e salvar após seu resultado. Não precisamos garantir transcript desconhecido; basta documentar fallback e retornar continue:false em falhas no PreCompact.

## Prompt 006 — atualização de andamento

Preciso de uma atualização objetiva agora: há algum bloqueio? Ainda não há arquivos scripts no workspace. Por favor, entregue implementação pequena e os checks essenciais, sem ampliar cobertura de formatos ou produzir framework. Limite o parser a formatos documentados no README e sinalize os outros.

## Prompt 007 — revisão da documentação

Li o script e README. Ajuste só duas precisões no README: o suporte é orquestração E execução locais (Work Cloud com ferramenta local também não suporta), e URL correta é https://learn.chatgpt.com/docs/config-file/config-advanced. Minha revisão não encontrou problema bloqueante no fluxo visto; conclua smoke tests e envie.
