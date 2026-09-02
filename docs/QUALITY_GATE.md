# Quality Gate & Deliverables Evidence

This page is the evidence index for the common weaknesses checklist.

## Status matrix

| Risk | Status | Evidence |
|---|---|---|
| No CI/CD | Addressed | `.github/workflows/ci.yml` runs backend tests, all-Python lint/format checks, Python and npm dependency audits, frontend lint/build, migration validation, and Docker builds. `.github/workflows/cd.yml` publishes images and can trigger Render through a secret hook. |
| Automated tests | Addressed | `tests/` contains unit, service, agent, API, security, and evaluation-oriented tests. Latest local run: **304 passed, no expected-failure skips, 59.39% coverage**; CI enforces a 50% coverage threshold. |
| Bare `except` | Addressed in product/test paths | No bare `except:` remains under `src/`, `scripts/`, `tests/`, or `eval/`. Expected fallback handlers use explicit exception classes or `Exception` at process boundaries. |
| Hardcoded secrets | Addressed in tracked files; local incident remains | `.env.example` contains placeholders and `.env` is ignored. A local `.env` was found with live-looking credentials; revoke/rotate those values before sharing or deploying. Never paste them into GitHub Actions or documentation. |
| Missing evaluation evidence | Addressed | `eval/results/report.md`, raw JSON runs, five non-empty golden suites (18 cases), schema validation, and this quality-gate record. The historical Guardian baseline reports 32/32 cases passing its listed metrics. |
| No video demo | Script prepared; recording still required | `presentation/VIDEO_DEMO_SCRIPT.md` provides a sub-five-minute shot list and acceptance checklist. The actual MP4 or hosted URL must be recorded/uploaded by the team. |

## Reproducible checks

From the repository root:

```powershell
$env:PYTHONPATH = "."
python eval/runners/validate_schema.py
python -m pytest tests -q --cov=src/app --cov-report=term-missing --cov-fail-under=50
python -m ruff check src tests eval scripts
python -m ruff format --check src tests eval scripts
python -m compileall -q src tests eval scripts
python -m pip_audit -r requirements.txt
npm --prefix frontend run lint
npm --prefix frontend audit --audit-level=high
npm --prefix frontend run build
docker compose build
```

## Security follow-up

The local `.env` file must be treated as compromised because it contains
provider keys, a database URL, mail credentials, and other secrets. Rotate each
provider/database/mail credential, then recreate `.env` from `.env.example`.
