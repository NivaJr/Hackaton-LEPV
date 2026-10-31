"""Run the real hook with UTF-8 input and a Windows-1252 text environment."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "archive_prompts.py"
BOOTSTRAP = """
import runpy, sys
from pathlib import Path
namespace = runpy.run_path(sys.argv[1])
destination = Path(sys.argv[2])
namespace['main'].__globals__.update(
    DEST=destination, INDEX=destination / '.archive-index.json'
)
raise SystemExit(namespace['main']())
"""


class ArchivePromptsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.destination = self.root / "PROMPTS"
        self.text = 'Ação • └ “aspas curvas”, português e emoji 🚀.'
        self.event = {
            "hook_event_name": "UserPromptSubmit", "session_id": "test-session",
            "turn_id": "test-turn", "prompt": self.text,
        }

    def run_hook(self, event):
        payload = event if isinstance(event, bytes) else json.dumps(event, ensure_ascii=False).encode("utf-8")
        environment = dict(os.environ, PYTHONIOENCODING="cp1252:surrogateescape", PYTHONUTF8="0")
        process = subprocess.run(
            [sys.executable, "-c", BOOTSTRAP, str(SCRIPT), str(self.destination)],
            input=payload, capture_output=True, env=environment, timeout=15,
        )
        self.assertEqual(process.returncode, 0, repr(process.stderr))
        return json.loads(process.stdout.decode("ascii"))

    def read_index(self):
        return json.loads((self.destination / ".archive-index.json").read_text(encoding="utf-8"))

    def records(self):
        return self.read_index()["sessions"]["test-session"]["records"]

    def assert_record(self, record):
        content = (self.destination / record["file"]).read_bytes()
        self.assertEqual(content.decode("utf-8").split("## Texto do prompt\n\n", 1)[1], self.text + "\n")
        self.assertEqual(record["file_sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual(record["key"], hashlib.sha256(self.text.encode("utf-8")).hexdigest())

    def transcript(self):
        path = self.root / "transcript.jsonl"
        items = [
            {"type": "session_meta", "payload": {"id": "test-session"}},
            {"type": "response_item", "payload": {
                "type": "message", "role": "user", "turn_id": "test-turn",
                "content": [{"type": "input_text", "text": self.text}],
            }},
            {"type": "event_msg", "payload": {
                "type": "user_message", "turn_id": "test-turn", "message": self.text,
            }},
        ]
        path.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in items), encoding="utf-8")
        return {
            "hook_event_name": "PreCompact", "session_id": "test-session",
            "turn_id": "test-turn", "trigger": "manual", "transcript_path": str(path),
        }

    def test_utf8_submission_preserves_text_and_retry_is_idempotent(self):
        self.assertEqual(self.run_hook(self.event), {})
        before = (self.destination / ".archive-index.json").read_bytes()
        self.assertEqual(self.run_hook(self.event), {})
        self.assertEqual((self.destination / ".archive-index.json").read_bytes(), before)
        self.assertEqual(len(self.records()), 1)
        self.assert_record(self.records()[0])

    def test_repeated_text_in_another_turn_keeps_both_occurrences(self):
        self.assertEqual(self.run_hook(self.event), {})
        self.assertEqual(self.run_hook(dict(self.event, turn_id="second-turn")), {})
        records = self.records()
        self.assertEqual(len(records), 2)
        self.assertNotEqual(records[0]["file"], records[1]["file"])
        for record in records:
            self.assert_record(record)

    def test_git_checkout_preserves_archive_hashes_with_autocrlf_enabled(self):
        self.assertEqual(self.run_hook(self.event), {})
        attributes = SCRIPT.parents[1] / ".gitattributes"
        (self.root / ".gitattributes").write_bytes(attributes.read_bytes())
        subprocess.run(["git", "init", "--quiet", str(self.root)], check=True, capture_output=True, timeout=15)
        command = ["git", "-C", str(self.root)]
        for arguments in [
            ["config", "core.autocrlf", "true"],
            ["add", ".gitattributes", "PROMPTS"],
            ["checkout-index", "--force", "--all"],
        ]:
            subprocess.run(command + arguments, check=True, capture_output=True, timeout=15)
        self.assertEqual(self.run_hook(self.event), {})
        self.assertEqual(len(self.records()), 1)
        self.assert_record(self.records()[0])

    def test_precompact_matches_utf8_submission_without_duplication(self):
        self.assertEqual(self.run_hook(self.event), {})
        self.assertEqual(self.run_hook(self.transcript()), {})
        self.assertEqual(len(self.records()), 1)
        self.assertEqual(self.records()[0]["transcript_index"], 0)
        self.assert_record(self.records()[0])

    def test_precompact_recovers_uncaptured_utf8_prompt(self):
        event = self.transcript()
        self.assertEqual(self.run_hook(event), {})
        self.assertEqual(self.run_hook(event), {})
        self.assertEqual(len(self.records()), 1)
        self.assert_record(self.records()[0])

    def test_invalid_utf8_blocks_without_changing_archive(self):
        self.assertEqual(self.run_hook(self.event), {})
        before = (self.destination / ".archive-index.json").read_bytes()
        self.assertFalse(self.run_hook(b'{"prompt": "\xff"}')["continue"])
        self.assertEqual((self.destination / ".archive-index.json").read_bytes(), before)
        self.assert_record(self.records()[0])

    def test_unicode_integrity_error_returns_structured_block(self):
        self.assertEqual(self.run_hook(self.event), {})
        index = self.read_index()
        filename = "registro_🚀.md"
        index["sessions"]["test-session"]["records"][0]["file"] = filename
        path = self.destination / ".archive-index.json"
        path.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
        before = path.read_bytes()
        result = self.run_hook(self.event)
        self.assertFalse(result["continue"])
        self.assertIn(filename, result["stopReason"])
        self.assertEqual(path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
