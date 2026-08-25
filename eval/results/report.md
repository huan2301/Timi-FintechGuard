# Evaluation Report – Anti-Scam Guardian

> Báo cáo đánh giá chất lượng Guardian Risk Agent.  
> **Branch:** `tuananh-dev-rieng`  
> **Last updated:** 2026-08-23  
> **Source run:** `baseline_20260823_034947.json`

---

## 1. Latest Baseline Summary (2026-08-23)

| Metric | Value | Status |
|--------|-------|--------|
| Total cases | 32 | — |
| Schema OK rate | **100.0%** | ✅ |
| Availability rate | **100.0%** | ✅ |
| Action accuracy | **100.0%** | ✅ |
| Level accuracy | **100.0%** | ✅ |
| Score in range rate | **100.0%** | ✅ |
| Signal check rate | **100.0%** | ✅ |
| Overall pass rate | **100.0%** | ✅ |
| Resolved action accuracy | **100.0%** | ✅ |
| Avg latency | **9067.7 ms** | ⚠️ còn cao |

**Kết luận:** Đạt 100% trên toàn bộ metric chất lượng quyết định và schema. Latency trung bình ~9.1s vẫn là điểm cần tối ưu (Tuần 6 / sau đề tài).

---

## 2. So sánh với Phase 0 baseline

| Metric | Phase 0 (v0.2, ~21/08) | Latest (23/08) | Delta |
|--------|------------------------|----------------|-------|
| Schema OK | ~78–81% | **100%** | +19–22 pp |
| Action accuracy | ~56–66% | **100%** | +34–44 pp |
| Overall pass | ~53–66% | **100%** | +34–47 pp |
| Avg latency | ~3.9–6.6 s | ~9.1 s | tăng (trade-off ổn định schema) |

---

## 3. Phase 1 Success Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Schema fail rate | < 5% (OK ≥ 95%) | **0%** | ✅ |
| Action / Level / Score / Signal | Cải thiện rõ | **100%** | ✅ |
| FP on category `safe` | Giảm | 0 fail | ✅ |
| Eval modes agent / hybrid / rule | Chạy được | Một phần | ⏳ |
| Unit tests normalize + hybrid | Pass | Cần xác nhận | ⏳ |
| Stats / decision logging | Có | Cần xác nhận | ⏳ |

---

## 4. Manual & Golden

- Manual UI: `eval/manual_cases.md`
- Golden multi-suite: `eval/golden/` (transaction `tx-001`…`tx-009`)
- Dataset agent: `eval/dataset/guardian_cases_v0.json` (32 cases)

---

## 5. Action Items (Tuần 6)

- [x] Schema ổn định 100%
- [x] Action / Level / Score / Signal 100%
- [ ] Số liệu mode hybrid + rule
- [ ] Mở rộng dataset nếu kịp
- [ ] Cập nhật README root section Evaluation
- [ ] Demo 2 luồng: transfer risk + Guardian call

---

## 6. Lệnh chạy lại

```bash
export GUARDIAN_PROMPT_VERSION=0.3
export GROQ_API_KEY=...
python eval/scripts/run_baseline_eval.py
python eval/scripts/run_phase1_eval.py --mode hybrid
python eval/scripts/run_phase1_eval.py --mode agent
python eval/scripts/run_phase1_eval.py --mode rule
python eval/runners/validate_schema.py
```
