#!/usr/bin/env python3
"""
Phase 0 - Baseline Evaluation Script for Guardian Agent

Located at: eval/scripts/run_baseline_eval.py (inside the project)

Usage (from repository root):
  # Configure GUARDIAN_AGENT_API_KEY (or GROQ_API_KEY fallback) in .env.
  python eval/scripts/run_baseline_eval.py

  # Measure raw model quality without the deterministic production guardrail:
  $env:GUARDIAN_EVAL_MODE = "model"
  python eval/scripts/run_baseline_eval.py

This script evaluates the current Guardian agent against the dataset
in eval/dataset/guardian_cases_v0.json and produces a baseline report
in eval/results/.

It does NOT modify production code. It only measures current performance.
"""

from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Adjust path if needed when running from repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

try:
    from src.app.services.agent_provider_config import guardian_provider_config
    from src.app.services.scam_guardian import GuardianConversationState, GuardianRiskResult
    from src.app.services.scam_guardian_agent import (
        analyze_with_guardian_agent,
        GuardianAgentUnavailableError,
        _direct_evidence_guardrail,
        analyze_with_guardian_agent,
    )
except ImportError as e:
    print(f"[ERROR] Cannot import Guardian modules: {e}")
    print("Make sure you run this from the repository root and dependencies are installed.")
    sys.exit(1)


DATASET_PATH = REPO_ROOT / "eval" / "dataset" / "guardian_cases_v0.json"
RESULTS_DIR = REPO_ROOT / "eval" / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
CASE_DELAY_SECONDS = float(os.getenv("GUARDIAN_EVAL_CASE_DELAY_SECONDS", "3"))
MAX_CASE_ATTEMPTS = max(1, int(os.getenv("GUARDIAN_EVAL_MAX_ATTEMPTS", "3")))
MAX_RETRY_WAIT_SECONDS = 30.0
EVAL_MODES = {"hybrid", "model", "policy"}
EVAL_MODE = os.getenv("GUARDIAN_EVAL_MODE", "hybrid").strip().lower()
EVAL_CASE_IDS = {
    value.strip()
    for value in os.getenv("GUARDIAN_EVAL_CASE_IDS", "").split(",")
    if value.strip()
}


def policy_only_result(state: GuardianConversationState) -> GuardianRiskResult:
    """Run only the auditable safety policy for comparison with model mode."""

    baseline = GuardianRiskResult(
        risk_score=0,
        risk_level="safe",
        scenario=None,
        recommended_action="CONTINUE",
        explanation="Chưa phát hiện tín hiệu rủi ro trực tiếp.",
        signals=(),
    )
    return _direct_evidence_guardrail(state, baseline)


def load_dataset() -> list[dict[str, Any]]:
    with open(DATASET_PATH, encoding="utf-8") as f:
        return json.load(f)


def build_state(transcript: list[dict]) -> GuardianConversationState:
    state = GuardianConversationState()
    for turn in transcript:
        state.append(turn.get("speaker", "caller"), turn.get("text", ""))
    return state


def get_latest_text(transcript: list[dict]) -> str:
    if not transcript:
        return ""
    return transcript[-1].get("text", "")


def evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    """Run one case and return detailed result."""
    case_id = case["id"]
    expected = case["expected"]
    transcript = case["transcript"]

    state = build_state(transcript)
    latest = get_latest_text(transcript)

    start = time.perf_counter()
    error = None
    result = None
    schema_ok = True

    for attempts in range(1, MAX_CASE_ATTEMPTS + 1):
        try:
            if EVAL_MODE == "policy":
                result = policy_only_result(state)
            else:
                result = analyze_with_guardian_agent(
                    state,
                    latest,
                    apply_direct_guardrail=EVAL_MODE == "hybrid",
                )
            error = None
            error_metadata = None
            break
        except GuardianAgentUnavailableError as exc:
            error = str(exc)
            error_metadata = _error_metadata(exc)
            if attempts == MAX_CASE_ATTEMPTS or not _should_retry(exc):
                break
            provider_wait = exc.retry_after_seconds or (2.0 * attempts)
            time.sleep(min(MAX_RETRY_WAIT_SECONDS, max(2.0, provider_wait)))
        except Exception as exc:
            error = f"Unexpected: {type(exc).__name__}: {exc}"
            error_metadata = {
                "error_type": type(exc).__name__,
                "status_code": None,
                "retry_after_seconds": 0,
                "provider_message": str(exc)[:500],
            }
            break

    schema_ok = result is not None

    latency_ms = round((time.perf_counter() - start) * 1000, 1)

    # Scoring
    action_match = False
    level_match = False
    score_in_range = False
    signal_ok = True

    if result is not None:
        action_match = result.recommended_action == expected["recommended_action"]
        level_match = result.risk_level == expected["risk_level"]
        low, high = expected["risk_score_range"]
        score_in_range = low <= result.risk_score <= high

        detected_types = {s.signal_type for s in result.signals}
        for must in expected.get("must_have_signals", []):
            if must not in detected_types:
                signal_ok = False
        for must_not in expected.get("must_not_have_signals", []):
            if must_not in detected_types:
                signal_ok = False

    return {
        "id": case_id,
        "category": case.get("category"),
        "description": case.get("description"),
        "latency_ms": latency_ms,
        "schema_ok": schema_ok,
        "error": error,
        "predicted_action": result.recommended_action if result else None,
        "predicted_level": result.risk_level if result else None,
        "predicted_score": result.risk_score if result else None,
        "predicted_signals": [s.signal_type for s in result.signals] if result else [],
        "expected_action": expected["recommended_action"],
        "expected_level": expected["risk_level"],
        "action_match": action_match,
        "level_match": level_match,
        "score_in_range": score_in_range,
        "signal_ok": signal_ok,
        "overall_pass": action_match and schema_ok,  # primary metric for Phase 0
    }


