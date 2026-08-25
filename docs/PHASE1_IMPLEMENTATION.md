# Phase 1 Implementation Guide – Anti-Scam Guardian

**Goal:** Schema fail < 5%, better F1 on STOP/PAUSE, lower FP on safe calls, hybrid rule+agent ready for Manager (Phase 2 nhẹ trong tuần 6).

**Khung đề tài:** 6 tuần · Phase 1 gắn **Tuần 5–6**.

---

## Baseline đã vượt

### Phase 0 (≈ 2026-08-21, prompt v0.2)

| Metric | Giá trị tham chiếu |
|--------|---------------------|
| Schema OK | ~78–81% (một số run ghi 68.8%) |
| Action accuracy | ~53–66% |
| Overall pass | ~53–66% |
| P95 latency | ~10.6–10.7 s |

### Phase 1 latest (2026-08-23)

| Metric | Value | vs target |
|--------|-------|-----------|
| Total cases | 32 | — |
| Schema OK rate | **100.0%** | Target ≥ 95% ✅ |
| Availability rate | **100.0%** | ✅ |
| Action accuracy | **100.0%** | ✅ |
| Level accuracy | **100.0%** | ✅ |
| Score in range | **100.0%** | ✅ |
| Signal check rate | **100.0%** | ✅ |
| Overall pass rate | **100.0%** | ✅ |
| Resolved action acc. | **100.0%** | ✅ |
| Avg latency | **9067.7 ms** | ⚠️ còn cao |
| Source | `eval/results/baseline_20260823_034947.json` | |

**Kết luận:** Phần chất lượng quyết định + schema của Phase 1 **đã đạt / vượt**. Việc còn lại: hybrid/rule so sánh đầy đủ, dataset mở rộng, stats, tối ưu latency nhẹ, tài liệu bàn giao.

---

## Deliverables

| Path | Purpose | Status |
|------|---------|--------|
| `prompts/guardian_v0.3.yaml` | Prompt Phase 1: shorter JSON, few-shot VN, `decision_confidence` | ✅ |
| `prompts/README.md` | Thêm hàng v0.3; **không sửa** v0.1/v0.2 | ✅ / kiểm tra |
| `src/app/services/scam_guardian_hybrid.py` | Hybrid merge rule + agent | ✅ (module) |
| Agent harden (tokens 900, JSON retry, context) | Patch agent | ✅ (theo baseline 100%) |
| Schema `decision_confidence` | Field bắt buộc | ✅ |
| `tests/test_guardian_normalize.py` | Unit normalize + hybrid + rules | ⏳ Xác nhận pass |
| `eval/scripts/run_phase1_eval.py` | Eval agent / hybrid / rule + F1 | ⏳ |
| `eval/dataset/guardian_cases_v1_extra.json` | Case bổ sung | ⏳ / có file |
| `src/api/guardian_stats.py` | `/api/v1/guardian/stats/*` | ⏳ |
| Wire `GUARDIAN_HYBRID=true` trên WebSocket path | Production hybrid | ⏳ bật có kiểm soát |

---

## Checklist đã làm (Tuần 5)

### Prompt + schema + agent harden

- [x] `prompts/guardian_v0.3.yaml` trong repo
- [x] Không edit v0.1 / v0.2 sau khi dùng eval
- [x] `decision_confidence` trong schema quyết định
- [x] `max_completion_tokens` tăng (≈ 900), JSON retry, context gọn
- [x] Smoke / baseline:
  ```bash
  export GUARDIAN_PROMPT_VERSION=0.3
  export GROQ_API_KEY=...
  python eval/scripts/run_baseline_eval.py
  ```
  → **Schema OK 100%**, action/level/signal **100%**

### Hybrid (code)

- [x] Module `scam_guardian_hybrid.py` (merge policy: confidence < 0.55 → floor PAUSE khi rule thấy risk; max severity khi bất đồng)
- [ ] Wire production WebSocket gọi `analyze_hybrid` khi `GUARDIAN_HYBRID=true`
- [ ] `record_guardian_event(...)` trên mỗi decision
- [x] `pytest tests/test_guardian_normalize.py -q` → pass

---

## Checklist còn lại (Tuần 6 – bàn giao)

### Eval framework

