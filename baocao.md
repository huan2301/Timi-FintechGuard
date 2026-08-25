# Báo Cáo Các Hạng Mục Đã Bổ Sung

## 1. Database và Migration

### 1.1 Bảng `recipient_directory`

Thêm bảng nội bộ ánh xạ `account_number + bank_code -> account_name`, tách biệt hoàn toàn với blacklist và danh sách người nhận tin cậy của từng user. Bảng này do đội dự án nạp dữ liệu thủ công, **không** gọi API ngân hàng thật (`src/app/models/recipient_directory.py`).

Schema:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID (PK) | `default=uuid4` |
| `account_number` | VARCHAR(64) | NOT NULL |
| `bank_code` | VARCHAR(32) | NOT NULL |
| `account_name` | VARCHAR(255) | NOT NULL |
| `source` | VARCHAR(100) | mặc định `"internal"` |
| `is_active` | BOOLEAN | mặc định `TRUE` |
| `created_at`, `updated_at` | TIMESTAMPTZ | từ `TimestampMixin` |

Ràng buộc: `UNIQUE (account_number, bank_code)` — mỗi cặp số tài khoản + ngân hàng chỉ có một chủ tài khoản duy nhất trong directory.

### 1.2 Chuỗi migration sửa lỗi tạo nhầm schema

Ban đầu bảng bị tạo trong schema `public` thay vì schema cấu hình (`antiscam`). Đã bổ sung 4 migration nối tiếp để khắc phục dứt điểm, theo đúng thứ tự:

| Revision | Mục đích |
|---|---|
| `e0182ac925ef_add_recipient_directory.py` | Migration gốc, tạo bảng bằng `op.create_table` (phụ thuộc schema mặc định của kết nối Alembic — đây là nguyên nhân gốc gây lệch schema). |
| `a72d4e0c61b9_ensure_recipient_directory_in_target_schema.py` | Đảm bảo bảng tồn tại đúng trong `DATABASE_SCHEMA` mục tiêu. |
| `b4c1d8e7f239_create_recipient_directory_in_configured_schema.py` | Dùng `get_settings().database_schema`, tự quote tên schema và chạy `CREATE TABLE IF NOT EXISTS {schema}.recipient_directory (...)` bằng SQL thô để không phụ thuộc `search_path` mặc định của Alembic. `downgrade()` để trống vì migration gốc đã sở hữu bảng trên môi trường cài mới. |
| `f19c6a8b2d04_ensure_recipient_directory_in_app_schema.py` | Migration rà soát cuối cùng, đảm bảo mọi môi trường (kể cả DB cũ đã lỡ tạo bảng ở `public`) đều hội tụ về đúng schema ứng dụng. |

### 1.3 Alembic dùng `DATABASE_SCHEMA` và `search_path`

Cập nhật cấu hình Alembic để đọc biến `DATABASE_SCHEMA` từ settings ứng dụng thay vì hard-code, và đồng bộ `search_path` của connection với schema này trước khi chạy migration — tránh tình trạng model SQLAlchemy trỏ đúng schema nhưng Alembic lại thao tác nhầm sang `public`.

### 1.4 Hoàn thiện schema cho luồng rủi ro/cảnh báo/audit

Các bảng liên quan đã hoàn thiện đầy đủ cột và ràng buộc:

