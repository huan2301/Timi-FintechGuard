# Timi — FintechGuard Anti-Scam Demo

Timi là ứng dụng ngân hàng mô phỏng tập trung vào việc phát hiện và ngăn giao dịch có dấu hiệu lừa đảo. Người dùng có thể đăng ký, chuyển tiền nội bộ qua Timi Bank, quét/tạo QR demo, kiểm tra URL đáng ngờ, xác thực Face ID và xem lịch sử giao dịch.

Đây là MVP/demo nội bộ, không kết nối hệ thống thanh toán ngân hàng ngoài đời thực. Timi Bank chỉ ghi nợ tài khoản người gửi và ghi có tài khoản người nhận trong cùng cơ sở dữ liệu demo.

## Mục lục

- [Tính năng](#tính-năng)
- [Guardian Risk Agent & Phase roadmap](#guardian-risk-agent--phase-roadmap)
- [Evaluation](#evaluation)
- [Kiến trúc và cấu trúc mã nguồn](#kiến-trúc-và-cấu-trúc-mã-nguồn)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cấu hình biến môi trường](#cấu-hình-biến-môi-trường)
- [Chạy local không Docker](#chạy-local-không-docker)
- [Chạy bằng Docker](#chạy-bằng-docker)
- [Cơ sở dữ liệu và migration](#cơ-sở-dữ-liệu-và-migration)
- [Nạp URL blacklist](#nạp-url-blacklist)
- [Luồng sử dụng nhanh](#luồng-sử-dụng-nhanh)
- [API chính](#api-chính)
- [Kiểm thử](#kiểm-thử)
- [Troubleshooting](#troubleshooting)
- [Deploy](#deploy)
- [An toàn và giới hạn](#an-toàn-và-giới-hạn)
- [Tài liệu liên quan](#tài-liệu-liên-quan)

## Tính năng

### Người dùng

- Đăng ký/đăng nhập bằng email, mật khẩu và số điện thoại Timi 10 chữ số.
- Mỗi lần đăng nhập phải xác nhận vị trí gần đúng. Thiết bị mới còn phải nhập OTP gửi qua email; chỉ sau khi OTP và vị trí hợp lệ, phiên mới được kích hoạt và mọi token của thiết bị cũ bị thu hồi.
- Thiết lập PIN giao dịch; PIN chỉ được lưu dưới dạng hash.
- Đăng ký và xác thực khuôn mặt bằng OpenCV Zoo SFace + YuNet chạy local; ngưỡng mặc định hiện tại là 70%.
- Tài khoản Timi dùng số điện thoại làm số tài khoản.
- Chuyển tiền Timi nội bộ theo giao dịch nguyên tử: khóa hai tài khoản, kiểm tra số dư, ghi sổ và cập nhật transaction trong cùng DB transaction.
- Lịch sử giao dịch phân trang bằng cursor.

### QR và chống lừa đảo

- Quét QR bằng camera hoặc chọn ảnh QR từ máy.
- Nhận diện QR thanh toán demo và QR chứa đường dẫn HTTP/HTTPS.
- Tự kiểm tra hostname với URL blacklist; URL bị chặn hoặc khi dịch vụ an toàn không khả dụng sẽ không có nút truy cập.
- Tạo QR của tài khoản đang đăng nhập, chỉ nhập số tiền và nội dung.
- Import danh sách URL/domain scam từ CSV, TXT hoặc JSON; đối chiếu theo hostname nên các path khác nhau trên cùng domain vẫn bị chặn.

### Risk agent và quản trị

- LangGraph điều phối guard input → thu thập bằng chứng → chấm điểm → giải thích.
- Risk score/risk level do rule engine và bằng chứng dữ liệu quyết định; LLM không được quyền tự đổi điểm hoặc chuyển tiền.
- Tín hiệu gồm blacklist, số tiền bất thường, tốc độ giao dịch, thiết bị/IP bất thường, từ khóa đáng ngờ và lịch sử.
- Cảnh báo rủi ro trung bình/cao đi qua luồng xác nhận của người dùng (HITL).
- Report scam, admin quản lý blacklist/report/user/audit log và xem dữ liệu theo trang.
- Timi Chibi Assistant xuất hiện sau đăng nhập. Chat chỉ trả lời trong phạm vi tính năng Timi; key chỉ được dùng ở backend.

### Scam Call Guardian realtime

- Scam Guardian chạy ngầm trong MainLayout sau khi người dùng đăng nhập và chấp nhận quyền microphone; không cần mở một trang riêng.
- Một WebSocket giữ trong suốt phiên; microphone ưu tiên echo cancellation, khử nhiễu, auto gain và mono. VAD chỉ gửi đoạn có voice; một câu được chốt sau khoảng lặng ngắn (tối thiểu 1,1 giây, tối đa 5 giây) thay vì cắt cứng theo 3 giây. Recorder tự phục hồi nếu trình duyệt chuyển sang trạng thái inactive.
- Ưu tiên Groq Whisper server-side STT (`GUARDIAN_STT_ENABLED=true`, mặc định `whisper-large-v3`); metadata `verbose_json` và bộ lọc câu outro/quảng bá YouTube phổ biến được dùng để bỏ các đoạn im lặng/hallucination trước khi đưa vào risk engine. Nếu provider trả lỗi/rỗng, browser SpeechRecognition tự chuyển sang fallback khi trình duyệt hỗ trợ. Audio chunk chỉ tồn tại trong bộ nhớ xử lý và không được lưu.
- Backend chỉ giữ cửa sổ 12 lượt thoại gần nhất (xấp xỉ 15–30 giây) trong bộ nhớ để Agent nhận ra tổ hợp dấu hiệu theo ngữ cảnh, thay vì suy luận từ một từ khóa đơn lẻ. Agent tự quyết định `risk_score`, `risk_level`, danh sách tín hiệu, ngưỡng ngữ cảnh và `recommended_action` (`CONTINUE`, `MONITOR`, `PAUSE`, `STOP`) rồi trả về JSON có schema giới hạn (kèm `decision_confidence` từ Phase 1).
- Backend không tính lại ngưỡng và không để LLM gọi tool: backend chỉ validate/lưu quyết định, hiển thị cảnh báo và thực thi chặn giao dịch khi agent trả về `STOP`. Nếu agent/STT không khả dụng, hệ thống fail-closed bằng một quyết định tạm dừng rõ ràng để không bỏ lọt giao dịch nguy hiểm.
- Guardian agent có retry cho lỗi mạng/429/5xx; một lỗi đơn lẻ chỉ chuyển phiên sang `PAUSE` và không bật cảnh báo scam. Sau ba lỗi liên tiếp, backend chuyển sang `STOP` fail-closed và giữ chặn đến khi phiên gọi kết thúc.
- Mini Timi tự mở khung hội thoại và gửi cảnh báo có risk score, tín hiệu phát hiện và hướng dẫn dừng cuộc gọi.
- Guardian chạy nền trong toàn bộ luồng sử dụng; các chỉ số microphone, recorder, chunk/ACK, STT và risk không hiển thị trong layout để giữ giao diện gọn, nhưng luồng realtime và cảnh báo vẫn hoạt động. Bảng chẩn đoán ngắn (3 transcript gần nhất, metric STT/Agent) chỉ mở khi nhấn đồng thời `M` + `T`.
- Transcript chỉ lưu vào conversation_segments khi người dùng bật consent; risk events/signals vẫn được lưu để audit nhưng không lưu text bằng chứng nếu chưa consent.
- Critical alert được lưu vào scam_alerts cùng thời điểm gửi WebSocket để audit/hiển thị lại sau này.
- Hệ thống chưa xác minh danh tính hay tự tách người nói (speaker diarization). Transcript chỉ là dữ liệu hỗ trợ phát hiện rủi ro; giao thức WebSocket đã tách riêng để có thể bổ sung diarization sau này mà không ảnh hưởng UI.

Guardian signal catalog (offline evaluator; production threshold belongs to the agent)

| Signal | Tiêu chí chính | Mức cộng cơ sở |
|---|---|---:|
| `bank_impersonation` | Tự xưng nhân viên/cán bộ ngân hàng hoặc bộ phận bảo mật | 22 |
| `urgency` | Ép làm ngay, giới hạn vài phút/giờ, đe dọa nếu chậm | 12 |
| `account_lock_threat` | Dọa khóa, phong tỏa, vô hiệu hóa hoặc mất quyền truy cập tài khoản | 24 |
| `otp_request` | Yêu cầu đọc/gửi OTP, mã xác thực hoặc mã bảo mật | 30 |
| `credential_social_engineering` | Dẫn dụ cung cấp PIN, mật khẩu, tên đăng nhập hoặc mã bảo mật | 28 |
| `prevent_external_verification` | Cấm gọi ngân hàng, tự xác minh, ngắt máy hoặc hỏi người khác | 25 |
| `authority_claim` | Tự xưng công an, cơ quan điều tra, tòa án, ngân hàng hoặc cơ quan có thẩm quyền | 18 |

Các signal tương đồng legacy vẫn được lưu để không mất khả năng audit, nhưng được gom nhóm khi tính điểm để tránh cộng hai lần cùng một bằng chứng. Tổ hợp authority + khóa tài khoản, OTP + credential, hoặc cấm xác minh bên ngoài sẽ cộng thêm bonus và có thể chuyển cảnh báo lên `STOP`.

## Guardian Risk Agent & Phase roadmap

| Phase | Trạng thái | Mục tiêu chính |
|-------|------------|----------------|
| Phase 0 | ✅ Baseline | Prompt versioning + 32 cases + metrics ban đầu |
| Phase 1 | ✅ Đạt chất lượng quyết định | Schema OK ≥ 95% (thực tế **100%**), hybrid rule+agent, `decision_confidence`, F1 STOP/PAUSE tốt hơn |
| Phase 2 | Planned | Hierarchical Multi-Agent / Bank Risk Manager |

### Prompt versioning

Xem `prompts/README.md`. Khuyến nghị hiện tại:

```bash
export GUARDIAN_PROMPT_VERSION=0.3
export GUARDIAN_HYBRID=true          # production path (nếu đã wire hybrid)
```

| File | Version | Ghi chú |
|------|---------|---------|
| `guardian_v0.1.yaml` | 0.1 | Extract từ production code |
| `guardian_v0.2.yaml` | 0.2 | Phase 0 baseline |
| `guardian_v0.3.yaml` | 0.3 | Phase 1: shorter JSON, 12 few-shot VN, `decision_confidence` bắt buộc |

**Quy tắc:** Không sửa file version đã dùng trong evaluation. Mỗi thay đổi meaningful → tạo version mới và ghi rõ trong report.

### Hybrid merge policy (tóm tắt)

- Rule engine chạy song song với agent.
- `decision_confidence < 0.55` → floor tối thiểu PAUSE nếu rule đã thấy risk.
- Final action = max severity khi bất đồng trên tín hiệu cao.
- Fail-closed khi agent/STT không khả dụng.

Chi tiết triển khai: `docs/PHASE1_IMPLEMENTATION.md`, `src/app/services/scam_guardian_hybrid.py`.

## Evaluation

### Latest baseline (2026-08-23)

| Metric | Value |
|--------|-------|
| Total cases | 32 |
| Schema OK rate | **100.0%** |
| Availability rate | **100.0%** |
| Action accuracy | **100.0%** |
| Level accuracy | **100.0%** |
| Score in range rate | **100.0%** |
| Signal check rate | **100.0%** |
| Overall pass rate | **100.0%** |
| Resolved action accuracy | **100.0%** |
| Avg latency | **9067.7 ms** |
| Source file | `eval/results/baseline_20260823_034947.json` |

**Kết luận:** Đạt tuyệt đối trên schema và toàn bộ accuracy. Latency trung bình ~9.1s vẫn là điểm cần tối ưu tiếp.

### So sánh nhanh với Phase 0 cũ

| Metric | Phase 0 (~21/08) | Latest (23/08) |
|--------|------------------|----------------|
| Schema OK | ~78–81% | **100%** |
| Action accuracy | ~56–66% | **100%** |
| Overall pass | ~53–66% | **100%** |

### Đường dẫn eval

| Path | Mô tả |
|------|-------|
| `eval/manual_cases.md` | Manual cases (transaction UI + Guardian) |
| `eval/results/report.md` | Báo cáo metrics đầy đủ |
| `eval/results/baseline_*.json` | Raw run results |
| `eval/dataset/` | `guardian_cases_v0.json` và v1 extra |
| `eval/scripts/` | `run_baseline_eval.py`, `run_phase1_eval.py` |
| `docs/PHASE0_REPORT.md` | Báo cáo baseline |
| `docs/PHASE1_IMPLEMENTATION.md` | Checklist & Definition of Done Phase 1 |
| `docs/QUALITY_GATE.md` | Common-weakness audit, reproducible checks, and security follow-up |
| `docs/MISSING_DELIVERABLES.md` | File-level audit and remaining deliverable status |
| `presentation/VIDEO_DEMO_SCRIPT.md` | Recording script and acceptance checklist for the video deliverable |

Chạy lại eval:

```bash
export GUARDIAN_PROMPT_VERSION=0.3
export GROQ_API_KEY=...
python eval/scripts/run_baseline_eval.py
# hoặc Phase 1 modes
python eval/scripts/run_phase1_eval.py --mode hybrid
python eval/scripts/run_phase1_eval.py --mode agent
python eval/scripts/run_phase1_eval.py --mode rule
```

## Kiến trúc và cấu trúc mã nguồn

~~~text
Browser (React/Vite)
        │ REST + JWT
        ▼
FastAPI (src/app)
  ├─ Auth / location / PIN / Face ID
  ├─ Transactions / Timi ledger / reports
  ├─ QR URL safety / blacklist
  ├─ Admin / audit
  ├─ Scam Guardian WebSocket → transcript/risk/alert realtime
  └─ Timi Assistant → Groq (tuỳ chọn cấu hình)
        │ SQLAlchemy + Alembic
        ▼
    Neon PostgreSQL (schema antiscam, scam_sessions + risk timeline)
~~~

| Đường dẫn | Vai trò |
|---|---|
| src/main.py | Entrypoint Uvicorn, export app |
| src/app/main.py | FastAPI app canonical và router đang mount |
| src/app/routers/api/ | API auth, transaction, admin, URL safety, assistant |
| src/app/services/ | Risk rules, Timi ledger, Face ID, blacklist, audit, Guardian hybrid |
| src/app/models/ | SQLAlchemy models |
| src/app/schemas/ | Pydantic request/response schemas |
| src/agents/ | LangGraph transaction/intervention graph |
| alembic/versions/ | Chuỗi database migration |
| frontend/src/ | React pages, stores, API clients, components |
| data/uploads/ | File URL scam và upload local (không commit) |
| tests/ | Unit/integration tests |
| eval/ | Manual cases và kết quả đánh giá |
| prompts/ | Versioned Guardian system prompts |
| ARCHITECTURE.md | Luồng hoạt động, sơ đồ Mermaid và safety boundary |

> Lưu ý: src/api, src/pages, src/models, src/config.py và một số src/routers là code/flow legacy. Chúng không được mount bởi src/app/main.py. Tính năng mới nên đặt trong src/app và frontend/src.

## Yêu cầu môi trường

- Python 3.11+.
- Node.js 20+ và npm.
- PostgreSQL hoặc Neon PostgreSQL; bật pgvector nếu dùng vector store.
- Docker Desktop + Linux containers/WSL 2 nếu chạy Docker.
- Trình duyệt có camera và quyền định vị. Camera trên deployment phải chạy HTTPS; localhost được phép trong development.
- Face ID dùng hai model ONNX nhẹ được lưu trong `models/face/`; không dùng Hugging Face/PyTorch.

Hai file model cần có:

```text
models/face/face_detection_yunet_2023mar.onnx
models/face/face_recognition_sface_2021dec.onnx
```

Các file model được đóng gói vào Docker image tại `/opt/face-models`. Khi đổi model hoặc preprocessing, người dùng cần đăng ký Face ID lại.

## Cấu hình biến môi trường

Tạo file local:

~~~powershell
Copy-Item .env.example .env
~~~

Không commit .env. Các biến quan trọng:

| Biến | Bắt buộc | Mục đích |
|---|---:|---|
| APP_ENV | Có | development, test hoặc production |
| APP_HOST, APP_PORT | Không | Host/port Uvicorn; Render có thể cấp PORT |
| DATABASE_URL | Có | Runtime DB; Neon nên dùng URL pooled |
| DATABASE_URL_UNPOOLED | Nên có | Direct URL cho Alembic; hostname Neon không có -pooler |
| DATABASE_SCHEMA | Có | Schema hiện dùng là antiscam |
| JWT_SECRET_KEY | Có | Khóa ký JWT; production phải thay secret mặc định |
| CARD_ENCRYPTION_KEY | Production | Khóa riêng để mã hóa dữ liệu thẻ mô phỏng; không dùng chung JWT |
| CORS_ORIGINS | Có | Origin frontend, phân tách bằng dấu phẩy, không có slash cuối |
| GROQ_API_KEY | Cho chat + Guardian | Key server-side cho Timi Assistant và Guardian Risk Agent |
| GROQ_MODEL_NAME | Cho chat | Mặc định openai/gpt-oss-20b |
| GROQ_BASE_URL | Không | Mặc định https://api.groq.com/openai/v1 |
| GUARDIAN_AGENT_ENABLED | Không | Bật Guardian Risk Agent; mặc định true |
| GUARDIAN_AGENT_MODEL | Không | Model Groq dùng chấm điểm/ngưỡng Guardian; mặc định `llama-3.1-8b-instant` |
| GUARDIAN_PROMPT_VERSION | Không | Version prompt (`0.3` khuyến nghị Phase 1); mặc định theo code |
| GUARDIAN_HYBRID | Không | Bật hybrid rule+agent trên production path; mặc định false |
| GUARDIAN_AGENT_MIN_INTERVAL_SECONDS | Không | Khoảng tối thiểu giữa hai lần agent phân tích transcript; mặc định 6 giây |
| GUARDIAN_STT_ENABLED | Không | Bật server-side Whisper STT cho Guardian; mặc định true |
| GUARDIAN_STT_MODEL | Không | Mặc định whisper-large-v3; có thể đổi sang whisper-large-v3-turbo nếu ưu tiên tốc độ/chi phí |
| OPENAI_API_KEY | Không | Nhánh giải thích transaction legacy khi bật LLM |
| LLM_EXPLANATION_ENABLED | Không | Mặc định false; risk score vẫn chạy khi tắt |
| RISK_TELEMETRY_HASH_KEY | Production | HMAC IP/device telemetry, phải khác JWT secret |
| FACE_MODEL_ID | Không | Nhận diện `opencv-sface-yunet` |
| FACE_MODEL_DIR | Không | Thư mục chứa 2 model ONNX; local mặc định `models/face`, Docker dùng `/opt/face-models` |
| FACE_SIMILARITY_THRESHOLD | Không | Ngưỡng mặc định 0.70 |
| FACE_MODEL_PRELOAD | Không | true preload model; false lazy-load |
| CLOUDINARY_* | Tuỳ chọn | Upload avatar |
| EMAIL_*, BREVO_API_KEY | Có cho đăng nhập | Brevo Transactional Email API qua HTTPS với API key và sender đã xác minh; tương thích Render Free |
| LANGCHAIN_*, AI_LOG_* | Tuỳ chọn | Tracing/logging local hoặc production |

Tạo secret ngẫu nhiên:

~~~powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
~~~

RISK_TELEMETRY_HASH_KEY dùng HMAC để pseudonymize IP/device trước khi lưu, không phải khóa mã hóa và không dùng chung với JWT_SECRET_KEY. Không đặt placeholder ở production và không in secret ra log.

## Chạy local không Docker

### Backend

~~~powershell
git clone <repository-url>
Set-Location P-020
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# Chỉnh DATABASE_URL, DATABASE_SCHEMA, JWT_SECRET_KEY và GROQ_API_KEY
python -m alembic upgrade head
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
~~~

Các lệnh bên dưới giả định virtual environment đã được kích hoạt.

- API root: http://localhost:8000/
- Swagger: http://localhost:8000/docs
- Liveness: http://localhost:8000/health
- Readiness + DB/pgvector: http://localhost:8000/health/ready

### Frontend (terminal khác)

~~~powershell
Set-Location frontend
npm ci
npm run dev
~~~

Mở http://localhost:5173. Frontend mặc định gọi http://localhost:8000/api. Nếu backend ở URL khác, tạo frontend/.env.local:

~~~env
VITE_API_URL=http://localhost:8000/api
~~~

### Tài khoản demo

1. Đăng ký với số điện thoại đúng 10 chữ số.
2. Đăng nhập; thiết bị mới nhập OTP email, sau đó cấp quyền vị trí.
3. Thiết lập PIN và (nếu cần) enroll Face ID.
4. Dùng tài khoản Timi khác để thử chuyển tiền nội bộ; bank code demo là TIMI.

## Chạy bằng Docker

### Development hot reload

Đảm bảo Docker Desktop báo Engine running:

~~~powershell
docker info
docker compose -f docker-compose.dev.yml up --build
~~~

Chạy nền và xem log:

~~~powershell
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml logs -f backend
~~~

Development compose bind-mount source, backend chạy Uvicorn reload và frontend chạy Vite. Truy cập frontend http://localhost:5173, backend http://localhost:8000.

Sau khi sửa `requirements.txt`, Dockerfile hoặc biến build frontend:

~~~powershell
docker compose -f docker-compose.dev.yml up -d --build --force-recreate
~~~

Dừng stack:

~~~powershell
docker compose -f docker-compose.dev.yml down
~~~

### Production-like compose

~~~powershell
docker compose up -d --build
docker compose ps
docker compose logs -f backend
~~~

Production compose build backend Python và frontend static/Nginx. Nginx proxy /api/ và /media/ tới backend. Entrypoint chạy alembic upgrade head trước khi start Uvicorn. Không dùng docker compose down -v nếu chưa backup dữ liệu volume.

## Cơ sở dữ liệu và migration

Alembic là nguồn quản lý schema duy nhất; app không tự create_all khi startup. Với Neon:

1. Đặt DATABASE_URL là pooled URL cho runtime.
2. Đặt DATABASE_URL_UNPOOLED là direct URL cho migration.
3. Đặt DATABASE_SCHEMA=antiscam.
4. Chạy migration trước khi mở frontend.

~~~powershell
python -m alembic current
python -m alembic heads
python -m alembic upgrade head
~~~

Kiểm tra readiness:

~~~powershell
Invoke-RestMethod http://localhost:8000/health/ready
~~~

Tạo migration mới sau khi review model:

~~~powershell
python -m alembic revision --autogenerate -m "describe change"
python -m alembic upgrade head
~~~

Không sửa tay revision đã chạy trên Neon. Nếu gặp Can't locate revision, checkout phải có đủ file trong alembic/versions; kiểm tra git status, git pull và alembic heads trước khi can thiệp DB.

## Nạp URL blacklist

Đặt file CSV, TXT hoặc JSON trong data/uploads/, sau đó chạy từ repository root:

~~~powershell
python scripts/import_url_blacklist.py data/uploads/malicious_urls.csv data/uploads/scamvn_urls.csv
~~~

Script chuẩn hóa hostname, loại duplicate, lưu entity_type=url và chỉ tạo entry active mới. Chạy lại không tạo bản ghi trùng. QR scanner gọi POST /api/v1/url-safety/check; URL bị blacklist không được mở từ giao diện.

## Luồng sử dụng nhanh

~~~text
Đăng ký → đăng nhập → OTP thiết bị mới → cấp quyền vị trí → thiết lập PIN/Face ID
      ↓
Chọn Chuyển tiền hoặc QR
      ↓
Tra cứu người nhận → đánh giá rủi ro bằng rule/agent
      ↓
An toàn: xác thực và hoàn tất
Rủi ro: xem cảnh báo → người dùng quyết định → PIN hoặc Face ID
      ↓
Lưu transaction, audit, risk context và cập nhật lịch sử
~~~

Với giao dịch từ 10.000.000 VND trở lên, luồng hiện yêu cầu Face ID; giao dịch nhỏ hơn dùng luồng xác thực tương ứng. Timi Assistant chỉ hỗ trợ giải thích, không có quyền duyệt giao dịch hoặc thay đổi số dư.

## API chính

Các API dưới đây (trừ health/root) nằm dưới /api/v1 và thường yêu cầu Authorization: Bearer access_token.

| Method | Endpoint | Mục đích |
|---|---|---|
| POST | /auth/register/request-otp | Kiểm tra dữ liệu và gửi OTP đăng ký |
| POST | /auth/register/verify-otp | Xác minh OTP, tạo tài khoản rồi yêu cầu đăng nhập |
| POST | /auth/login | Xác minh thông tin đăng nhập; thiết bị mới nhận challenge OTP |
| POST | /auth/login/device/verify | Xác minh OTP email và nhận token chờ location |
| POST | /auth/login/location | Ghi nhận vị trí gần đúng sau login |
| PUT | /auth/face/enrollment | Enroll Face ID |
| POST | /auth/face/verify | Verify Face ID |
| PUT | /auth/transaction-pin | Thiết lập/đổi PIN |
| POST | /recipients/resolve | Tra cứu người nhận |
| POST | /transactions/assess | Đánh giá rủi ro trước chuyển |
| POST | /transactions/{id}/decision | Tiếp tục/hủy cảnh báo |
| GET | /transactions/history | Lịch sử cursor pagination |
| POST | /transactions/{id}/scam-report | Report giao dịch đáng ngờ |
| POST | /url-safety/check | Kiểm tra URL QR |
| POST | /assistant/chat | Chat giới hạn phạm vi với Timi |
| POST | /scam-guardian/sessions | Tạo phiên bảo vệ cuộc gọi nền |
| WS | /scam-guardian/ws/{session_id} | Audio/transcript realtime và risk update |
| POST | /scam-guardian/sessions/{id}/finish | Kết thúc phiên Guardian |
| GET | /admin/blacklist | Admin xem blacklist theo trang |
| GET | /admin/scam-reports | Admin xem report |
| GET | /health, /health/ready | Health, không cần JWT |

Swagger đầy đủ tại http://localhost:8000/docs.

## Kiểm thử

Từ repository root:

~~~powershell
python -m pytest tests\test_services\test_timi_assistant_scope.py tests\test_services\test_timi_bank.py tests\test_services\test_url_blacklist.py tests\test_agents\test_risk_rules.py tests\test_agents\test_behavioral_risk_rules.py tests\test_agents\test_blacklist_policy.py -q
python -m ruff check src\app\api\assistant.py src\app\schemas\assistant.py src\app\services\timi_assistant.py tests\test_services\test_timi_assistant_scope.py
npm --prefix frontend run build
npm --prefix frontend run lint
Get-Content eval/manual_cases.md
~~~

Nhóm smoke test canonical hiện chạy độc lập với DB và bao phủ Timi ledger, risk rules/behavior, URL blacklist, blacklist policy và Timi Assistant scope. Kết quả/manual evidence lưu trong eval/results/.

Repository vẫn chứa một số test legacy trong tests/test_api và tests/test_services/test_audit.py. Chúng tham chiếu async stack/route cũ và có thể cần asyncpg cùng database test riêng; vì vậy không gộp vào smoke test canonical. Có thể chạy toàn bộ để audit khi đã chuẩn bị môi trường legacy:

~~~powershell
python -m pytest tests -q
~~~

## Troubleshooting

### 503 tại /api/v1/assistant/chat

Backend chưa đọc GROQ_API_KEY hoặc đang chạy tiến trình cũ trước khi .env được cập nhật. Dừng toàn bộ Uvicorn, kiểm tra key không rỗng rồi khởi động lại. Không đặt key ở frontend.

### Scam Guardian không nhận audio

Mở Timi Chibi ở góc màn hình trên layout để kiểm tra các chỉ số: `track live`, `WebAudio running`, `recorder recording`, `data event`, `Đã gửi`, `ACK`. Sau khi phiên chuyển sang active, các chỉ số data/chunk phải tăng mà không cần bấm dừng rồi khởi động lại; nếu không, tải lại trang một lần để tạo run mới và xem thông báo lỗi. Nếu trình duyệt chặn `getUserMedia` vì phiên được khởi động tự động sau login, chỉ cần click/phím một lần trên layout đã đăng nhập để Guardian tự retry. Kiểm tra log browser/backend và đảm bảo microphone được cấp quyền trên đúng origin. Backend phải chạy tại `http://localhost:8000`; WebSocket cần được proxy với header Upgrade. Khi thay đổi cấu hình proxy, khởi động lại frontend:

~~~powershell
npm --prefix frontend run dev
~~~

Trình duyệt trên laptop không tự lấy được âm thanh nội bộ của cuộc gọi di động. Muốn thử cuộc gọi, bật loa ngoài đặt gần microphone; trước hết nên nói trực tiếp vào microphone máy tính để xác nhận pipeline.

### env: sh\r: No such file or directory

docker/entrypoint.sh đang có line ending CRLF. Chuyển file về LF trước khi build lại Docker image; giữ shebang là #!/usr/bin/env sh.

### Can't locate revision identified by ...

Migration đang thiếu hoặc DB trỏ tới revision từ branch khác. Kiểm tra toàn bộ alembic/versions, chạy git pull, xem alembic current/heads; không xóa row alembic_version nếu chưa xác định chain.

### Docker Desktop không chạy / timeout khi pull image

Mở Docker Desktop và chờ Engine running, sau đó:

~~~powershell
docker info
docker compose -f docker-compose.dev.yml build
~~~

Nếu WSL bị kẹt, chạy wsl --shutdown rồi mở lại Docker Desktop. Không dùng prune có --volumes nếu chưa backup DB.

### Camera không mở

Mở bằng http://localhost:5173 hoặc HTTPS, cấp quyền camera cho đúng origin, đóng tab/app khác đang giữ camera và thử lại. getUserMedia thường bị chặn trên HTTP không phải localhost.

### Face ID không nhận diện

Đảm bảo đã cài `requirements.txt`, có đủ 2 file trong `models/face/`, ảnh dưới 5 MB, đủ sáng, chỉ một người và nhìn thẳng. Khi đăng ký, giữ mặt giữa khung rồi quay trái và quay về giữa (`1/2`), sau đó quay phải và quay về giữa (`2/2`).

### Không kết nối Neon

Kiểm tra DATABASE_URL, DATABASE_URL_UNPOOLED, sslmode=require, branch Neon, password và DATABASE_SCHEMA. Dùng /health/ready để phân biệt app sống nhưng DB chưa sẵn sàng.

### CORS hoặc frontend gọi sai backend

CORS_ORIGINS phải chứa đúng origin frontend, không có slash cuối. Khi chạy Vite, VITE_API_URL phải trỏ tới backend và kết thúc ở /api.

## Deploy

### Render backend Docker

- Docker context: repository root.
- Dockerfile: ./Dockerfile.
- Health check path: /health.
- Đặt secrets trong Render Environment, không commit .env.
- Đặt APP_ENV=production, DATABASE_URL, DATABASE_URL_UNPOOLED, DATABASE_SCHEMA, JWT_SECRET_KEY, RISK_TELEMETRY_HASH_KEY, GROQ_API_KEY và CORS_ORIGINS.
- Dockerfile dùng PORT do Render cấp; entrypoint chạy migration trước API.

### Render frontend

- Root directory: frontend.
- Build command: npm ci && npm run build.
- Publish directory: dist.
- Build variable: VITE_API_URL=https://<backend-service>/api.
- Sau khi biết URL frontend, cập nhật CORS_ORIGINS backend rồi redeploy.

## An toàn và giới hạn

- Đây là demo; không dùng cho tiền thật hoặc dữ liệu production nếu chưa có kiểm thử, giám sát và compliance phù hợp.
- Guardian Risk Agent là thành phần quyết định realtime: agent chọn score/ngưỡng/tín hiệu/hành động từ transcript. Backend không cho agent gọi tool; backend chỉ validate kết quả và thực thi rào chắn `STOP` đối với giao dịch nguy hiểm.
- PIN, JWT secret, API key và HMAC key phải nằm trong secret manager/environment.
- Không gửi OTP, PIN, mật khẩu, private key hoặc API key vào Timi chat.
- Face embedding và telemetry là dữ liệu nhạy cảm; giới hạn quyền truy cập DB, log và thời gian lưu giữ trước khi đưa lên production.
- Khi đổi FACE_SIMILARITY_THRESHOLD hoặc preprocessing/model, cần đánh giá lại false positive/false negative và có thể yêu cầu enroll lại.

## Tài liệu liên quan

- ARCHITECTURE.md — luồng hoạt động, component/data flow và safety boundary.
- docs/SETUP.md — hướng dẫn Docker, Neon, Render và Android chi tiết hơn.
- eval/manual_cases.md — manual cases (transaction + Guardian).
- eval/results/report.md — báo cáo evaluation mới nhất (100% metrics).
- eval/results/ — raw JSON baseline runs.
- docs/PHASE0_REPORT.md — báo cáo baseline.
- docs/PHASE1_IMPLEMENTATION.md — checklist & Definition of Done Phase 1.
- prompts/README.md — versioned Guardian prompts.
- frontend/README.md — ghi chú frontend.
```