```bash
# Merge v0 + extra → v1 (nếu chưa có file merged)
python -c "
import json
from pathlib import Path
base = json.loads(Path('eval/dataset/guardian_cases_v0.json').read_text(encoding='utf-8'))
extra_path = Path('eval/dataset/guardian_cases_v1_extra.json')
extra = json.loads(extra_path.read_text(encoding='utf-8')) if extra_path.exists() else []
ids = {c['id'] for c in base}
merged = base + [c for c in extra if c['id'] not in ids]
Path('eval/dataset/guardian_cases_v1.json').write_text(
    json.dumps(merged, ensure_ascii=False, indent=2), encoding='utf-8')
print(len(merged), 'cases')
"

export GUARDIAN_PROMPT_VERSION=0.3
python eval/scripts/run_phase1_eval.py --dataset eval/dataset/guardian_cases_v1.json --mode hybrid
python eval/scripts/run_phase1_eval.py --dataset eval/dataset/guardian_cases_v1.json --mode agent
python eval/scripts/run_phase1_eval.py --dataset eval/dataset/guardian_cases_v1.json --mode rule
```

- [ ] Có số liệu **agent vs hybrid vs rule** (dù dataset vẫn ~32–50 case)
- [ ] Mở rộng case thêm nếu kịp (progressive / adversarial / safe) — mục tiêu lý tưởng 100+, thực tế đề tài: **càng nhiều càng tốt**
- [ ] Cập nhật `eval/results/report.md` với bảng so sánh mode

### Observability (tối thiểu)

- [ ] Stats in-memory hoặc endpoint `GET /api/v1/guardian/stats/summary` **hoặc** log rõ: latency, action, source, confidence, schema_ok
- [ ] Không bắt buộc DB-backed metrics trong 6 tuần

### Confidence & hybrid production

- [ ] `decision_confidence` luôn có trong JSON agent
- [ ] Hybrid floor PAUSE khi `confidence < 0.55` và rule có risk
- [ ] Flag:
  ```bash
  GUARDIAN_PROMPT_VERSION=0.3
  GUARDIAN_HYBRID=true          # bật khi đã wire path
  GUARDIAN_EVAL_MODE=hybrid     # chỉ eval script
  GROQ_API_KEY=...
  ```

### Latency (nice-to-have tuần 6)

- [ ] Ghi P50/P95 nếu script hỗ trợ
- [ ] Thử giảm context / model nhanh hơn **không** làm tụt schema/action dưới 95%

---

## Success metrics (Definition of Done Phase 1)

| Metric | Target | Actual (23/08) | Status |
|--------|--------|----------------|--------|
| Schema fail rate | < 5% (OK ≥ 95%) | **0%** | ✅ |
| Action / overall accuracy | Cao rõ vs Phase 0 | **100%** | ✅ |
| FP on category `safe` | Giảm | 0 fail trên baseline | ✅ |
| F1 STOP / PAUSE (theo mode) | Có số liệu hybrid/rule | ⏳ | ⏳ |
| Eval modes agent / hybrid / rule | Chạy được | Một phần | ⏳ |
| Unit tests normalize + hybrid | Pass | ⏳ | ⏳ |
| Stats / logging decision | Có | ⏳ | ⏳ |
| Avg latency | Theo dõi / giảm nếu kịp | ~9.1 s | ⚠️ |

**Phase 1 được coi là “đạt mục tiêu chất lượng”** khi các dòng ✅ giữ vững; các dòng ⏳ là hoàn thiện bàn giao tuần 6.

---

## Out of scope Phase 1 (sau đề tài / Phase 2+)

- Hierarchical Multi-Agent / Bank Risk Manager đầy đủ
- Long-term memory across sessions
- RAG scam patterns production
- Production DB-backed metrics
- CI eval mỗi PR, load test, anti-spoof Face ID

Tuần 6 chỉ **phác thảo** Manager (1 MD + prompt) nếu còn thời gian — xem `ROADMAP.md`.

---

## Suggested git commits (tham chiếu)

```text
1. feat(phase1): guardian prompt v0.3 + decision_confidence schema
2. feat(phase1): agent max_tokens/retry/smart context
3. feat(phase1): hybrid rule+agent merge
4. test(phase1): normalize + hybrid unit tests
5. feat(phase1): eval framework + cases v1 extra
6. feat(phase1): guardian stats / decision logging
7. docs(phase1): PHASE1_IMPLEMENTATION + report 100% baseline
```

---

## Liên kết

| File | Nội dung |
|------|----------|
| `docs/PHASE0_REPORT.md` | Baseline Phase 0 |
| `eval/results/report.md` | Metrics mới nhất |
| `eval/results/baseline_20260823_034947.json` | Raw run 100% |
| `eval/golden/README.md` | Golden multi-suite |
| `prompts/README.md` | Versioned prompts |
| `ROADMAP.md` / `JOURNAL.md` | Lịch 6 tuần |
| Root `README.md` | Evaluation + env flags |
