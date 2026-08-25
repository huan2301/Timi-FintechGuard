# FintechGuard - Docker Setup

Hướng dẫn chạy hệ thống gồm FastAPI backend (`src/app`), React/Vite frontend (`frontend`), PostgreSQL/Neon và Alembic.

## 1. Yêu cầu

- Docker Desktop, Linux containers và WSL 2 trên Windows.
- Git.
- Node.js 20+ và Python 3.11+ nếu chạy ngoài Docker.

Kiểm tra Docker:

```powershell
docker --version
docker compose version
docker info
```

Nếu `docker info` không trả về thông tin Server, hãy mở Docker Desktop và chờ `Engine running`.

## 2. Cấu hình `.env`

Từ thư mục root:

```powershell
Copy-Item .env.example .env
```

Đặt các biến cần thiết:

```env
APP_ENV=development
JWT_SECRET_KEY=replace-with-a-long-random-secret
OPENAI_API_KEY=

# URL pooled dùng cho app runtime
DATABASE_URL=postgresql+psycopg2://user:password@host-pooler/neondb?sslmode=require

# URL direct/unpooled dùng cho Alembic migration
DATABASE_URL_UNPOOLED=postgresql+psycopg2://user:password@host/neondb?sslmode=require

# Phải trùng schema đang dùng trong Neon; project hiện tại dùng antiscam
DATABASE_SCHEMA=antiscam
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

Không commit `.env` hoặc API key lên Git.

## 3. Development bằng Docker

Development dùng bind mount. Code sửa trên máy được container thấy ngay; backend tự reload bằng Uvicorn và frontend tự cập nhật bằng Vite HMR.

```powershell
docker compose -f docker-compose.dev.yml up --build
```

Chạy nền:

```powershell
docker compose -f docker-compose.dev.yml up -d --build
```

Truy cập:

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health

Logs và dừng:

```powershell
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f frontend
docker compose -f docker-compose.dev.yml down
```

chạy khi sửa ví dụ như cấu hình requiment...
```powershell
docker compose -f docker-compose.dev.yml up -d --build --force-recreate
```

## 4. Production bằng Docker Compose

Production build backend Python và frontend static/Nginx. Nginx proxy `/api` tới service backend.

```powershell
docker compose up -d --build
```

Backend container tự chạy migration trước khi start API:

```text
alembic upgrade head
uvicorn src.main:app --host 0.0.0.0 --port 8000
```

Truy cập production local:

- Frontend: http://localhost:5173
- Backend health: http://localhost:8000/health

Quản lý container:

```powershell
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
```

Không dùng `docker compose down -v` nếu chưa backup dữ liệu volume.

## 5. Chạy không dùng Docker

Backend:

```powershell
\.venv\Scripts\python.exe -m pip install -r requirements.txt
\.venv\Scripts\python.exe -c "import cv2; print(cv2.__version__)"
\.venv\Scripts\python.exe -m alembic upgrade head
\.venv\Scripts\python.exe -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Luôn khởi động backend bằng `\.venv\Scripts\python.exe -m uvicorn`, không dùng trực tiếp lệnh `uvicorn` của Python global. Nếu log hiển thị đường dẫn kiểu `C:\Users\...\Python311\Lib\site-packages` và gặp `No module named 'cv2'`, hãy cài dependency vào đúng môi trường:

```powershell
\.venv\Scripts\python.exe -m pip install -r requirements.txt
\.venv\Scripts\python.exe -c "import cv2; print(cv2.__version__)"
```

Frontend, ở terminal khác:

```powershell
cd frontend
npm install
npm run dev
```

## 6. Database migration

Production entrypoint tự chạy migration. Chạy thủ công trong container:

```powershell
docker compose run --rm backend alembic upgrade head
```

Tạo migration mới:

```powershell
\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe change"
\.venv\Scripts\python.exe -m alembic upgrade head
```

Với Neon, dùng `DATABASE_URL_UNPOOLED` cho migration và kiểm tra migration trên branch/test database trước production.

Lưu ý: project hiện tại dùng schema `antiscam`, vì vậy trong Neon SQL Editor phải chọn đúng schema hoặc truy vấn đầy đủ:

```sql
SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'antiscam'
  AND table_name = 'users'
  AND column_name = 'transaction_pin_hash';
```

Không kiểm tra `public.users` nếu `DATABASE_SCHEMA=antiscam`. Với Neon, đặt thêm `DATABASE_URL_UNPOOLED` bằng connection string direct (hostname không có hậu tố `-pooler`) rồi rebuild backend để Alembic chạy đúng kênh migration.

