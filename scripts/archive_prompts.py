#!/usr/bin/env python3
"""Archive explicit user prompts; read only the transcript supplied by the hook."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "PROMPTS"
INDEX = DEST / ".archive-index.json"


class ArchiveError(Exception):
    pass


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def clean_prompt(value: str) -> str:
    """Remove only recognized, leading environment/AGENTS injection blocks."""
    value = value.replace("\r\n", "\n")
    patterns = (
        r"\A\s*<environment_context>.*?</environment_context>\s*",
        r"\A\s*# AGENTS\.md instructions for [^\n]+\n+<INSTRUCTIONS>.*?</INSTRUCTIONS>\s*",
    )
    while True:
        before = value
        for pattern in patterns:
            value = re.sub(pattern, "", value, count=1, flags=re.DOTALL)
        if value == before:
            return value


def prompt_key(value: str) -> str:
    # Transport-only leading/trailing newlines do not create a second record.
    return digest(value.strip("\n"))


def required_string(obj: dict, field: str) -> str:
    value = obj.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ArchiveError(f"Campo obrigatório ausente/inválido: {field}.")
    return value


def atomic_write(path: Path, data: bytes) -> None:
    if path.exists() and path.read_bytes() == data:
        return
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".archive-tmp-", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def archive_lock():
    DEST.mkdir(parents=True, exist_ok=True)
    lock = DEST / ".archive-lock"
    deadline = time.monotonic() + 5
    while True:
        try:
            lock.mkdir()
            break
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise ArchiveError("Arquivo de prompts ocupado; verifique PROMPTS/.archive-lock.")
            time.sleep(0.05)
    try:
        yield
    finally:
        lock.rmdir()


def load_index() -> dict:
    if not INDEX.exists():
        return {"version": 1, "sessions": {}}
    try:
        data = json.loads(INDEX.read_text(encoding="utf-8"))
        if data.get("version") != 1 or not isinstance(data.get("sessions"), dict):
            raise ValueError("schema")
        return data
    except (ValueError, AttributeError) as exc:
        raise ArchiveError("Índice de prompts inválido; não será sobrescrito.") from exc


def save_index(data: dict) -> None:
    atomic_write(INDEX, (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def validate_records(session: dict) -> None:
    if not isinstance(session.get("records"), list) or not isinstance(session.get("snapshot"), list):
        raise ArchiveError("Estrutura de sessão inválida no índice.")
    for record in session["records"]:
        filename = record.get("file", "")
        if not isinstance(filename, str) or Path(filename).name != filename or not filename.endswith(".md"):
            raise ArchiveError("Caminho inválido no índice de prompts.")
        path = DEST / filename
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != record.get("file_sha256"):
            raise ArchiveError(f"Prompt arquivado ausente ou alterado: {filename}.")


def write_record(session_id: str, text: str, source: str, identity: str, turn_id=None) -> dict:
    filename = f"s_{digest(session_id)[:16]}_{identity}.md"
    # JSON-escaped metadata stays on one line; prompt text below is kept verbatim.
    header = (
        "# Prompt de usuário\n\n"
        f"- Sessão: `{json.dumps(session_id, ensure_ascii=False)}`\n"
        f"- Turno: `{json.dumps(turn_id, ensure_ascii=False)}`\n"
        f"- Origem: `{source}`\n"
        f"- Arquivado em UTC: {datetime.now(timezone.utc).isoformat()}\n\n"
        "## Texto do prompt\n\n"
    )
    content = (header + text + "\n").encode("utf-8")
    path = DEST / filename
    if path.exists():
        # A previous interrupted write may have left the deterministic file.
        previous = path.read_bytes()
        marker = b"## Texto do prompt\n\n"
        if marker not in previous or previous.split(marker, 1)[1] != (text + "\n").encode("utf-8"):
            raise ArchiveError(f"Arquivo já existe com conteúdo diferente: {filename}.")
        content = previous
    else:
        atomic_write(path, content)
    return {
        "file": filename,
        "key": prompt_key(text),
        "turn_id": turn_id,
        "transcript_index": None,
        "file_sha256": hashlib.sha256(content).hexdigest(),
    }


def transcript_prompts(path: Path, session_id: str) -> list[dict]:
    if not path.is_file():
        raise ArchiveError("transcript_path não existe ou não é um arquivo.")
    response_prompts, event_prompts = [], []
    known_types = {"session_meta", "turn_context", "response_item", "event_msg", "compacted"}
    try:
        with path.open(encoding="utf-8") as stream:
            for number, line in enumerate(stream, 1):
                if not line.strip():
                    continue
                try:
                    item = json.loads(line)
                except ValueError as exc:
                    raise ArchiveError(f"Transcript JSONL inválido na linha {number}.") from exc
                if not isinstance(item, dict) or item.get("type") not in known_types:
                    raise ArchiveError(f"Formato de transcript não suportado na linha {number}.")
                kind, payload = item["type"], item.get("payload")
                if not isinstance(payload, dict):
                    raise ArchiveError(f"Payload de transcript não suportado na linha {number}.")
                if kind == "session_meta" and payload.get("id") not in (None, session_id):
                    raise ArchiveError("O transcript pertence a outra sessão.")
                text, target = None, None
                if kind == "response_item" and payload.get("role") == "user":
                    if payload.get("type") != "message" or not isinstance(payload.get("content"), list):
                        raise ArchiveError(f"Mensagem de usuário não suportada na linha {number}.")
                    chunks = []
                    for chunk in payload["content"]:
                        if not isinstance(chunk, dict):
                            raise ArchiveError(f"Conteúdo de usuário inválido na linha {number}.")
                        if chunk.get("type") in {"input_text", "text"} and isinstance(chunk.get("text"), str):
                            chunks.append(chunk["text"])
                        elif chunk.get("type") in {"input_image", "image"}:
                            # Images are attachments, not textual prompts; never copy URLs or pixels.
                            continue
                        else:
                            raise ArchiveError(f"Tipo de conteúdo de usuário não suportado na linha {number}.")
                    if not chunks:
                        raise ArchiveError(f"Mensagem sem texto na linha {number}; anexe registro manual.")
                    text, target = "\n".join(chunks), response_prompts
                elif kind == "event_msg" and payload.get("type") == "user_message":
                    text, target = payload.get("message"), event_prompts
                    if not isinstance(text, str):
                        raise ArchiveError(f"Evento de usuário não suportado na linha {number}.")
                if text is not None:
                    text = clean_prompt(text)
                    if text.strip():
                        turn_id = payload.get("turn_id")
                        target.append({"text": text, "key": prompt_key(text), "turn_id": turn_id if isinstance(turn_id, str) else None})
    except UnicodeError as exc:
        raise ArchiveError("Transcript não está em UTF-8.") from exc
    if response_prompts and event_prompts:
        if [x["key"] for x in response_prompts] != [x["key"] for x in event_prompts]:
            raise ArchiveError("Representações de prompts no transcript divergem; cobertura não verificável.")
        for response, event in zip(response_prompts, event_prompts):
            response["turn_id"] = response["turn_id"] or event["turn_id"]
    result = response_prompts or event_prompts
    if not result:
        raise ArchiveError("Nenhum prompt textual reconhecido no transcript; cobertura não verificável.")
    return result


def submit(event: dict, session: dict, session_id: str) -> None:
    turn_id = required_string(event, "turn_id")
    text = clean_prompt(required_string(event, "prompt"))
    if not text.strip():
        raise ArchiveError("Prompt vazio após remover blocos automáticos.")
    for record in session["records"]:
        if record.get("turn_id") == turn_id:
            if record["key"] != prompt_key(text):
                raise ArchiveError("Mesmo turn_id recebido com outro conteúdo; nenhum prompt foi sobrescrito.")
            return
    session["records"].append(write_record(session_id, text, "UserPromptSubmit", "turn_" + digest(turn_id)[:16], turn_id))


def precompact(event: dict, session: dict, session_id: str) -> None:
    if event.get("trigger") not in {"auto", "manual"}:
        raise ArchiveError("PreCompact exige trigger auto ou manual.")
    path = Path(required_string(event, "transcript_path")).expanduser()
    if not path.is_absolute():
        path = Path(required_string(event, "cwd")) / path
    prompts = transcript_prompts(path, session_id)
    keys = [item["key"] for item in prompts]
    previous = session["snapshot"]
    if keys[:len(previous)] != previous:
        raise ArchiveError("Transcript foi truncado ou mudou desde o último backup; cobertura não verificável.")
    occupied = {}
    for record in session["records"]:
        position = record.get("transcript_index")
        if position is not None:
            if not isinstance(position, int) or position < 0 or position >= len(keys) or keys[position] != record["key"] or position in occupied:
                raise ArchiveError("Histórico arquivado não corresponde ao transcript atual.")
            occupied[position] = record
    # Match independently captured submissions by occurrence, preserving repeats.
    limit = len(prompts)
    pending = [record for record in session["records"] if record.get("transcript_index") is None]
    assignments = []
    for record in reversed(pending):
        candidates = [i for i in range(limit) if i not in occupied and prompts[i]["key"] == record["key"] and (prompts[i]["turn_id"] in (None, record["turn_id"]))]
        if not candidates:
            if record["turn_id"] == event.get("turn_id"):
                # The triggering new prompt may not yet be appended to the transcript.
                continue
            raise ArchiveError("Prompt já capturado está ausente do transcript; cobertura não verificável.")
        position = candidates[-1]
        assignments.append((record, position))
        occupied[position] = record
        limit = position
    for record, position in assignments:
        record["transcript_index"] = position
    for position, prompt in enumerate(prompts):
        if position not in occupied:
            record = write_record(session_id, prompt["text"], "PreCompact (backup)", f"prompt_{position + 1:06d}", prompt["turn_id"])
            record["transcript_index"] = position
            session["records"].append(record)
    session["snapshot"] = keys


def main() -> int:
    try:
        event = json.load(sys.stdin)
        if not isinstance(event, dict):
            raise ArchiveError("O evento de hook deve ser um objeto JSON.")
        name = required_string(event, "hook_event_name")
        if name not in {"UserPromptSubmit", "PreCompact"}:
            raise ArchiveError("Evento não suportado pelo arquivador.")
        session_id = required_string(event, "session_id")
        with archive_lock():
            index = load_index()
            session = index["sessions"].setdefault(session_id, {"records": [], "snapshot": []})
            validate_records(session)
            if name == "UserPromptSubmit":
                submit(event, session, session_id)
            else:
                precompact(event, session, session_id)
            save_index(index)
        print("{}")
        return 0
    except (ArchiveError, OSError, ValueError, KeyError, TypeError) as exc:
        reason = f"Falha ao arquivar prompts: {exc} Corrija o registro antes de continuar."
        print(reason, file=sys.stderr)
        # Exit 0 lets Codex consume the structured blocking result.
        print(json.dumps({"continue": False, "stopReason": reason}, ensure_ascii=False))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
