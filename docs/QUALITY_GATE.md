# Quality Gate & Deliverables Evidence

This page is the evidence index for the common weaknesses checklist.

## Status matrix

| Risk | Status | Evidence |
|---|---|---|
| No CI/CD | Addressed | `.github/workflows/ci.yml` runs backend tests, maintained-code lint, frontend lint/build, and Docker builds. `.github/workflows/cd.yml` publishes images and can trigger Render through a secret hook. |
| No tests | Addressed | `tests/` contains unit, service, agent, API, security, and evaluation-oriented tests. Latest run: **124 passed, 1 xfailed**, with **56.02% coverage**; CI enforces a 50% threshold. |
| Bare `except` | Addressed in product/test paths | No bare `except:` remains under `src/`, `scripts/`, `tests/`, or `eval/`. Expected fallback handlers use explicit exception classes or `Exception` at process boundaries. |
| Hardcoded secrets | Addressed in tracked files; local incident remains | `.env.example` contains placeholders and `.env` is ignored. A local `.env` was found with live-looking credentials; revoke/rotate those values before sharing or deploying. Never paste them into GitHub Actions or documentation. |
| Missing evaluation evidence | Addressed | `eval/results/report.md`, raw JSON runs, five non-empty golden suites (18 cases), schema validation, and this quality-gate record. The historical Guardian baseline reports 32/32 cases passing its listed metrics. |
| No video demo | Script prepared; recording still required | `presentation/VIDEO_DEMO_SCRIPT.md` provides a sub-five-minute shot list and acceptance checklist. The actual MP4 or hosted URL must be recorded/uploaded by the team. |

## Reproducible checks

From the repository root:

```powershell
$env:PYTHONPATH = "."
.\.venv\Scripts\python.exe eval/runners/validate_schema.py
.\.venv\Scripts\python.exe -m pytest tests -q --cov=src/app --cov-report=term-missing --cov-fail-under=50
.\.venv\Scripts\python.exe -m ruff check src/agents src/app/api eval/runners/validate_schema.py tests/test_services/test_timi_bank.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Security follow-up

The local `.env` file must be treated as compromised because it contains
provider keys, a database URL, mail credentials, and other secrets. Rotate each
provider/database/mail credential, then recreate `.env` from `.env.example`.