- **`transactions`** (`src/app/models/transaction.py`): `payee_account`, `payee_name`, `bank_code`, `amount` (BigInteger), `transaction_status` (`draft` → `risk_checking` → `awaiting_decision` → `processing` → `completed`/`failed`/`cancelled`, ràng buộc bằng `CheckConstraint`), `environment` (`sandbox`/`production`), index riêng cho giao dịch `completed` để tính tổng hạn mức nhanh.
- **`transaction_risk_assessments`** (`src/app/models/risk_assessment.py`): `risk_score` (Numeric 5,4, ràng buộc 0–1), `risk_level` (`safe`/`low`/`medium`/`high`), `should_warn`, `model_version`, `rules_version`, `blacklist_match_found`, `explanation`, `raw_result` (JSONB), `latency_ms`.
- **`risk_signals`**: mỗi dấu hiệu rủi ro cụ thể (`signal_type`, `severity`, `score`, `evidence` JSONB), có thể liên kết tới `blacklist` hoặc `scam_patterns` khớp.
- **`transaction_warnings`**: `warning_level` (`medium`/`high`), `title`, `message`, `transparency_reason` (lý do minh bạch tại sao cảnh báo được đưa ra), `countdown_seconds` (0–60), `user_decision` (`proceeded`/`cancelled`), `verification_confirmed`, `verification_method`.
- **`warning_feedback`**: người dùng/CSKH gắn nhãn `helpful`/`false_positive`/`confirmed_scam`/`not_helpful`/`unsure` cho từng cảnh báo, có quy trình review (`pending`/`validated`/`rejected`) — phục vụ đánh giá false positive/negative.
- **`audit_logs`** (`src/app/models/audit_log.py`): chỉ lưu metadata (`action`, `resource_type`, `resource_id`, `metadata_json`, `ip_address` kiểu `INET`, `user_agent`); bắt buộc caller phải mask dữ liệu tài khoản/số điện thoại trước khi ghi.
- **`intervention_logs`** (`src/app/models/intervention_log.py`): lưu từng bước can thiệp của agent (`agent_run_id`, `node_name`, `step_number`, `agent_message`, `user_response`, `risk_factors`, `suggested_actions` JSONB).
- **`transaction_risk_contexts`**: ngữ cảnh bảo mật ẩn danh hóa — không lưu IP/device id dạng plaintext (chỉ lưu `device_hash`, `ip_hash`), tọa độ vị trí làm tròn 2 chữ số thập phân (`geo_lat_e2`, `geo_lon_e2`) đủ để phát hiện "impossible travel" nhưng không đủ để định vị chính xác.

## 2. Tự Tra Tên Tài Khoản Nội Bộ

### 2.1 API `POST /api/v1/recipients/resolve`

File: `src/app/routers/api/recipients.py`. Endpoint yêu cầu JWT hợp lệ (`get_current_user`).

**Request** (`RecipientLookupRequest`, `src/app/schemas/recipient.py`):

```json
{
  "account_number": "0123456789",
  "bank_code": "VCB"
}
```

- `account_number`: 6–19 ký tự, tự động loại khoảng trắng, bắt buộc toàn chữ số.
- `bank_code`: 2–100 ký tự, được chuẩn hóa qua `normalize_bank_name()` (`src/app/services/bank_normalization.py`) — xử lý cả viết tắt lẫn tên đầy đủ có dấu (ví dụ `"Vietcombank"`, `"Ngân hàng Ngoại thương Việt Nam"` đều quy về `VCB`). Nếu không chuẩn hóa được → `422 Ngân hàng không hợp lệ`.
- Riêng `bank_code == TIMI`: bắt buộc số tài khoản đúng 10 chữ số (số tài khoản Timi Bank chính là số điện thoại) → sai thì `422`.

**Response** (`RecipientLookupResponse`):

```json
{
  "account_number": "0123456789",
  "bank_code": "VCB",
  "account_name": "NGUYEN VAN A",
  "source": "directory",
  "verification_token": "<jwt>"
}
```

`source` là literal một trong `directory` / `blacklist` / `trusted_recipient` / `timi`, cho biết dữ liệu tên tài khoản đến từ nguồn nào.

### 2.2 Thứ tự tra cứu (`src/app/services/recipient_lookup.py`, hàm `lookup_recipient`)

1. **Timi nội bộ** — nếu `bank_code == TIMI`, tra trực tiếp trong bảng `users` qua `find_active_timi_recipient`; nếu người dùng tự nhập chính số tài khoản của mình → chặn bằng `RecipientLookupInvalid` ("Không thể chuyển tiền vào chính tài khoản Timi của bạn.").
2. **`recipient_directory`** — khớp chính xác `account_number` + `bank_code` với `is_active = True`.
3. **`blacklist`** — quét các bản ghi `entity_type = "account"` khớp `entity_value`, xác nhận đúng ngân hàng bằng `normalize_bank_name(entry.bank)`, lấy tên từ trường `evidence` (`reported_name` hoặc `ten`).
4. **`trusted_recipients` của chính người dùng** — danh sách người nhận đã được người dùng hiện tại đánh dấu tin cậy trước đó.
5. Không khớp bất kỳ nguồn nào → raise `RecipientLookupNotFound` → API trả **404** kèm thông báo "Không tìm thấy tên tài khoản trong dữ liệu nội bộ.", **chặn không cho tiếp tục** sang bước đánh giá rủi ro (`/transactions/assess`).

