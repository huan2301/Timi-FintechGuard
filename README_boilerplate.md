# Timi — FIN-19: AI Agent Chống Lừa Đảo & Cảnh Báo Giao Dịch Rủi Ro

> Tóm tắt 1 câu: Người dùng ví điện tử/ngân hàng bị lừa chuyển tiền bởi các kịch bản scam tinh vi và cuộc gọi mạo danh → AI Agent (rule-based + LLM + LangGraph) chấm điểm rủi ro và cảnh báo theo thời gian thực, có Human-in-the-Loop, cho người dùng ví điện tử/ngân hàng số và đội vận hành/CSKH.

## Vấn đề (Problem)

- **Ai đang gặp vấn đề?** Người dùng ví điện tử/ngân hàng số, đặc biệt là người lớn tuổi hoặc ít kiến thức bảo mật, dễ bị lừa chuyển tiền qua các kịch bản giả mạo người quen, giả danh nhân viên ngân hàng/công an, gửi link giả hoặc gọi điện thao túng tâm lý ngay trong lúc thực hiện giao dịch.
- **Vấn đề tốn bao nhiêu thời gian/tiền?** Lừa đảo chuyển khoản gây thiệt hại tài chính trực tiếp cho nạn nhân, đồng thời làm tăng chi phí xử lý khiếu nại/hoàn tiền cho doanh nghiệp ví điện tử/ngân hàng và ảnh hưởng tiêu cực đến uy tín thương hiệu.
- **Tại sao các giải pháp hiện tại chưa đủ?** Cảnh báo giao dịch hiện tại thường tĩnh, chung chung, không phân tích ngữ cảnh theo thời gian thực (nội dung hội thoại, tốc độ giao dịch, thiết bị lạ...), nên người dùng dễ bỏ qua; đồng thời phần lớn hệ thống chưa giám sát được rủi ro phát sinh ngay trong cuộc gọi lừa đảo trước khi lệnh chuyển tiền được tạo ra.

## Giải pháp (Solution)

Sản phẩm là ứng dụng ngân hàng số mô phỏng (Timi) tích hợp AI Agent chấm điểm rủi ro và giám sát cuộc gọi theo thời gian thực:

- **Feature 1 — Risk Agent cho giao dịch (LangGraph):** Điều phối guard input → thu thập bằng chứng → chấm điểm → giải thích. Risk score/level do rule engine và dữ liệu (blacklist, số tiền bất thường, tốc độ giao dịch, thiết bị/IP lạ, từ khóa đáng ngờ, lịch sử) quyết định; LLM chỉ giải thích, không được tự đổi điểm hay chuyển tiền. Cảnh báo rủi ro trung bình/cao bắt buộc đi qua xác nhận của người dùng (Human-in-the-Loop).
- **Feature 2 — Scam Call Guardian realtime:** Chạy nền sau khi đăng nhập, dùng WebSocket + STT (Groq Whisper, fallback SpeechRecognition trình duyệt) để lấy transcript cuộc gọi, gửi cho Guardian Risk Agent (Groq) chấm `risk_score`, tín hiệu (mạo danh ngân hàng, dọa khóa tài khoản, đòi OTP, ép giữ bí mật với người khác...) và `recommended_action` (`CONTINUE`/`MONITOR`/`PAUSE`/`STOP`). Hệ thống fail-closed khi agent/STT lỗi liên tiếp, và chặn giao dịch khi phát hiện `STOP`.
- **Feature 3 — QR & URL safety:** Quét QR bằng camera/ảnh, tự đối chiếu hostname với danh sách URL/domain scam (import từ CSV/TXT/JSON), chặn truy cập nếu nằm trong blacklist hoặc khi dịch vụ an toàn không khả dụng.
- **Feature 4 — Admin Dashboard & Timi Assistant:** Trang quản trị cho CSKH quản lý blacklist, report và audit log; trợ lý Timi Chibi chỉ hỗ trợ giải thích trong phạm vi tính năng, không có quyền duyệt giao dịch hay đổi số dư.
- **Ràng buộc bắt buộc:** Human-in-the-Loop tuyệt đối (AI không tự chặn/hủy giao dịch trừ rào chắn an toàn `STOP` của Guardian), minh bạch (mọi cảnh báo có lý do giải thích rõ ràng, không hộp đen), và tuân thủ PDPA (ẩn danh hóa dữ liệu demo, hạn chế lưu trữ dữ liệu nhạy cảm).

