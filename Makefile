.PHONY: run test lint format format-check audit check

PYTHON ?= python

run:
	$(PYTHON) -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test:
	$(PYTHON) -m pytest tests -q --cov=src/app --cov-report=term-missing --cov-fail-under=50

lint:
	$(PYTHON) -m ruff check src tests eval scripts

format:
	$(PYTHON) -m ruff format src tests eval scripts

format-check:
	$(PYTHON) -m ruff format --check src tests eval scripts

audit:
	$(PYTHON) -m pip_audit -r requirements.txt
	npm --prefix frontend audit --audit-level=high

check: lint format-check test audit
