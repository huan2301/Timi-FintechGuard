from datetime import datetime, timezone

from scripts.log_hook import normalize
from scripts.log_manual import build_entry


def test_manual_log_uses_utc_timestamp(monkeypatch):
    monkeypatch.setattr("scripts.log_manual.get_repo", lambda: "demo-repo")
    monkeypatch.setattr("scripts.log_manual.get_branch", lambda: "main")
    monkeypatch.setattr("scripts.log_manual.get_commit", lambda: "abc1234")
    monkeypatch.setattr("scripts.log_manual.get_student", lambda: "student@example.com")

    entry = build_entry("chatgpt", "hello there", model="gpt-4o", result="ok")

    assert entry["timestamp"].endswith("+00:00")
    assert entry["created_at"].endswith("+00:00")
    assert datetime.fromisoformat(entry["timestamp"]).tzinfo == timezone.utc


def test_hook_log_uses_utc_timestamp(monkeypatch):
    def fake_git(cmd):
        if "remote get-url origin" in cmd:
            return "https://example.com/demo-repo.git"
        if "rev-parse --abbrev-ref HEAD" in cmd:
            return "main"
        if "rev-parse --short HEAD" in cmd:
            return "abc1234"
        if "config user.email" in cmd:
            return "student@example.com"
        return ""

    monkeypatch.setattr("scripts.log_hook.git", fake_git)

    entry = normalize({"hook_event_name": "UserPromptSubmit", "prompt": "hello there"}, "claude")

    assert entry is not None
    assert entry["ts"].endswith("+00:00")
    assert datetime.fromisoformat(entry["ts"]).tzinfo == timezone.utc