Toàn bộ quá trình không có bất kỳ lệnh gọi ra ngoài (API ngân hàng thật, dịch vụ tra cứu bên thứ ba) — đúng yêu cầu sandbox.

### 2.3 Token xác minh ngắn hạn (`src/app/core/security.py`)

Sau khi resolve thành công, backend ký một JWT riêng (`create_recipient_lookup_token`) với:

- `sub`: user id
- `purpose`: `"recipient_lookup"` (phân biệt với access token thường)
- `account_number`, `bank_code`, `account_name`: đúng dữ liệu đã xác thực
- `exp`: hết hạn sau `settings.recipient_lookup_token_expire_seconds` giây (thời hạn ngắn, cấu hình được)

Khi gọi `/transactions/assess`, backend giải mã lại token bằng `decode_recipient_lookup_token`, kiểm tra `purpose` đúng, `sub` khớp đúng user hiện tại, và đủ 3 trường dữ liệu — nếu sai bất kỳ điều kiện nào sẽ raise lỗi. Nhờ vậy, **API đánh giá giao dịch không bao giờ tin tên người nhận do client tự gửi lên**, chỉ tin dữ liệu đã được backend xác thực và ký lại.

## 3. Luồng Giao Dịch và Rủi Ro

Trình tự một giao dịch, ánh xạ theo bảng dữ liệu thực tế:

1. Người dùng tạo lệnh chuyển tiền → ghi vào `transactions` với trạng thái khởi tạo (`draft`/`risk_checking`).
2. Mỗi lần hệ thống chấm điểm rủi ro tạo **một bản ghi mới** trong `transaction_risk_assessments` (không ghi đè bản cũ) — bảo toàn lịch sử rule/model đã dùng qua từng lần chấm (`model_version`, `rules_version`).
3. Từng dấu hiệu cụ thể góp phần vào điểm rủi ro được lưu riêng trong `risk_signals`, có thể trỏ tới bản ghi `blacklist` hoặc `scam_patterns` đã khớp — phục vụ giải thích minh bạch (Explainable AI) thay vì hộp đen.
4. Nếu `risk_level` là `medium` hoặc `high`, hệ thống tạo `transaction_warnings` kèm `title`, `message`, `transparency_reason`, `countdown_seconds` (đếm ngược 0–60s) để hiển thị cho người dùng.
5. Quyết định của người dùng (`proceeded`/`cancelled`) được ghi lại vào `user_decision` của `transaction_warnings`, đồng thời trạng thái `transactions.transaction_status` cập nhật tương ứng: hoàn tất → `completed` (kèm `completed_at`), hủy → `cancelled` (kèm `cancelled_at`).
6. Toàn bộ dấu vết kiểm tra và can thiệp được lưu kép:
   - `audit_logs`: log hành động ở mức hệ thống (actor, action, resource, IP/user-agent), **không lưu số tài khoản/số điện thoại trần** — caller phải mask trước khi ghi.
   - `intervention_logs`: log chi tiết từng bước hội thoại/can thiệp của agent (node nào chạy, agent nói gì, người dùng phản hồi gì, risk factors, suggested actions) — phục vụ trách nhiệm giải trình (accountability) theo đúng yêu cầu PRD.
7. Luồng hiện tại vận hành ở `environment = "sandbox"`: số dư chỉ thay đổi trong cột `users.balance` của cùng cơ sở dữ liệu demo, không có kết nối ra hệ thống thanh toán ngân hàng thật nào.

## 4. Giao Diện Chuyển Tiền

File chính: `frontend/src/pages/finance/TransferPage.tsx`.

### 4.1 Bỏ nhập tay tên người nhận

