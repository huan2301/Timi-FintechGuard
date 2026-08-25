# Roadmap 6 tuần — Anti-Scam-Demo → Bank Risk Manager (MVP)

**Khung thời gian:** 6 tuần  
**Mục tiêu cuối:** Demo đầy đủ + Guardian/Hybrid ổn định + phác thảo Bank Risk Manager (không cần production-ready đầy đủ).

**Repo:** `ngovan15121977-bit/Anti-Scam-Demo` · Branch: `tuananh-dev-rieng`

---

## Tổng quan 6 tuần

| Tuần | Phase | Mục tiêu chính | Trạng thái |
|------|-------|----------------|------------|
| 1 | Nền tảng | Auth, transfer Timi, PIN, location | ✅ |
| 2 | Risk & bảo vệ | Rule engine, HITL, blacklist QR, Face ID | ✅ |
| 3 | Guardian realtime | STT + WebSocket + Risk Agent cơ bản | ✅ |
| 4 | **Phase 0** | Prompt versioning + baseline 32 cases | ✅ |
| 5 | **Phase 1** | Prompt v0.3 + Hybrid + **100% metrics** | ✅ Metric đạt |
| 6 | **Phase 1 hoàn thiện + Phase 2 nhẹ** | Dataset mở rộng, stats, phác thảo Manager, demo | ⏳ Đang làm |

---

## Chi tiết từng tuần

### Tuần 1 — Nền tảng sản phẩm ✅
- Monorepo FastAPI + React/Vite + Neon
- Auth JWT, PIN hash, bắt buộc vị trí gần đúng
- Chuyển tiền nội bộ atomic + lịch sử

### Tuần 2 — Risk deterministic + Face ID ✅
- Rule engine (blacklist, amount, velocity, keywords)
- HITL medium/high
- QR + URL blacklist
- Face ID local ONNX (YuNet + SFace)

### Tuần 3 — Scam Call Guardian realtime ✅
- WebSocket + MediaRecorder chunk có voice
- Groq Whisper STT + browser fallback
- Guardian Agent JSON (score, level, signals, action)
- Fail-closed, STOP chặn giao dịch

### Tuần 4 — Phase 0: Baseline ✅
- Tách prompt → `prompts/` (v0.1, v0.2)
- Dataset 32 cases + script eval
- Baseline: Schema ~78–81%, Action ~56–66%
- Báo cáo `PHASE0_REPORT.md`

### Tuần 5 — Phase 1: Agent ổn định + Hybrid ✅ (metric)
- Prompt v0.3 (few-shot VN, `decision_confidence`)
- Hybrid rule + agent
- Baseline mới **100%** schema / action / level / signal
- Latency ~9.1s (còn tối ưu nhẹ)

### Tuần 6 — Hoàn thiện Phase 1 + phác thảo Phase 2 + Demo ⏳
**Bắt buộc bàn giao:**
- [ ] Mở rộng dataset (càng nhiều càng tốt, mục tiêu ≥ 50–100 nếu kịp)
- [ ] Chạy mode hybrid + rule, ghi F1 / so sánh
- [ ] Stats endpoint cơ bản hoặc ít nhất log phân bố action
- [ ] Cập nhật README / report / JOURNAL đủ số liệu
- [ ] Script demo end-to-end (transfer risk + Guardian call)

**Phase 2 nhẹ (nếu còn thời gian):**
- [ ] Phác thảo kiến trúc Bank Risk Manager (1 file MD + schema JSON)
- [ ] System prompt Manager (tư duy quản lý, không thực thi)
- [ ] Mock 1 vòng: Manager nhận tóm tắt từ Guardian + Transaction → đưa khuyến nghị

**Không bắt buộc trong 6 tuần:** Memory dài hạn, RAG đầy đủ, multi-agent chạy production, anti-spoof Face ID, CI eval mỗi PR.

---

## Metric thành công cuối đề tài (Tuần 6)

| Hạng mục | Target tối thiểu |
|----------|------------------|
| Schema OK (Guardian) | ≥ 95% (hiện **100%**) |
| Action accuracy overall | Cao rõ so baseline Phase 0 (hiện **100%**) |
| Hybrid chạy được | Có số liệu agent vs hybrid vs rule |
| Tài liệu | README + report + JOURNAL + ROADMAP đầy đủ |
| Demo | 1 luồng transfer risk + 1 luồng Guardian call |

---

## Nguyên tắc bất biến (giữ suốt 6 tuần)

1. LLM **không** có tool thực thi (transfer, khóa TK, sửa DB)
2. Fail-closed luôn giữ
3. Mọi đổi agent có số liệu trước/sau
4. Ưu tiên giảm false negative
5. Tiếng Việt + kịch bản scam VN là trọng tâm
6. Backend + HITL là quyền lực cuối

---

## Sau đề tài (nếu tiếp tục)

- Phase 2 đầy đủ: Hierarchical Multi-Agent thật
- Phase 3: Memory + Feedback + RAG
- Phase 4: Production-ready (CI, monitoring, load test, anti-spoof)
