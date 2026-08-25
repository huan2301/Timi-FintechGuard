# Worklog — Team Timi / Anti-Scam-Demo

> Ghi công việc theo ngày. Chi tiết học / khó khăn / kế hoạch tuần: xem `JOURNAL.md` và `ROADMAP.md`.  
> Branch: `tuananh-dev-rieng` · Đề tài **6 tuần**

---

## 2026-07-28 – 2026-08-03 · Tuần 1 (gom theo tuần)

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Team | Scaffold monorepo FastAPI + React/Vite + Neon | ✅ Done | `src/app`, `frontend/`, Alembic `antiscam` | — |
| Team | Auth JWT, PIN hash, bắt buộc vị trí gần đúng | ✅ Done | Login/register + location gate | — |
| Team | Chuyển tiền Timi atomic + lịch sử cursor | ✅ Done | Ledger nội bộ | — |
| Team | Docker Compose dev + `.env.example` | ✅ Done | `docker-compose.dev.yml` | — |

**Tổng kết:** Nền tảng sản phẩm chạy local; FE↔BE CORS ổn.

---

## 2026-08-04 – 2026-08-10 · Tuần 2

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Team | Rule engine (blacklist, amount, velocity, keyword) | ✅ Done | `risk_rules` + behavioral | — |
| Team | HITL medium/high + LangGraph transaction | ✅ Done | Warning flow UI | — |
| Team | QR + URL blacklist import/check | ✅ Done | `/url-safety/check` | — |
| Team | Face ID ONNX local (YuNet + SFace) | ✅ Done | threshold 0.70, `models/face/` | — |

**Tổng kết:** Lớp risk deterministic + Face ID; trusted không override blacklist exact.

---

## 2026-08-11 – 2026-08-17 · Tuần 3

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Team | WebSocket Guardian session + MediaRecorder chunk | ✅ Done | MainLayout nền sau login | — |
| Team | Groq Whisper STT + browser fallback | ✅ Done | Lọc hallucination/outro | — |
| Team | Guardian Risk Agent JSON (score/level/signals/action) | ✅ Done | CONTINUE/MONITOR/PAUSE/STOP | — |
| Team | Fail-closed + STOP chặn GD; Mini Timi alert | ✅ Done | Safety boundary | — |

**Tổng kết:** Realtime Scam Call Guardian cơ bản; agent không tool, backend enforce STOP.

---

## 2026-08-18 – 2026-08-21 · Tuần 4 · Phase 0

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Team | Tách prompt → `prompts/` v0.1, v0.2 | ✅ Done | Versioned YAML | — |
| Team | Dataset 32 cases + script baseline eval | ✅ Done | `guardian_cases_v0.json` | — |
| Team | Chạy baseline Phase 0 | ✅ Done | Schema ~78–81%, Action ~56–66% | — |
| Team | Viết `docs/PHASE0_REPORT.md` | ✅ Done | Báo cáo baseline | — |

**Tổng kết:** Có số liệu trước khi đổi agent; freeze dataset v0.

---

## 2026-08-22 – 2026-08-23 · Tuần 5 · Phase 1

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Team | Prompt `guardian_v0.3.yaml` + few-shot VN + `decision_confidence` | ✅ Done | Default version 0.3 | — |
| Team | Agent harden: max_tokens ~900, JSON retry, context | ✅ Done | Schema ổn định | — |
| Team | Hybrid module `scam_guardian_hybrid.py` | ✅ Done | Flag `GUARDIAN_HYBRID` | — |
| Team | Baseline mới 32 cases | ✅ Done | **100%** schema/action/level/signal/overall | — |
| Team | Cập nhật report / README / JOURNAL / ROADMAP | ✅ Done | `baseline_20260823_034947.json` | — |

**Tổng kết:** Phase 1 đạt metric chất lượng 100%; latency ~9.1s còn tối ưu; hybrid chưa bật production đầy đủ.

---

## 2026-08-24 – 2026-08-30 · Tuần 6 · Bàn giao (điền tiếp khi làm)

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Team | Chạy eval mode hybrid + rule, ghi so sánh | 🔄 WIP | — | — |
| Team | Mở rộng dataset (nếu kịp) | 🔄 WIP | — | — |
| Team | Stats / log decision (tối thiểu) | 🔄 WIP | — | — |
| Team | Demo E2E: transfer risk + Guardian call | 🔄 WIP | — | — |
| Team | (Tuỳ chọn) Phác thảo Bank Risk Manager 1 MD | ⏳ | — | — |
| Team | Push nốt `eval/golden/README.md` đầy đủ | 🔄 WIP | — | — |

**Tổng kết ngày (cập nhật cuối tuần):** —

---

## Ghi chú nhanh (có thể điền theo member thật)

Thay `[Tên]` bằng tên thành viên khi phân công rõ. Ví dụ một ngày chi tiết:

```markdown
## 2026-08-23

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| A | Chạy baseline v0.3 | ✅ Done | 100% overall, avg 9067ms | 2h |
| B | Cập nhật report.md + README Evaluation | ✅ Done | PR docs | 1.5h |
| C | Wire hybrid flag trên WS | 🔄 WIP | Chưa bật prod | 2h |

**Tổng kết ngày:** Metric Phase 1 đạt; còn hybrid production + demo tuần 6.
```

---

## Liên kết

| File | Vai trò |
|------|---------|
| `JOURNAL.md` | Nhật ký tuần (mục tiêu, bài học, kế hoạch) |
| `ROADMAP.md` | Lịch 6 tuần + metric bàn giao |
| `eval/results/report.md` | Số liệu Guardian mới nhất |
| `docs/PHASE1_IMPLEMENTATION.md` | Checklist Phase 1 |