- Trường `recipient_name` trong state form không còn do người dùng gõ; nó chỉ được set tự động trong `useEffect` theo dõi `[form.recipient_account, form.bank_code]` — sau 500ms debounce, gọi `transactionsApi.lookupRecipient()` (tức API `/recipients/resolve` ở mục 2) và điền `recipient_name` + `recipient_lookup_token` vào state khi có kết quả.
- Nếu đổi số tài khoản (`handleAccountChange`) hoặc đổi ngân hàng, `recipient_name` và `recipient_lookup_token` bị xóa ngay lập tức để tránh hiển thị/tái sử dụng tên cũ không khớp dữ liệu mới.
- Có validate độ dài số tài khoản (6–19 chữ số) và điều kiện riêng cho Timi Bank (đúng 10 chữ số) ngay trên UI trước khi gọi API.
- Khi quét QR có sẵn `accountNumber`/`bankCode`, hệ thống **không tin trực tiếp** tên trong QR — vẫn xóa `recipient_name`/`recipient_lookup_token` để buộc chạy lại lookup và lấy token ký mới từ backend.

### 4.2 Bổ sung 40 `bank_code`

Danh sách ngân hàng được khai báo cứng trong `TransferPage.tsx` (biến `banks`), gồm 40 mã: `ABB, ACB, AGRIBANK, BAB, VPB, BIDV, BVB, CAKE, CIMB, CTG, EIB, GPB, HDB, HSBC, IVB, KBANK, KLB, LPB, MBB, MSB, NAB, OCB, PGB, PVCB, SCB, SCVN, SEAB, SGB, SHB, SHINHAN, STB, TCB, TIMO, TIMI, TPB, UBANK, UOB, VAB, VCB, VIB, WOORI` — bao phủ cả ngân hàng nội địa, ngân hàng số (Cake, Ubank, Timo) và chi nhánh nước ngoài tại Việt Nam (HSBC, UOB, Shinhan, Standard Chartered, Woori...), cùng `TIMI` là ngân hàng nội bộ của ứng dụng.

### 4.3 Combobox chọn ngân hàng

Thay ô chọn tĩnh bằng combobox có tìm kiếm (`isBankPickerOpen`, `bankSearch`, `bankActiveIndex`):

- `filteredBanks` lọc theo cả tên và mã ngân hàng (`${bank.name} ${bank.code}`), so khớp không phân biệt hoa/thường theo locale `vi-VN` — gõ "vietcom" hay "VCB" đều ra kết quả.
- Danh sách gợi ý xổ xuống dưới ô nhập (`handleBankFocus` mở dropdown, `handleBankSearchChange` cập nhật từ khóa và luôn mở lại dropdown khi gõ).
- `handleBankChange(bank_code)`: khi chọn một ngân hàng từ danh sách, set `form.bank_code`, đồng bộ lại `bankSearch` hiển thị đúng tên ngân hàng, đóng dropdown, và **xóa `recipient_name` + `recipient_lookup_token`** để buộc tra cứu lại.
- `handleBankSearchChange`: nếu người dùng gõ lại vào ô tìm kiếm trong khi đã có `bank_code` được chọn trước đó, hệ thống chủ động xóa luôn `bank_code`, `recipient_name`, `recipient_lookup_token` — tránh tình trạng gửi đi ngân hàng cũ trong khi ô hiển thị tên ngân hàng mới đang gõ dở.
- Có hỗ trợ chọn nhanh từ "Người nhận gần đây" (`handleSelectRecentContact`) và nút thêm liên hệ mới (`handleAddNewContact`), cả hai đều tuân theo cùng nguyên tắc xóa token cũ để đảm bảo mọi giao dịch chỉ dùng tên đã được backend xác thực lại.

## 5. Tài Liệu và Kiểm Tra

- `python -m compileall app` đã chạy thành công — xác nhận toàn bộ mã Python biên dịch được, không có lỗi cú pháp trong các file mới/sửa đổi (models, migrations, services, API routes liên quan đến `recipient_directory` và `recipients/resolve`).
- `git diff --check` không có lỗi định dạng — không còn khoảng trắng cuối dòng hay xung đột merge sót lại trong diff của các thay đổi trên.
