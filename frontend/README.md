# Frontend — Timi (FintechGuard Anti-Scam Demo)

Giao diện React + TypeScript + Vite của ứng dụng ngân hàng mô phỏng Timi.  
Người dùng đăng ký/đăng nhập, chuyển tiền nội bộ, quét/tạo QR, xác thực Face ID, và chạy Scam Call Guardian realtime (microphone → STT → risk alert).

Backend API: FastAPI tại `/api` (mặc định `http://localhost:8000/api`).

---

## Stack

| Thành phần | Ghi chú |
|------------|---------|
| React 18 + TypeScript | UI chính |
| Vite | Dev server + build |
| React Router | Điều hướng trang |
| State / API client | Stores + fetch/axios theo cấu trúc `frontend/src` |
| Web APIs | `getUserMedia`, MediaRecorder, (tuỳ chọn) SpeechRecognition |
| Face ID | Camera → backend ONNX (YuNet + SFace); không chạy model nặng trên browser |

---

## Yêu cầu

- Node.js **20+** và npm
- Backend đang chạy (local hoặc Docker) tại URL mà `VITE_API_URL` trỏ tới
- Trình duyệt có camera + microphone (Chrome/Edge khuyến nghị)
- Dev: `http://localhost` được phép dùng camera; production cần **HTTPS**

---

## Chạy local

```bash
cd frontend
npm ci
npm run dev
```

Mở [http://localhost:5173](http://localhost:5173).

### Biến môi trường

Tạo `frontend/.env.local` nếu backend không nằm ở mặc định:

```env
VITE_API_URL=http://localhost:8000/api
```

- Không commit file `.env.local` / secret.
- `VITE_API_URL` phải kết thúc bằng `/api` (không có slash thừa sau nếu backend đã mount `/api`).
- CORS phía backend (`CORS_ORIGINS`) phải chứa đúng origin frontend (ví dụ `http://localhost:5173`, không slash cuối).

### Scripts

| Lệnh | Mục đích |
|------|----------|
| `npm run dev` | Dev server + HMR |
| `npm run build` | Build production → `dist/` |
| `npm run preview` | Xem bản build local |
| `npm run lint` | ESLint |

---

## Cấu trúc thư mục (gợi ý theo repo)

```text
frontend/
├── src/
│   ├── pages/          # Transfer, Login, QR, Account, Admin, ...
│   ├── components/     # UI dùng chung, Mini Timi, Guardian indicators
│   ├── stores/         # Auth, session, guardian state
│   ├── api/            # Client gọi backend
│   ├── layouts/        # MainLayout (Guardian chạy nền sau login)
│   └── ...
├── public/
├── index.html
├── vite.config.ts
├── package.json
└── .env.local          # local only
```

> Code legacy (nếu còn) không nên mở rộng; tính năng mới đặt trong `frontend/src` và gọi API canonical của `src/app` backend.

---

## Tính năng UI chính

### Người dùng
- Đăng ký / đăng nhập (email, mật khẩu, SĐT Timi 10 số)
- Sau login: màn **xác nhận vị trí gần đúng** trên thiết bị chưa ghi nhận
- Thiết lập PIN giao dịch
- Enroll / verify Face ID (camera)
- Chuyển tiền nội bộ: tra cứu người nhận → đánh giá rủi ro → HITL (nếu medium/high) → PIN hoặc Face ID
- Lịch sử giao dịch (cursor pagination)

### QR & chống lừa đảo
- Quét QR (camera hoặc chọn ảnh)
- Kiểm tra URL/hostname với blacklist (backend); URL bị chặn không mở được
- Tạo QR nhận tiền (số tiền + nội dung)

### Scam Call Guardian (realtime)
- Chạy **nền** trong MainLayout sau khi đăng nhập + cấp quyền microphone
- Không cần trang riêng; WebSocket giữ phiên
- MediaRecorder gom đoạn ~3s có voice → backend STT (Groq Whisper) + Guardian Risk Agent
- Mini Timi mở cảnh báo khi risk cao (score, tín hiệu, hướng dẫn dừng cuộc gọi)
- Chỉ số mic/recorder chi tiết có thể ẩn trên layout; luồng realtime vẫn hoạt động

### Khác
- Timi Chibi Assistant (chat giới hạn phạm vi tính năng Timi)
- Admin (blacklist, report, audit) — theo role/backend

---

## Luồng demo nhanh

1. `npm run dev` + backend đã lên (`/health` OK)
2. Đăng ký SĐT 10 số → đăng nhập → cấp vị trí
3. Thiết lập PIN (và Face ID nếu test giao dịch lớn)
4. **Chuyển tiền:** người nhận mới / note đáng ngờ / số tiền bất thường → xem warning HITL
5. **Guardian:** cấp mic → nói hoặc phát audio gần mic → theo dõi alert Mini Timi
6. **QR:** quét URL blacklist → không có nút mở nếu bị chặn

---

## Build & Deploy (Render Static / Nginx)

```bash
cd frontend
npm ci
npm run build
```

- Publish directory: `dist`
- Build-time env: `VITE_API_URL=https://<backend-host>/api`
- Sau khi có URL frontend thật: cập nhật `CORS_ORIGINS` phía backend rồi redeploy API

Docker: dùng `frontend/Dockerfile` trong compose production (Nginx serve static + proxy `/api` nếu cấu hình).

---

## Troubleshooting

| Hiện tượng | Việc nên kiểm |
|------------|----------------|
| API 401 / CORS | `VITE_API_URL`, `CORS_ORIGINS` (không slash cuối), token hết hạn |
| Camera không mở | Dùng `localhost` hoặc HTTPS; cấp quyền đúng origin; đóng tab khác giữ camera |
| Guardian không nhận audio | Cấp mic; click một lần trên layout nếu auto-start bị chặn; backend WS proxy có `Upgrade`; xem Mini Timi / console |
| Face ID fail | Đủ sáng, một khuôn mặt, model backend đã load; enroll lại nếu đổi threshold/model |
| Trang trắng sau build | Kiểm tra base path Vite và `VITE_API_URL` lúc build |

---

## Liên kết

- Root repo: `README.md` (tổng quan, env backend, Evaluation)
- Backend setup: `SETUP.md`
- Kiến trúc: `ARCHITECTURE.md`
- Eval / Guardian metrics: `eval/results/report.md`
- Roadmap 6 tuần: `ROADMAP.md` / `JOURNAL.md`

---

## Ghi chú kỹ thuật (template Vite)

Hai plugin React chính thức:

- `@vitejs/plugin-react` (Oxc)
- `@vitejs/plugin-react-swc` (SWC)

React Compiler mặc định **tắt** trên template (ảnh hưởng perf dev/build). Chỉ bật khi team chủ động opt-in theo [tài liệu React Compiler](https://react.dev/learn/react-compiler/installation).

ESLint: có thể siết type-aware (`recommendedTypeChecked` / `strictTypeChecked`) và thêm `eslint-plugin-react-x` / `eslint-plugin-react-dom` nếu cần quy tắc React nghiêm hơn — xem cấu hình trong `eslint.config.js` hiện tại của repo.