def compute_metrics(results: list[dict]) -> dict[str, Any]:
    total = len(results)
    schema_ok = sum(1 for r in results if r["schema_ok"])
    action_correct = sum(1 for r in results if r["action_match"])
    level_correct = sum(1 for r in results if r["level_match"])
    score_ok = sum(1 for r in results if r["score_in_range"])
    signal_ok = sum(1 for r in results if r["signal_ok"])
    overall_pass = sum(1 for r in results if r["overall_pass"])

    # Status counts
    n_pass = sum(1 for r in results if r["overall_pass"])
    n_error = sum(1 for r in results if r["error"])
    n_fail = total - n_pass - n_error  # schema ok but action wrong

    # Per-action confusion style
    by_action = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "support": 0})
    for r in results:
        exp = r["expected_action"]
        pred = r["predicted_action"]
        by_action[exp]["support"] += 1
        if pred == exp:
            by_action[exp]["tp"] += 1
        else:
            by_action[exp]["fn"] += 1
            if pred:
                by_action[pred]["fp"] += 1

    # Predicted action distribution (None = schema fail)
    action_dist = Counter(
        (r["predicted_action"] if r["predicted_action"] is not None else "None")
        for r in results
    )

    # Per-category breakdown
    by_category: dict[str, dict[str, int]] = defaultdict(
        lambda: {"total": 0, "pass": 0, "fail": 0, "error": 0}
    )
    for r in results:
        cat = r.get("category") or "unknown"
        by_category[cat]["total"] += 1
        if r["error"]:
            by_category[cat]["error"] += 1
        elif r["overall_pass"]:
            by_category[cat]["pass"] += 1
        else:
            by_category[cat]["fail"] += 1

    # Latency (schema OK only)
    latencies = [r["latency_ms"] for r in results if r["schema_ok"]]
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else None
    p50_latency = None
    p95_latency = None
    if latencies:
        sorted_lat = sorted(latencies)
        p50_latency = sorted_lat[len(sorted_lat) // 2]
        p95_idx = min(len(sorted_lat) - 1, int(len(sorted_lat) * 0.95))
        p95_latency = sorted_lat[p95_idx]

    # Lists for report
    error_cases = [
        {"id": r["id"], "category": r.get("category"), "error": r["error"], "latency_ms": r["latency_ms"]}
        for r in results
        if r["error"]
    ]
    fail_cases = [
        {
            "id": r["id"],
            "category": r.get("category"),
            "expected_action": r["expected_action"],
            "predicted_action": r["predicted_action"],
            "latency_ms": r["latency_ms"],
        }
        for r in results
        if not r["error"] and not r["overall_pass"]
    ]

    return {
        "total_cases": total,
        "pass_count": n_pass,
        "fail_count": n_fail,
        "error_count": n_error,
        "schema_ok_count": schema_ok,
        "schema_ok_rate": round(schema_ok / total, 4) if total else 0,
        "action_accuracy": round(action_correct / total, 4) if total else 0,
        "level_accuracy": round(level_correct / total, 4) if total else 0,
        "score_in_range_rate": round(score_ok / total, 4) if total else 0,
        "signal_ok_rate": round(signal_ok / total, 4) if total else 0,
        "overall_pass_rate": round(overall_pass / total, 4) if total else 0,
        "avg_latency_ms": avg_latency,
        "p50_latency_ms": p50_latency,
        "p95_latency_ms": p95_latency,
        "by_action": dict(by_action),
        "action_distribution": dict(action_dist),
        "by_category": dict(by_category),
        "error_cases": error_cases,
        "fail_cases": fail_cases,
    }


def print_summary(metrics: dict[str, Any], prompt_version: str, out_path: Path) -> None:
    print("\n" + "=" * 60)
    print("BASELINE SUMMARY")
    print("=" * 60)
    print(f"Prompt version       : v{prompt_version}")
    print(f"Total cases          : {metrics['total_cases']}")
    print(f"  PASS / FAIL / ERROR: {metrics['pass_count']} / {metrics['fail_count']} / {metrics['error_count']}")
    print(f"Schema OK rate       : {metrics['schema_ok_rate']:.1%}")
    print(f"Action accuracy      : {metrics['action_accuracy']:.1%}")
    print(f"Level accuracy       : {metrics['level_accuracy']:.1%}")
    print(f"Score in range rate  : {metrics['score_in_range_rate']:.1%}")
    print(f"Signal check rate    : {metrics['signal_ok_rate']:.1%}")
    print(f"Overall pass rate    : {metrics['overall_pass_rate']:.1%}")
    print(f"Avg latency (ms)     : {metrics['avg_latency_ms']}")
    print(f"P50 / P95 latency    : {metrics['p50_latency_ms']} / {metrics['p95_latency_ms']}")

    print("\nAction distribution (predicted):")
    for action, count in sorted(metrics["action_distribution"].items(), key=lambda x: (-x[1], x[0])):
        print(f"  {action:12} {count}")

    print("\nBy category:")
    for cat, stats in sorted(metrics["by_category"].items()):
        print(
            f"  {cat:10} total={stats['total']:2}  "
            f"pass={stats['pass']:2}  fail={stats['fail']:2}  error={stats['error']:2}"
        )

    if metrics["error_cases"]:
        print("\nSchema ERROR cases:")
        for c in metrics["error_cases"]:
            err_short = (c["error"] or "")[:80]
            print(f"  - {c['id']} ({c['category']}): {err_short}")

    if metrics["fail_cases"]:
        print("\nAction FAIL cases:")
        for c in metrics["fail_cases"]:
            print(
                f"  - {c['id']} ({c['category']}): "
                f"expected={c['expected_action']} → predicted={c['predicted_action']}"
            )

    print(f"\nDetailed report saved to: {out_path}")
    print("=" * 60)


def main() -> None:
    print("=" * 60)
    print("Phase 0 – Guardian Agent Baseline Evaluation")
    print("=" * 60)

    if EVAL_MODE not in EVAL_MODES:
        print(f"[ERROR] GUARDIAN_EVAL_MODE must be one of: {', '.join(sorted(EVAL_MODES))}")
        sys.exit(2)

    print(f"Evaluation mode: {EVAL_MODE} (policy, model, or production hybrid)")
    provider = guardian_provider_config()
    if EVAL_MODE == "policy":
        print("Provider not used in policy-only mode")
    elif not provider.api_key:
        print("[WARN] Guardian API key is not configured. Agent calls will fail.")
        print("       Set GUARDIAN_AGENT_API_KEY or GROQ_API_KEY in .env before running.")
    else:
        print(f"Provider configured: model={provider.model}")

    dataset = load_dataset()
    if EVAL_CASE_IDS:
        dataset = [case for case in dataset if case.get("id") in EVAL_CASE_IDS]
        if not dataset:
            print("[ERROR] GUARDIAN_EVAL_CASE_IDS did not match any dataset case")
            sys.exit(2)
        print(f"Filtered to {len(dataset)} requested case(s)")
    print(f"Loaded {len(dataset)} cases from {DATASET_PATH}")

    results = []
    for i, case in enumerate(dataset, 1):
        print(f"[{i}/{len(dataset)}] Running {case['id']} ...", end=" ", flush=True)
        res = evaluate_case(case)
        status = "PASS" if res["overall_pass"] else "FAIL"
        if res["error"]:
            status = "ERROR"
        print(f"{status} (action={res['predicted_action']}, {res['latency_ms']}ms)")
        results.append(res)
        # Small delay to be gentle on rate limits
        time.sleep(1.5)

    metrics = compute_metrics(results)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    report = {
        "phase": "0",
        "timestamp_utc": timestamp,
        "prompt_version": GUARDIAN_AGENT_PROMPT_VERSION,
        "evaluation_mode": EVAL_MODE,
        "dataset": str(DATASET_PATH.name),
        "metrics": metrics,
        "results": results,
    }

    out_path = RESULTS_DIR / f"baseline_{timestamp}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print_summary(metrics, PROMPT_VERSION, out_path)


if __name__ == "__main__":
    main()