## Target User

- **Primary:** Người dùng cuối sử dụng ví điện tử/ngân hàng số để chuyển tiền, bao gồm nhóm người dùng phổ thông (ít kiến thức bảo mật) và người dùng lớn tuổi (dễ bị thao túng tâm lý qua điện thoại).
- **Secondary:** Đội vận hành/CSKH (quản lý blacklist, cập nhật kịch bản lừa đảo) và ban quản trị doanh nghiệp/sponsor (theo dõi hiệu quả cảnh báo, bằng chứng tuân thủ pháp lý).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Agent | LangGraph + LangChain + Groq (Guardian Risk Agent, Whisper STT) / OpenAI (giải thích transaction, tuỳ chọn) |
| Backend | FastAPI + Python 3.11+, SQLAlchemy + Alembic, JWT auth (python-jose, passlib) |
| Frontend | React 18 + TypeScript + Vite, TailwindCSS, Zustand, TanStack Query |
| Database | PostgreSQL (Neon), pgvector cho vector store |
| Face ID | OpenCV Zoo SFace + YuNet (ONNX, chạy local, không dùng Hugging Face/PyTorch) |
| DevOps | Docker (multi-stage) + docker-compose (dev/prod), Nginx reverse proxy, Render deploy |

## Quick Start

```bash
# 1. Clone repo
git clone https://github.com/ngovan15121977-bit/Anti-Scam-Demo.git
cd Anti-Scam-Demo

# 2. Setup environment
cp .env.example .env
# Chỉnh DATABASE_URL, DATABASE_SCHEMA, JWT_SECRET_KEY và GROQ_API_KEY

# 3. Install dependencies (backend)
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 4. Chạy migration và khởi động backend
python -m alembic upgrade head
python -m uvicorn src.main:app --reload

# 5. Cài đặt và chạy frontend (terminal khác)
cd frontend
npm ci
npm run dev
```

- API root: http://localhost:8000/ · Swagger: http://localhost:8000/docs
- Frontend: http://localhost:5173

## Project Structure

