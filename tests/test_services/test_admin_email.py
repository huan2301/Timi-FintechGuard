from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import BackgroundTasks

from src.app.routers.api.admin import emails


def test_product_update_queues_email_only_for_consented_recipients(monkeypatch) -> None:
    db = MagicMock()
    background_tasks = BackgroundTasks()
    monkeypatch.setattr(emails, "_create_notifications_for_all", lambda *_args, **_kwargs: 2)
    monkeypatch.setattr(
        emails,
        "_promotion_email_recipients",
        lambda _db: [("opted-in@example.test", "Người dùng")],
    )
    monkeypatch.setattr(
        emails,
        "_newsletter_recipients",
        lambda _db, _existing: [("newsletter@example.test", "bạn")],
    )
    monkeypatch.setattr(emails, "add_audit_log", lambda *_args, **_kwargs: None)

    result = emails.publish_product_update(
        emails.ProductUpdateRequest(
            version="v2",
            title="Cập nhật",
            body="Dòng 1\n<script>không chạy</script>",
            send_now=True,
        ),
        background_tasks,
        db,
        SimpleNamespace(id="admin-id"),
    )

    assert result.queued == 4
    assert len(background_tasks.tasks) == 1
    task = background_tasks.tasks[0]
    assert task.kwargs["recipients"] == [
        ("opted-in@example.test", "Người dùng"),
        ("newsletter@example.test", "bạn"),
    ]
    assert "&lt;script&gt;" in task.kwargs["html"]
    db.commit.assert_called_once()


def test_product_update_without_email_still_creates_in_app_notice(monkeypatch) -> None:
    db = MagicMock()
    background_tasks = BackgroundTasks()
    monkeypatch.setattr(emails, "_create_notifications_for_all", lambda *_args, **_kwargs: 3)
    monkeypatch.setattr(emails, "add_audit_log", lambda *_args, **_kwargs: None)

    result = emails.publish_product_update(
        emails.ProductUpdateRequest(title="Cập nhật", body="Nội dung", send_now=False),
        background_tasks,
        db,
        SimpleNamespace(id="admin-id"),
    )

    assert result.queued == 3
    assert background_tasks.tasks == []
