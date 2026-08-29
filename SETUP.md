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

# AI trong Timi dùng Groq qua OpenAI-compatible API; chỉ backend được đọc các khóa này.
GROQ_API_KEY=<groq-api-key>
GROQ_MODEL_NAME=openai/gpt-oss-20b
CHAT_AGENT_API_KEY=<groq-chat-key-hoac-de-trong-de-dung-GROQ_API_KEY>
CHAT_AGENT_BASE_URL=https://api.groq.com/openai/v1
CHAT_AGENT_MODEL=openai/gpt-oss-20b

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
GROQ_API_KEY=<Groq-key>
GROQ_MODEL_NAME=openai/gpt-oss-20b
CHAT_AGENT_API_KEY=<Groq-chat-key, co the dung cung GROQ_API_KEY>
CHAT_AGENT_BASE_URL=https://api.groq.com/openai/v1
CHAT_AGENT_MODEL=openai/gpt-oss-20b
CLOUDINARY_CLOUD_NAME=<Cloudinary-cloud-name>
CLOUDINARY_API_KEY=<Cloudinary-api-key>
CLOUDINARY_API_SECRET=<Cloudinary-api-secret>
CORS_ORIGINS=https://<frontend-service>.onrender.com
```

`GROQ_*`, `CHAT_AGENT_*` và `CLOUDINARY_*` phải được nhập trực tiếp trong
Environment của backend Render. File `.env` ở máy local không được tự động
đưa lên Render; app Android cũng không được chứa các secret này.

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
VITE_PUBLIC_WEB_URL=https://<frontend-service>.onrender.com
```

`VITE_PUBLIC_WEB_URL` là origin public chuẩn của frontend (không có path), chỉ
cần khi muốn dùng một custom domain cố định. Nếu không đặt biến này, QR tự lấy
origin đang mở: chạy localhost sẽ ra localhost, còn web deploy sẽ ra domain
deploy. Sau khi đổi biến này cần **Save, rebuild, and deploy** để Vite đóng gói
URL mới vào bundle.

Đặt cùng Web client ID đó làm `GOOGLE_OAUTH_CLIENT_ID` tại backend. Sau khi có
URL frontend thật, khai báo URL này trong Google Cloud Console, cập nhật lại
`CORS_ORIGINS` ở backend rồi chọn `Save, rebuild, and deploy`.

#### Google Login trên Render

Lưu ý: `server.headers` trong `frontend/vite.config.ts` chỉ áp dụng cho Vite
dev server, không áp dụng cho Render Static Site. Trong Render Dashboard, mở
frontend Static Site → **Settings → Headers** và thêm:

```text
Path: /*
Name: Cross-Origin-Opener-Policy
Value: same-origin-allow-popups

Path: /*
Name: Referrer-Policy
Value: no-referrer-when-downgrade
```

Trong Google Cloud Console → **APIs & Services → Credentials** → Google OAuth
2.0 Web client → **Authorized JavaScript origins**, thêm đúng origin frontend
Render, ví dụ:

```text
https://<frontend-service>.onrender.com
```

Không thêm `/login`, `/dashboard` hoặc dấu `/` cuối URL. Nếu có custom domain,
thêm cả origin custom domain. Origin được khai báo phải là URL người dùng mở
trang đăng nhập, không phải URL backend API.

Sau đó kiểm tra Environment của frontend có `VITE_GOOGLE_CLIENT_ID`, backend có
`GOOGLE_OAUTH_CLIENT_ID` và hai giá trị là cùng một Web client ID; chọn **Save,
rebuild, and deploy** để Vite đóng gói lại biến môi trường.

Nếu deploy bằng root `Dockerfile` hoặc `frontend/Dockerfile` thay vì Static
Site, hai response header trên đã được thêm tương ứng vào FastAPI/Nginx.

### Kiểm tra end-to-end

1. Mở frontend Render.
2. Đăng ký tài khoản và tạo PIN trong phần Tài khoản/Cài đặt.
3. Tra cứu recipient và chạy assessment.
4. Kiểm tra warning, countdown, checkbox, PIN và quyết định chuyển/hủy.
5. Nếu lỗi CORS, kiểm tra `CORS_ORIGINS` không có dấu `/` cuối URL.