## 7. Troubleshooting Docker

### Docker Desktop chưa chạy

Nếu gặp `Docker Desktop is unable to start`:

```powershell
wsl --shutdown
```

Mở lại Docker Desktop, chờ `Engine running`, rồi kiểm tra:

```powershell
docker info
```

### BuildKit báo `read-only file system`

Đây thường là lỗi Docker Desktop storage/WSL, không phải lỗi dòng `COPY . .`.

```powershell
wsl --shutdown
docker builder prune
docker compose build --no-cache
```

Kiểm tra Docker Desktop → Settings → Resources → Disk usage và dung lượng ổ đĩa.

Không chạy lệnh sau nếu chưa backup volume:

```powershell
docker system prune -a --volumes
```

### Port bị chiếm

```powershell
netstat -ano | findstr :8000
netstat -ano | findstr :5173
```

Có thể đổi mapping, ví dụ `8080:8000` trong `docker-compose.yml`.

### Backend không kết nối Neon

Kiểm tra `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `sslmode=require`, user/password, branch Neon và `DATABASE_SCHEMA`. Xem lỗi bằng:

```powershell
docker compose logs backend
```

## 8. Quy trình khuyến nghị

```text
1. Mở Docker Desktop.
2. docker compose -f docker-compose.dev.yml up -d --build
3. Sửa code trên máy; backend/frontend tự cập nhật.
4. Chạy test và lint.
5. docker compose up -d --build để kiểm tra production image.
6. Deploy image lên server/platform.
```

Các file chính:

- `Dockerfile`: backend production image.
- `frontend/Dockerfile`: frontend production image.
- `docker-compose.yml`: production.
- `docker-compose.dev.yml`: development hot reload.
- `docker/entrypoint.sh`: migration trước khi start backend.
- `alembic/`: database migrations.

## 9. Deploy Render

Nên tạo hai service trên Render: backend là **Web Service (Docker)** và frontend là **Static Site**.

### Backend Web Service

Chọn `New → Web Service → GitHub`, sau đó cấu hình:

- Language: `Docker`
- Dockerfile: `./Dockerfile`
- Docker context: repository root
- Health check path: `/health`
- Auto-deploy: bật nếu muốn deploy sau mỗi lần push

Thêm trong tab **Environment**:

```env
APP_ENV=production
DATABASE_URL=<Neon pooled URL>
DATABASE_URL_UNPOOLED=<Neon direct URL, hostname không có -pooler>
DATABASE_SCHEMA=antiscam
JWT_SECRET_KEY=<random-production-secret>
OPENAI_API_KEY=<OpenAI-key>
LLM_EXPLANATION_ENABLED=true
MODEL_NAME=gpt-4o-mini
CORS_ORIGINS=https://<frontend-service>.onrender.com
```

Dockerfile đã dùng biến `PORT` của Render. `docker/entrypoint.sh` sẽ chạy `alembic upgrade head` trước khi khởi động Uvicorn.

Kiểm tra sau deploy:

```text
https://<backend-service>.onrender.com/health
https://<backend-service>.onrender.com/docs
```

### Frontend Static Site

Chọn `New → Static Site`, dùng cùng repository và cấu hình:

- Root Directory: `frontend`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- Environment variable lúc build:

```env
VITE_API_URL=https://<backend-service>.onrender.com/api
VITE_GOOGLE_CLIENT_ID=<Google OAuth 2.0 Web client ID>
```

Đặt cùng Web client ID đó làm `GOOGLE_OAUTH_CLIENT_ID` tại backend. Sau khi có
URL frontend thật, khai báo URL này trong Google Cloud Console, cập nhật lại
`CORS_ORIGINS` ở backend rồi chọn `Save, rebuild, and deploy`.

### Kiểm tra end-to-end

1. Mở frontend Render.
2. Đăng ký tài khoản và tạo PIN trong phần Tài khoản/Cài đặt.
3. Tra cứu recipient và chạy assessment.
4. Kiểm tra warning, countdown, checkbox, PIN và quyết định chuyển/hủy.
5. Nếu lỗi CORS, kiểm tra `CORS_ORIGINS` không có dấu `/` cuối URL.

Không commit `.env` hoặc secret thật. Render hỗ trợ nhập biến trong Dashboard và tự rebuild/deploy khi lưu. Xem thêm [Render Web Services](https://render.com/docs/web-services), [Docker deploys](https://render.com/docs/docker) và [Environment Variables](https://render.com/docs/configure-environment-variables).
