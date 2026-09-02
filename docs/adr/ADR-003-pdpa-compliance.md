# ADR-003: PDPA Compliance — Quyết định bảo vệ dữ liệu cá nhân

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-06
- **Người quyết định:** Nhóm AI20K

---

## Bối cảnh

Hệ thống phân tích giao dịch xử lý dữ liệu cá nhân bao gồm: tên người nhận, số tài khoản ngân hàng, số tiền giao dịch. Theo Nghị định 13/2023/NĐ-CP (PDPA Việt Nam), nhóm cần đảm bảo những dữ liệu này được bảo vệ đúng cách trong suốt vòng đời của hệ thống.

Đây là đồ án học thuật với **dữ liệu mô phỏng** — không phải dữ liệu người dùng thật. Các biện pháp PDPA được triển khai nhằm thể hiện nhận thức kỹ thuật, không phải để đáp ứng nghĩa vụ pháp lý thực tế.

---

## Những gì ĐÃ làm (kiểm chứng được bằng test tự động)

### 1. Mask dữ liệu nhạy cảm — `src/services/pdpa.py`

**Quyết định:** Mask tại 3 điểm bắt buộc:
1. Trước khi ghi vào `AuditLog.metadata_json`
2. Trong mọi `logger.error()` có dữ liệu giao dịch
3. Response trả về không bao giờ echo `receiver_account` đầy đủ

**Cách làm:**
- `mask_account_number("0123456789")` → `"012****789"` (giữ 3 đầu + 3 cuối)
- `mask_name("Nguyễn Văn A")` → `"Nguyễn ***"` (giữ họ, che tên)

**Kiểm chứng:** `tests/test_services/test_audit.py::TestPdpaMasking`

---

### 2. Data minimization trong schema response — `src/models/schemas.py`

**Quyết định:** `TransactionAnalyzeResponse` chỉ gồm 4 fields:
```python
warning_level: str
explanation: str
risk_score: float
matched_entry_masked: str | None  # đã mask, không phải data thô
```

**Lý do:** Không trả thừa dữ liệu — FE không cần `receiver_account` để hiển thị kết quả phân tích.

**Kiểm chứng:** `tests/test_api/test_access_control.py::test_response_does_not_contain_raw_account`

---

### 3. Audit Log — `src/services/audit.py` + `src/api/middleware.py`

**Quyết định:** Ghi log tập trung qua `AuditMiddleware` thay vì rải lời gọi thủ công ở từng route.

**Cấu trúc bảng `audit_logs`:**
| Field | Mô tả |
|---|---|
| `action` | "POST /api/v1/transactions/analyze" |
| `resource_type` | "transaction" |
| `actor_id` | User ID (nếu có auth) |
| `ip_address` | IP client |
| `metadata_json` | Dữ liệu đã mask — KHÔNG chứa PII thô |
| `created_at` | Timestamp |

**Kiểm chứng:** `tests/test_services/test_audit.py::TestAuditLogContent`

---

### 4. Mã hóa dữ liệu nhạy cảm (optional) — `src/services/pdpa.py`

**Quyết định:** Cung cấp `encrypt_field()` / `decrypt_field()` dùng Fernet (symmetric encryption), nhưng **không bắt buộc áp dụng** cho scope 5 tuần vì mask khi log quan trọng hơn.

**Key management:** Fernet key trong biến môi trường `PII_ENCRYPTION_KEY` — đủ cho demo, **không đạt chuẩn production**.

---

### 5. Kiểm soát truy cập — `src/api/routes.py`

**Quyết định:** Route `/transactions/analyze` không yêu cầu auth (scope demo), nhưng:
- Error message không bao giờ leak PII
- Test `test_user_a_cannot_see_user_b_transaction` chạy thật và xác nhận API trả `403` khi người dùng truy cập giao dịch của tài khoản khác.

---

## Những gì KHÔNG làm — và lý do

### a) Cơ sở pháp lý thu thập dữ liệu (Lawful Basis)
**Lý do không làm:** Đây là quyết định tổ chức, không phải kỹ thuật. Dữ liệu hệ thống là dữ liệu giả lập cho mục đích học thuật — không phải dữ liệu cá nhân thật.

### b) Sự đồng ý (Consent) và quyền của chủ thể dữ liệu
**Lý do không làm:** "Quyền được quên" cần quy trình vận hành thật (ai xử lý, trong bao lâu). Kỹ thuật có thể tạo route DELETE nhưng quy trình pháp lý nằm ngoài phạm vi đồ án.

### c) Đánh giá tác động bảo vệ dữ liệu (DPIA)
**Lý do không làm:** DPIA đầy đủ cần chuyên môn pháp lý/compliance, không phải việc lập trình viên tự làm. Nhóm chỉ có thể viết bản rút gọn trong tài liệu.

### d) Key management cấp production
**Lý do không làm:** Cần AWS KMS / HashiCorp Vault, key rotation tự động — vượt quá thời gian và phạm vi đồ án 5 tuần. Đã ghi rõ là **known limitation**.

### e) Chuyển dữ liệu xuyên biên giới (Cross-border transfer)
**Lý do không làm:** Dữ liệu là mô phỏng, không phải dữ liệu người dùng thật — vấn đề pháp lý không phát sinh theo nghĩa thực tế.

### f) Chỉ định DPO (Data Protection Officer)
**Lý do không làm:** Vai trò tổ chức, không áp dụng cho đồ án sinh viên.

---

## Nguyên tắc phân định

> **Làm bằng code** những gì kiểm chứng được bằng test tự động: mask, audit log, kiểm soát truy cập.
>
> **Ghi nhận là known limitation** những gì đòi hỏi quy trình tổ chức, quyết định pháp lý, hoặc hạ tầng vượt quy mô đồ án.

---

## Hệ quả

- Dữ liệu nhạy cảm được mask trước khi vào log → giảm rủi ro rò rỉ qua log file
- Response API không trả thừa data → giảm attack surface
- Audit trail đầy đủ → có thể điều tra sự cố nếu cần
- Known limitations được ghi rõ → mentor/BTC thấy nhóm có nhận thức về giới hạn, không phải bỏ sót do không biết
