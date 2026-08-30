#!/usr/bin/env bash
# Cross-platform Python launcher for AI log hooks.
# Tries python3 → python → py -3 on PATH; on Windows, falls back to common
# Python install locations because Git Bash launched by some hooks gets a
# stripped PATH that omits the Windows Python directory.
# Designed to be sourced or called as: bash scripts/_pyrun.sh <script> [args...]
#
# Exits 0 silently if no Python is found — hooks must never block the AI tool.
set -u

# This repository requires Python 3.11+. Git Bash can place MSYS2's Python
# 3.10 ahead of the Windows installation on PATH, so use the repository venv
# (or an explicit 3.11 launcher) before falling back to PATH discovery below.
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -x "$REPO_ROOT/.venv/Scripts/python.exe" ]; then
  exec "$REPO_ROOT/.venv/Scripts/python.exe" "$@"
elif [ -x "$REPO_ROOT/.venv/bin/python" ]; then
  exec "$REPO_ROOT/.venv/bin/python" "$@"
elif command -v py >/dev/null 2>&1 && py -3.11 -c "import sys; assert sys.version_info >= (3, 11)" >/dev/null 2>&1; then
  exec py -3.11 "$@"
fi

if command -v python3 >/dev/null 2>&1 && python3 -c "import sys; assert sys.version_info >= (3, 11)" >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1 && python -c "import sys; assert sys.version_info >= (3, 11)" >/dev/null 2>&1; then
  PY=python
elif command -v py >/dev/null 2>&1 && py -3 -c "import sys; assert sys.version_info >= (3, 11)" >/dev/null 2>&1; then
  PY="py -3"
else
  # PATH lookup failed — probe standard Windows install locations.
  PY=""
  shopt -s nullglob 2>/dev/null || true
  for cand in \
    /c/Users/*/AppData/Local/Programs/Python/Python*/python.exe \
    "/c/Program Files/Python"*/python.exe \
    "/c/Program Files (x86)/Python"*/python.exe \
    /c/Python*/python.exe; do
    if [ -x "$cand" ] && "$cand" -c "import sys; assert sys.version_info >= (3, 11)" >/dev/null 2>&1; then
      PY="$cand"
      break
    fi
  done
  shopt -u nullglob 2>/dev/null || true
  [ -n "$PY" ] || exit 0
fi

# shellcheck disable=SC2086
exec $PY "$@"
