
---

### 2. `docs/PHASE0_REPORT.md` → cập nhật thành báo cáo baseline mới nhất  
(hoặc đổi tên thành `docs/BASELINE_REPORT.md` / giữ Phase 0 và thêm section “Latest”)

```markdown
# Guardian Agent – Baseline Report (Latest)

**Date:** 2026-08-23  
**Branch:** `tuananh-dev-rieng`  
**Run file:** `eval/results/baseline_20260823_034947.json`  
**Total cases:** 32  

## Metrics

| Metric | Value |
|--------|-------|
| Schema OK rate | **100.0%** |
| Availability rate | **100.0%** |
| Action accuracy | **100.0%** |
| Level accuracy | **100.0%** |
| Score in range rate | **100.0%** |
| Signal check rate | **100.0%** |
| Overall pass rate | **100.0%** |
| Resolved action accuracy | **100.0%** |
| Avg latency | **9067.7 ms** |

## Nhận xét

- Schema và toàn bộ accuracy đạt tuyệt đối → đã vượt mục tiêu Phase 1 về chất lượng quyết định.
- Latency trung bình ~9.1s vẫn cao; cần đo P50/P95 và tối ưu (model, max_tokens, context length, caching).
- Nên chạy thêm mode `hybrid` và `rule` để so sánh nguồn quyết định.

## Lịch sử tham chiếu (Phase 0 cũ)

| Metric | ~21/08 (v0.2) |
|--------|----------------|
| Schema OK | 78–81% |
| Action accuracy | 56–66% |
| Overall pass | 53–66% |
| Avg / P95 latency | ~3.9–6.6 s / ~10.7 s |