#!/usr/bin/env python3
"""Exporta os prompts do usuário da sessão do Claude Code para PROMPTS/.

Regra do hackathon: o repositório precisa da pasta PROMPTS com os prompts
enviados à LLM. Roda nos hooks Stop (fim de cada turno), PreCompact e SessionEnd.
Gera PROMPTS/<NN-autor>-<data>_claude-<sessao>.md; o arquivo da sessão é
reescrito a cada execução, então nunca duplica prompts.

Autor: variável LEPV_AUTHOR (viegas, fabia, nivaldo, gallotte) ou o nome
contido na branch atual (ex.: feat/gallotte-conteudo-ia).
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

NOISE = re.compile(r"<(system-reminder|local-command-[a-z]+|command-[a-z]+)>.*?</\1>", re.S)
PASTE_ID = re.compile(r'(<\/?pasted_content) id="[^"]*"')
AUTHORS = {"viegas": "01", "fabia": "02", "nivaldo": "03", "gallotte": "04"}


def author_prefix(project):
    hint = os.environ.get("LEPV_AUTHOR", "").lower()
    if not hint:
        try:
            hint = subprocess.run(
                ["git", "-C", str(project), "branch", "--show-current"],
                capture_output=True, text=True, timeout=5,
            ).stdout.lower()
        except (OSError, subprocess.SubprocessError):
            hint = ""
    for name, number in AUTHORS.items():
        if name in hint:
            return f"{number}-{name}-"
    return ""


def prompt_text(entry):
    # Mensagens enviadas no meio de um turno chegam como anexo "queued_command".
    attachment = entry.get("attachment") or {}
    if attachment.get("type") == "queued_command" and attachment.get("origin", {}).get("kind") == "human":
        content = attachment.get("prompt")
    elif entry.get("type") != "user" or entry.get("isMeta") or entry.get("isCompactSummary"):
        return None
    else:
        content = entry.get("message", {}).get("content")
    if isinstance(content, list):
        content = "\n".join(p.get("text", "") for p in content if p.get("type") == "text")
    if not isinstance(content, str):
        return None
    text = PASTE_ID.sub(r"\1", NOISE.sub("", content)).strip()
    return text or None


def attachment_ts(entry):
    return (entry.get("attachment") or {}).get("timestamp", "")


def main():
    payload = json.load(sys.stdin)
    transcript = Path(payload.get("transcript_path", ""))
    if not transcript.is_file():
        return
    project = Path(os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or ".")
    session = payload.get("session_id", transcript.stem)

    prompts = []
    started = None
    for line in transcript.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        text = prompt_text(entry)
        if text:
            started = started or entry.get("timestamp")
            prompts.append((entry.get("timestamp") or attachment_ts(entry), text))
    if not prompts:
        return

    day = (started or datetime.now().isoformat())[:10]
    out_dir = project / "PROMPTS"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"{author_prefix(project)}{day}_claude-{session[:8]}.md"

    lines = [f"# Prompts — sessão {session[:8]}", "", f"- Ferramenta: Claude Code", f"- Início: {started}", ""]
    for i, (ts, text) in enumerate(prompts, 1):
        lines += [f"## Prompt {i} — {ts}", "", text, ""]
    out.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
