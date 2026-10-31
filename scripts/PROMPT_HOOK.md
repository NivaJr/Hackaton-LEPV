# Registro de prompts

Este mecanismo é preparatório para **Codex / Work com orquestração e execução
locais**. O Work Cloud desta conversa não executa hooks de shell nem lê esta
configuração local, mesmo quando dispõe de uma ferramenta de execução local.
A presença dos arquivos não significa que o hook está ativo. A carga da
configuração também depende da versão local e da confiança concedida ao projeto;
este pacote não altera configurações globais ou confiança.

`.codex/hooks.json` registra:

- `UserPromptSubmit`: salva imediatamente o texto do prompt em `PROMPTS/`.
- `PreCompact`, automático ou manual: exporta os prompts do transcript informado
  pelo próprio evento e confere sua correspondência com os registros existentes.

O comando encontra o projeto em ancestrais do diretório atual, inclusive ao
trabalhar em subpastas. Requer Python 3 disponível como `python3` (Unix) ou
`python` (Windows). Não lê históricos de outras conversas. Não configura GitHub,
faz commits ou envia arquivos ao repositório automaticamente.

O evento JSON é lido diretamente dos bytes da entrada padrão, sem usar a página
de códigos do Windows. Assim, acentos, aspas curvas e emojis em UTF-8 não são
convertidos em caracteres inválidos. O JSON de erro usa escapes ASCII para que
a resposta de bloqueio também funcione em terminais com codificação legada.

Os arquivos automáticos `PROMPTS/s_*.md` e o índice usam LF, definido em
`.gitattributes`. Isso preserva os bytes usados pelos hashes após clone/pull
em máquinas Windows com `core.autocrlf=true`.

## Formato e limites

Suporta o JSONL do Codex com `response_item`/mensagem de papel `user` e/ou
`event_msg`/`user_message`. Quando as duas representações existem, precisam
concordar. Exporta apenas texto de usuário; ignora mensagens de sistema,
desenvolvedor, assistente e ferramentas. Remove somente os blocos automáticos
iniciais reconhecidos de `environment_context` e instruções `AGENTS.md`.
Imagens não são copiadas. Mensagens sem texto exigem registro manual.

O índice `PROMPTS/.archive-index.json` deve ser preservado junto aos `.md`.
Ele permite reexecução sem duplicação e mantém envios repetidos em turnos
diferentes. `UserPromptSubmit` exige `turn_id` para distinguir repetição de
reexecução. Não edite os `.md` produzidos pelo script: o índice verifica sua
integridade. Depois de interrupção abrupta, um diretório `.archive-lock` pode
precisar ser removido manualmente, após verificar que o processo terminou.

Transcript ausente, formato desconhecido, divergência ou erro de escrita gera
um erro visível e `{"continue": false, "stopReason": "..."}` no `PreCompact`.
Não há promessa de cobertura de formatos futuros. A primeira execução não
recupera conteúdo já perdido numa compactação anterior. Confira o registro antes
da entrega e inclua também prompts enviados a outras LLMs usadas pela equipe.

## Execução manual

Crie um JSON local com os dados reais da sessão, por exemplo:

```json
{
  "hook_event_name": "PreCompact",
  "session_id": "ID_REAL_DA_SESSAO",
  "cwd": "/caminho/do/projeto",
  "transcript_path": "/caminho/do/transcript.jsonl",
  "trigger": "manual",
  "turn_id": "ID_REAL_DO_TURNO"
}
```

Execute a partir da raiz:

```sh
python3 scripts/archive_prompts.py < /caminho/do/evento.json
```

No PowerShell, use redirecionamento pelo `cmd` para preservar os bytes UTF-8 do
arquivo, sem passar pela codificação do pipeline de texto:

```powershell
cmd /c "python scripts/archive_prompts.py < C:\caminho\evento.json"
```

Sucesso retorna `{}`; falha retorna `continue: false` e escreve o motivo em
stderr. Na execução manual, ninguém interrompe a conversa automaticamente:
é necessário corrigir o erro antes de compactar. Para um registro direto, use
`hook_event_name: "UserPromptSubmit"`, `session_id`, `turn_id` e `prompt`.

Testes do arquivador, com registros fictícios somente em diretórios temporários:

```sh
python -m unittest discover -s tests -p "test_archive_prompts.py"
```

Fontes oficiais consultadas: https://learn.chatgpt.com/docs/hooks e
https://learn.chatgpt.com/docs/config-file/config-advanced.