Không commit `.env` hoặc secret thật. Render hỗ trợ nhập biến trong Dashboard và tự rebuild/deploy khi lưu. Xem thêm [Render Web Services](https://render.com/docs/web-services), [Docker deploys](https://render.com/docs/docker) và [Environment Variables](https://render.com/docs/configure-environment-variables).

## 10. Phát triển ứng dụng Android

Ứng dụng React Native/Expo nằm trong thư mục `mobile`. App dùng chung backend,
database và tài khoản với website; không tạo backend riêng cho Android.

### Chuẩn bị

- Node.js 22 LTS, tối thiểu `22.13.x` cho Expo SDK 57. Trên Windows nên dùng
  Node 22 thay vì Node 24 để tránh lỗi bàn phím ở prompt của EAS CLI.
- Điện thoại Android cài Expo Go, hoặc Android Studio nếu dùng emulator.
- Backend Render đang hoạt động qua HTTPS.
- Tài khoản Expo khi cần build APK/AAB bằng EAS.

Tạo cấu hình local:

```powershell
cd mobile
Copy-Item .env.example .env.local
```

Sửa `.env.local`:

```env
EXPO_PUBLIC_API_URL=https://<backend-service>.onrender.com/api
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Google OAuth Web client ID>
```

Biến bắt đầu bằng `EXPO_PUBLIC_` sẽ được đóng gói vào app, vì vậy không đặt
secret backend, private key hoặc mật khẩu vào các biến này.

### Chạy trên điện thoại Android

```powershell
cd mobile
npm ci
npx expo start --clear
```

Mở Expo Go và quét QR trong terminal. Điện thoại và máy tính nên dùng cùng mạng.
Trong development, màn đăng nhập có nút **Xem nhanh bản thiết kế** để xem toàn bộ
giao diện mà không cần tài khoản thật.

Nếu dùng Android Emulator và backend local, app mặc định truy cập:

```text
http://10.0.2.2:8000/api
```

Nếu dùng điện thoại thật với backend local, đặt IP LAN của máy tính:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000/api
```

Không dùng `localhost` trên điện thoại vì địa chỉ đó trỏ tới chính điện thoại.
Chạy backend bằng:

```powershell
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Google Login native trên Android

Google Login native không dùng `Authorized JavaScript origins` và không chạy
được trong Expo Go. Thực hiện theo thứ tự sau:

1. Google Cloud Console → **APIs & Services → Credentials**.
2. Tạo OAuth Client loại **Android**.
3. Package name: `com.timi.app`.
4. Thêm SHA-1 của Android keystore dùng để ký app.
5. Giữ OAuth Client loại **Web** hiện tại cho backend. Giá trị này phải trùng
   `GOOGLE_OAUTH_CLIENT_ID` trên Render và `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   trong app để backend xác minh `idToken`.

Sau khi có cấu hình Google, cài module native:

```powershell
cd mobile
npx expo install @react-native-google-signin/google-signin
```

Thêm `@react-native-google-signin/google-signin` vào mảng `plugins` trong
`mobile/app.json`, tạo development build, rồi cấu hình:

```ts
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

await GoogleSignin.hasPlayServices();
const response = await GoogleSignin.signIn();
// Gửi response.data.idToken tới POST /api/v1/auth/google.
```

Hàm gửi credential tới backend đã được chuẩn bị tại
`mobile/src/services/auth.ts` (`loginWithGoogleCredential`).

### Build APK để cài thử

Tạo hoặc liên kết dự án Expo/EAS lần đầu:

```powershell
cd mobile
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest init
npx eas-cli@latest project:info
```

Khi `eas init` hỏi tài khoản sở hữu, chọn tài khoản cá nhân hoặc team phù hợp,
sau đó chọn `Y` để Expo tự tạo project. Dự án hiện tại đã được liên kết với
`@huanziis-team/timi`; `projectId` nằm trong `mobile/app.json`, vì vậy không cần
chạy lại `eas init` trên máy này.

Với build cloud, cấu hình `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` trong môi trường
`preview` và `production` trên Expo EAS. Không upload `.env.local`; EAS sẽ đưa
biến public này vào APK/AAB trong lúc build. Profile `preview` và `production`
đã trỏ tới backend Render trong `mobile/eas.json`.

Tạo APK cài thử:

```powershell
cd mobile
npx eas-cli@latest build --platform android --profile preview --non-interactive
```

Profile `preview` trong `mobile/eas.json` tạo APK có thể tải trực tiếp về điện
thoại. Ở lần build Android đầu tiên, chọn `Y` khi EAS hỏi tạo keystore; EAS sẽ
lưu keystore từ xa và tự dùng lại cho các bản cập nhật. Với module Google native,
dùng profile `development` trong quá trình lập trình:

Project hiện tại đã có project ID và keystore nên dùng `--non-interactive` để
bỏ qua các prompt xác nhận. Nếu cần chạy tương tác, dùng Node 22 LTS; tại câu hỏi
`(Y/n)`, chỉ nhấn `Enter` để chọn mặc định Yes hoặc gõ `y` rồi nhấn `Enter`.

```powershell
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

### Build AAB cho Google Play

```powershell
cd mobile
npx eas-cli@latest build --platform android --profile production
```

Profile production tạo Android App Bundle (`.aab`). Trước khi phát hành cần có
tài khoản Google Play Console, chính sách quyền riêng tư, ảnh chụp màn hình,
data-safety form và tăng version code cho mỗi bản cập nhật.

### Kiểm tra trước khi build

```powershell
cd mobile
npx tsc --noEmit
npx expo-doctor
npx expo export --platform android
```

Các file mobile chính:

- `mobile/src/app`: màn hình và điều hướng Expo Router.
- `mobile/src/services`: kết nối API, auth và giao dịch.
- `mobile/src/stores/auth-store.ts`: phiên đăng nhập và demo mode.
- `mobile/src/app/verify-transfer.tsx`: màn xác minh riêng và popup kết quả chuyển tiền.
- `mobile/src/constants/banks.ts`: danh sách ngân hàng dùng chung với luồng chuyển tiền.
- `mobile/src/components/ui.tsx`: hệ thống giao diện dùng chung.
- `mobile/app.json`: package name, camera, icon và splash screen.
- `mobile/eas.json`: cấu hình APK/AAB.
