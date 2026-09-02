#!/usr/bin/env python3
"""
Phase 1 Evaluation Framework – Guardian Hybrid + Agent

Usage (repo root):
  export GROQ_API_KEY=...
  export GUARDIAN_PROMPT_VERSION=0.3
  export GUARDIAN_EVAL_MODE=hybrid   # agent | hybrid | rule
  python eval/scripts/run_phase1_eval.py
  python eval/scripts/run_phase1_eval.py --dataset eval/dataset/guardian_cases_v1.json

Metrics: schema OK, action accuracy, per-action Precision/Recall/F1 (STOP/PAUSE),
false positive rate on safe category, latency p50/p95.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from src.app.services.scam_guardian import (  # noqa: E402
    GuardianConversationState,
    analyze_guardian_state,
)
from src.app.services.scam_guardian_agent import (  # noqa: E402
    GuardianAgentUnavailableError,
    analyze_with_guardian_agent,
)

try:
    from src.app.services.scam_guardian_hybrid import analyze_hybrid
except ImportError:
    analyze_hybrid = None  # type: ignore

RESULTS_DIR = REPO_ROOT / "eval" / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

ACTIONS = ("CONTINUE", "MONITOR", "PAUSE", "STOP")
PROMPT_VERSION = os.getenv("GUARDIAN_PROMPT_VERSION", "0.3")
EVAL_MODE = os.getenv("GUARDIAN_EVAL_MODE", "hybrid")  # agent | hybrid | rule


def load_dataset(path: Path) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_state(transcript: list[dict]) -> GuardianConversationState:
    state = GuardianConversationState()
    for turn in transcript:
        state.append(turn.get("speaker", "caller"), turn.get("text", ""))
    return state


def predict(
    state: GuardianConversationState,
    latest: str,
    mode: str = EVAL_MODE,
) -> tuple[Any, str | None]:
    """Returns (GuardianRiskResult | None, error)."""
    try:
        if mode == "rule":
            return analyze_guardian_state(state), None
        if mode == "hybrid":
            if analyze_hybrid is None:
                return None, "hybrid module not available"
            result, _meta = analyze_hybrid(state, latest)
            return result, None
        # agent only
        return analyze_with_guardian_agent(state, latest), None
    except GuardianAgentUnavailableError as exc:
        return None, str(exc)
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"


def evaluate_case(case: dict[str, Any], mode: str = EVAL_MODE) -> dict[str, Any]:
    expected = case["expected"]
    transcript = case["transcript"]
    state = build_state(transcript)
    latest = transcript[-1].get("text", "") if transcript else ""

    start = time.perf_counter()
    result, error = predict(state, latest, mode)
    latency_ms = round((time.perf_counter() - start) * 1000, 1)

    schema_ok = result is not None
    action_match = level_match = score_in_range = signal_ok = False
    if result is not None:
        action_match = result.recommended_action == expected["recommended_action"]
        level_match = result.risk_level == expected["risk_level"]
        low, high = expected["risk_score_range"]
        score_in_range = low <= result.risk_score <= high
        detected = {s.signal_type for s in result.signals}
        signal_ok = all(m in detected for m in expected.get("must_have_signals", []))
        signal_ok = signal_ok and all(m not in detected for m in expected.get("must_not_have_signals", []))

    return {
        "id": case["id"],
        "category": case.get("category"),
        "latency_ms": latency_ms,
        "schema_ok": schema_ok,
        "error": error,
        "predicted_action": result.recommended_action if result else None,
        "predicted_level": result.risk_level if result else None,
        "predicted_score": result.risk_score if result else None,
        "expected_action": expected["recommended_action"],
        "expected_level": expected["risk_level"],
        "action_match": action_match,
        "level_match": level_match,
        "score_in_range": score_in_range,
        "signal_ok": signal_ok,
        "overall_pass": bool(action_match and schema_ok),
    }


def f1_for_action(results: list[dict], action: str) -> dict[str, float]:
    tp = fp = fn = 0
    for r in results:
        exp, pred = r["expected_action"], r["predicted_action"]
        if exp == action and pred == action:
            tp += 1
        elif exp != action and pred == action:
            fp += 1
        elif exp == action and pred != action:
            fn += 1
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    return {
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1": round(f1, 4),
        "support": tp + fn,
    }


def compute_metrics(results: list[dict]) -> dict[str, Any]:
    total = len(results)
    schema_ok = sum(1 for r in results if r["schema_ok"])
    n_pass = sum(1 for r in results if r["overall_pass"])
    n_error = sum(1 for r in results if r["error"])
    n_fail = total - n_pass - n_error

    safe = [r for r in results if r.get("category") == "safe"]
    fp_safe = sum(1 for r in safe if r["predicted_action"] in ("PAUSE", "STOP"))
    fp_rate_safe = round(fp_safe / len(safe), 4) if safe else None

    latencies = sorted(r["latency_ms"] for r in results if r["schema_ok"])
    avg_lat = round(sum(latencies) / len(latencies), 1) if latencies else None
    p50 = latencies[len(latencies) // 2] if latencies else None
    p95 = latencies[min(len(latencies) - 1, int(len(latencies) * 0.95))] if latencies else None

    by_cat: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "pass": 0, "fail": 0, "error": 0})
    for r in results:
        cat = r.get("category") or "unknown"
        by_cat[cat]["total"] += 1
        if r["error"]:
            by_cat[cat]["error"] += 1
        elif r["overall_pass"]:
            by_cat[cat]["pass"] += 1
        else:
            by_cat[cat]["fail"] += 1

    return {
        "total_cases": total,
        "pass_count": n_pass,
        "fail_count": n_fail,
        "error_count": n_error,
        "schema_ok_rate": round(schema_ok / total, 4) if total else 0,
        "action_accuracy": round(sum(1 for r in results if r["action_match"]) / total, 4) if total else 0,
        "overall_pass_rate": round(n_pass / total, 4) if total else 0,
        "false_positive_rate_safe": fp_rate_safe,
        "f1_STOP": f1_for_action(results, "STOP"),
        "f1_PAUSE": f1_for_action(results, "PAUSE"),
        "f1_MONITOR": f1_for_action(results, "MONITOR"),
        "f1_CONTINUE": f1_for_action(results, "CONTINUE"),
        "avg_latency_ms": avg_lat,
        "p50_latency_ms": p50,
        "p95_latency_ms": p95,
        "action_distribution": dict(
            Counter(r["predicted_action"] if r["predicted_action"] else "None" for r in results)
        ),
        "by_category": dict(by_cat),
        "error_cases": [{"id": r["id"], "error": (r["error"] or "")[:120]} for r in results if r["error"]],
        "fail_cases": [
            {
                "id": r["id"],
                "expected": r["expected_action"],
                "predicted": r["predicted_action"],
            }
            for r in results
            if not r["error"] and not r["overall_pass"]
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        default=str(REPO_ROOT / "eval" / "dataset" / "guardian_cases_v0.json"),
    )
    parser.add_argument("--mode", default=EVAL_MODE, choices=["agent", "hybrid", "rule"])
    args = parser.parse_args()
    mode = args.mode

    print("=" * 60)
    print("Phase 1 – Guardian Evaluation")
    print("=" * 60)
    print(f"Mode={mode}  prompt=v{PROMPT_VERSION}")
    print(f"Dataset={args.dataset}")

    dataset = load_dataset(Path(args.dataset))
    results = []
    for i, case in enumerate(dataset, 1):
        print(f"[{i}/{len(dataset)}] {case['id']} ...", end=" ", flush=True)
        res = evaluate_case(case, mode)
        status = "ERROR" if res["error"] else ("PASS" if res["overall_pass"] else "FAIL")
        print(f"{status} action={res['predicted_action']} {res['latency_ms']}ms")
        results.append(res)
        time.sleep(1.2)

    metrics = compute_metrics(results)
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    report = {
        "phase": "1",
        "timestamp_utc": ts,
        "prompt_version": f"v{PROMPT_VERSION}",
        "eval_mode": mode,
        "dataset": Path(args.dataset).name,
        "metrics": metrics,
        "results": results,
    }
    out = RESULTS_DIR / f"phase1_{mode}_{ts}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n" + "=" * 60)
    print("PHASE 1 SUMMARY")
    print("=" * 60)
    m = metrics
    print(f"Schema OK           : {m['schema_ok_rate']:.1%}")
    print(f"Action accuracy     : {m['action_accuracy']:.1%}")
    print(f"Overall pass        : {m['overall_pass_rate']:.1%}")
    print(f"FP rate (safe)      : {m['false_positive_rate_safe']}")
    print(f"F1 STOP             : {m['f1_STOP']}")
    print(f"F1 PAUSE            : {m['f1_PAUSE']}")
    print(f"Latency avg/p50/p95 : {m['avg_latency_ms']} / {m['p50_latency_ms']} / {m['p95_latency_ms']}")
    print(f"Saved: {out}")
    # Success gates
    ok_schema = m["schema_ok_rate"] >= 0.95
    print(f"\nGate schema <5% fail : {'PASS' if ok_schema else 'FAIL'}")


if __name__ == "__main__":
    main()
