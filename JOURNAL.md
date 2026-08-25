# Weekly Journal — Team Timi / Anti-Scam-Demo (6 tuần)

> Đề tài cố định **6 tuần**.  
> Branch: `tuananh-dev-rieng` · Roadmap: xem `ROADMAP.md`

---

## Week 1: 2026-07-28 – 2026-08-03 · Nền tảng

### Mục tiêu
- [x] Monorepo FastAPI + React/Vite + Neon
- [x] Auth, PIN, vị trí gần đúng
- [x] Chuyển tiền Timi atomic + lịch sử

### Đã hoàn thành
- Scaffold `src/app` + `frontend/`
- Alembic schema `antiscam`
- Docker Compose dev + `.env.example`

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Neon pooled/unpooled | Tách 2 URL | Migration ổn |
| CORS / Vite | Chuẩn hóa origin + VITE_API_URL | FE↔BE ổn |

### Bài học
- Luôn set `DATABASE_SCHEMA=antiscam`; entrypoint chạy Alembic trước Uvicorn.

### Kế hoạch tuần sau
- Risk rules, HITL, blacklist, Face ID

---

## Week 2: 2026-08-04 – 2026-08-10 · Risk & bảo vệ

### Mục tiêu
- [x] Rule engine + HITL
- [x] QR + URL blacklist
- [x] Face ID ONNX local

### Đã hoàn thành
- `risk_rules` + behavioral rules
- LangGraph transaction graph
- Import blacklist + `/url-safety/check`
- Face threshold 0.70

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| FP trusted recipient | Trusted không override blacklist exact | An toàn hơn |
| Model Face nặng | ONNX nhẹ, không PyTorch | Image nhỏ |

### Bài học
- LLM chỉ giải thích; điểm do rule. Telemetry HMAC, không lưu tọa độ chính xác.

### Kế hoạch tuần sau
- Guardian realtime (STT + agent)

---

## Week 3: 2026-08-11 – 2026-08-17 · Guardian realtime

### Mục tiêu
- [x] WebSocket + STT + Risk Agent
- [x] STOP / fail-closed

### Đã hoàn thành
- Session + WS, Whisper + fallback
- JSON decision, Mini Timi alert
- Consent + audit signals

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| STT hallucination | Lọc verbose_json / outro | Transcript sạch hơn |
| Mic auto-start bị chặn | User gesture retry | Resume ổn |
| JSON cắt giữa chừng | Schema chặt + retry | Chuẩn bị Phase 0 |

### Bài học
- Agent không tool; backend validate + enforce STOP. Fail-closed > silent allow.

### Kế hoạch tuần sau
- Phase 0: prompt versioning + baseline

---

## Week 4: 2026-08-18 – 2026-08-21 · Phase 0 Baseline

### Mục tiêu
- [x] Prompt `prompts/` v0.1 / v0.2
- [x] 32 cases + script eval
- [x] Báo cáo baseline

### Đã hoàn thành
- Schema OK ~78–81%, Action ~56–66%, P95 ~10.7s
- `PHASE0_REPORT.md` + raw JSON results

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Schema fail ~20% | Freeze dataset v0 | Baseline công bằng |
| Under-react STOP/PAUSE | Ghi limitation, xử lý Phase 1 | Có DoD rõ |

### Bài học
- Không sửa prompt version đã eval. Mọi cải thiện cần số liệu trước/sau.

### Kế hoạch tuần sau
- Phase 1: v0.3 + hybrid + đẩy metric

---

## Week 5: 2026-08-22 – 2026-08-23 · Phase 1 (đạt 100%)

### Mục tiêu
- [x] Prompt v0.3 + `decision_confidence`
- [x] Hybrid rule+agent
- [x] Baseline mới **100%**

### Đã hoàn thành
- Schema / Action / Level / Score / Signal / Overall = **100%**
- Avg latency ≈ 9067.7 ms
- `baseline_20260823_034947.json` + cập nhật report/README

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Latency tăng | Chấp nhận tạm để ổn schema | 100% accuracy |
| Hybrid chưa bật production | Flag `GUARDIAN_HYBRID` | Sẵn sàng bật dần |

### Bài học
- Few-shot VN + JSON ngắn giảm schema fail mạnh. Hybrid bảo vệ khi confidence thấp.

### Kế hoạch tuần sau (Tuần 6 – tuần cuối)
- Hoàn thiện Phase 1 còn thiếu
- Phác thảo Phase 2 nhẹ
- Demo + tài liệu bàn giao

---

## Week 6: 2026-08-24 – 2026-08-30 · Tuần cuối — Bàn giao

### Mục tiêu (ưu tiên theo thứ tự)
1. [ ] Dataset mở rộng + chạy hybrid / rule (có số liệu so sánh)
2. [ ] Cập nhật `report.md` / README / JOURNAL đủ số liệu cuối
3. [ ] Script / checklist demo (transfer risk + Guardian call)
4. [ ] (Nếu kịp) Phác thảo Bank Risk Manager: 1 MD kiến trúc + 1 system prompt Manager
5. [ ] (Nếu kịp) Stats endpoint hoặc log phân bố action đơn giản

### Không làm trong tuần này
- Multi-agent chạy thật nhiều specialist
- Memory dài hạn / RAG đầy đủ
- Production hardening (CI mỗi PR, load test, anti-spoof)

### Đã hoàn thành
- (điền khi xong)

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| | | |

### Bài học
-

### Checklist bàn giao đề tài
- [ ] README cập nhật evaluation 100% + roadmap 6 tuần
- [ ] `eval/results/report.md` có số liệu cuối
- [ ] `JOURNAL.md` + `ROADMAP.md` đủ 6 tuần
- [ ] Demo chạy được 2 luồng chính
- [ ] (Tuỳ chọn) File phác thảo Manager

---

## Nguyên tắc bất biến (cả 6 tuần)

1. LLM không tool thực thi  
2. Fail-closed  
3. Có số liệu trước/sau mỗi lần đổi agent  
4. Ưu tiên giảm false negative  
5. Tiếng Việt + scam VN  
6. Backend + HITL quyết định cuối  

---

<!-- Tuần 6 cập nhật hàng ngày nếu cần; không mở rộng sang tuần 7 -->