```
├── src/
│   ├── agents/            # LangGraph transaction/intervention graph
│   ├── app/
│   │   ├── api/            # Auth, transaction, admin, URL safety, assistant, scam-guardian
│   │   ├── services/       # Risk rules, Timi ledger, Face ID, blacklist, audit
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic request/response schemas
│   │   └── main.py         # FastAPI app canonical
│   └── main.py             # Entrypoint Uvicorn
├── frontend/src/            # React pages, stores, API clients, components
├── alembic/versions/        # Database migrations
├── models/face/              # ONNX face detection/recognition models
├── prompts/                  # Guardian agent prompt versions (guardian_v0.x.yaml)
├── tests/                    # Unit/integration tests
├── eval/                     # Manual cases, golden dataset, kết quả đánh giá
├── presentation/              # Demo materials (pitch deck W2-1)
├── docs/                      # Tài liệu kỹ thuật, architecture diagram
├── Gate_1/                    # Brief, PRD, UI Flow của giai đoạn Gate 1
├── Dockerfile, docker-compose*.yml
└── ARCHITECTURE.md            # Sơ đồ Mermaid và safety boundary
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health, /health/ready | Health/readiness check |
| POST | /api/v1/auth/register | Tạo tài khoản Timi (phone 10 chữ số) |
| POST | /api/v1/auth/login | Đăng nhập, nhận JWT |
| PUT | /api/v1/auth/face/enrollment | Enroll Face ID |
| POST | /api/v1/auth/face/verify | Verify Face ID |
| POST | /api/v1/transactions/assess | Đánh giá rủi ro trước khi chuyển tiền |
| POST | /api/v1/transactions/{id}/decision | Người dùng quyết định tiếp tục/hủy khi có cảnh báo |
| GET | /api/v1/transactions/history | Lịch sử giao dịch (cursor pagination) |
| POST | /api/v1/url-safety/check | Kiểm tra URL từ QR |
| POST | /api/v1/assistant/chat | Chat giới hạn phạm vi với Timi Assistant |
| POST | /api/v1/scam-guardian/sessions | Tạo phiên bảo vệ cuộc gọi nền |
| WS | /api/v1/scam-guardian/ws/{session_id} | Audio/transcript realtime và cập nhật risk |
| GET | /api/v1/admin/blacklist, /admin/scam-reports | Admin quản lý blacklist/report theo trang |

Swagger đầy đủ tại `/docs` khi chạy backend.

## Deliverables Checklist

- [x] Source Code (GitHub)
- [x] README.md
- [x] Architecture Diagram (`docs/architecture_diagram.md`, `ARCHITECTURE.md`)
- [x] AI Logs (auto-collected, `scripts/log_antigravity.py`, `scripts/ai_log_setup.py`)
- [ ] Live URL / Deploy
- [ ] Video Demo
- [x] Pitch Deck (`presentation/W2-1`)
- [x] Weekly Journal (`JOURNAL.md`)
- [x] Worklog (`WORKLOG.md`)
- [x] Evaluation Evidence (`eval/results/`, `eval/manual_cases.md`)

## Team

| Thành viên | Vai trò | Nhiệm vụ chính | Giai đoạn phụ trách |
|---|---|---|---|
| Huân | AI Engineer + ML Engineer | Thiết kế prompt, LangGraph state machine, tích hợp LLM + tool-calling; xây dựng và huấn luyện model chấm điểm rủi ro, đánh giá false positive/negative | MVP và Giai đoạn Nâng cao (nặng nhất toàn dự án) |
| Đạt | Backend Engineer + Data Engineer | FastAPI, pre-transaction hook, tích hợp PostgreSQL/pgvector; pipeline cập nhật blacklist, chuẩn hóa dữ liệu mô phỏng | Chuẩn bị & MVP |
| Tuấn Anh | Frontend Engineer + Product/UX Designer | Giao diện chuyển tiền + luồng cảnh báo tương tác; thiết kế nội dung cảnh báo dễ hiểu, tránh gây hoang mang | MVP và Đánh giá sau MVP |
| Tuấn Anh – Việt Anh | PM kiêm QA & đầu mối Compliance | Điều phối tiến độ, chạy bộ test case (mục 7), là đầu mối làm việc với Legal/Compliance ngoài team (tư vấn part-time) để rà soát PDPA và cơ chế "tạm giữ" | Kiểm thử toàn diện & rà soát pháp lý |

## An toàn và giới hạn

- Đây là demo/MVP nội bộ (FIN-19), không kết nối hệ thống thanh toán ngân hàng thật; Timi Bank chỉ ghi nợ/ghi có trong cùng cơ sở dữ liệu demo.
- Human-in-the-Loop bắt buộc: AI/LLM chỉ cố vấn và cảnh báo, không tự quyền chặn hoặc hủy giao dịch của người dùng (ngoại trừ rào chắn an toàn `STOP` của Guardian khi phát hiện rủi ro nghiêm trọng trong cuộc gọi).
- Mọi cảnh báo phải có lý do giải thích rõ ràng (Explainable AI), không dùng mô hình hộp đen.
- Tuân thủ PDPA: hạn chế lưu trữ dữ liệu nhạy cảm (face embedding, transcript cuộc gọi chỉ lưu khi có consent), pseudonymize IP/device bằng HMAC trước khi lưu.

## Tài liệu liên quan

- `ARCHITECTURE.md` — component/data flow và safety boundary.
- `Gate_1/Brief.md`, `Gate_1/PRD.md`, `Gate_1/UI_Flow.md` — brief, yêu cầu sản phẩm và luồng UI giai đoạn Gate 1.
- `SETUP.md` — hướng dẫn Docker/Neon chi tiết.
- `eval/manual_cases.md`, `eval/results/` — manual test case và kết quả đánh giá.
- `docs/` — tài liệu kỹ thuật theo chương, `docs/architecture_diagram.md`.
- `frontend/README.md` — ghi chú frontend.

## License

MIT