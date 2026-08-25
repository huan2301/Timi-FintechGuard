# Manual evaluation evidence

Chạy các case này trên **Docker** với tài khoản **test**, không dùng dữ liệu thật.

- Transaction score do **rule engine** quyết định; bật `LLM_EXPLANATION_ENABLED=true` chỉ để xem explanation LLM (không được đổi điểm).
- Guardian call: dùng `GUARDIAN_PROMPT_VERSION=0.3` (khuyến nghị) và tuỳ chọn `GUARDIAN_HYBRID=true`.
- Case transaction đã map sang golden: `eval/golden/transaction/cases.jsonl` (`tx-001` … `tx-009`).
- Case impossible-travel → suite `security_login` (golden), không nằm trong transaction JSONL.

---

## A. Transaction risk (UI)

| # | Golden ID | Input | Output cần ghi nhận |
|---|-----------|--------|---------------------|
| 1 | `tx-001-safe-small` | Người nhận mới, 50.000 VND, note bình thường | `safe`/`low`, không blacklist signal, vẫn yêu cầu PIN; không HITL |
| 2 | `tx-002-unusual-amount` | Người nhận mới, số tiền cao hơn lịch sử (vd. 20.000.000) | `medium`/`high`, signal `unusual_amount`, xuất hiện HITL |
| 3 | `tx-003-scam-note` | Note `phi mo khoa`, `chuyen gap`, giữ bí mật | `medium`/`high`, `scam_keyword` / suspicious pattern, không chuyển ngay |
| 4 | `tx-004-blacklist-exact` | Tài khoản exact blacklist match | `high`, `blacklist_exact_match`, warning có source/evidence |
| 5 | `tx-005-trusted-ok` | Recipient trusted, note bình thường | Giảm false positive; **trusted không override** exact blacklist |
| 6 | `tx-006-behavioral-50m` | ≥ 3 GD ~500.000 VND / 90 ngày; chuyển **50.000.000** cho người nhận mới | `behavioral_amount_anomaly` + `new_payee`; `high`, HITL |
| 7 | `tx-007-velocity` | 9 GD → 9 người nhận khác nhau trong 5 phút, rồi GD thứ 10 người nhận mới | `transaction_velocity`; `high`, không chuyển thẳng |
| 8 | `tx-008-police-otp-note` | Note: `công an yêu cầu mã OTP để hoàn tiền` | `scam_keyword`, evidence category tương ứng; cảnh báo theo tổng score |
| 9 | `tx-009-boundary-low-medium` | GD trung bình (vd. 3.000.000), note bình thường, người nhận mới | Boundary: `low`/`medium`, không overblock, không bắt buộc HITL |

### Case security / device (manual e2e)

| # | Suite | Input | Output cần ghi nhận |
|---|-------|--------|---------------------|
| 10 | `security_login` | Đăng nhập Hà Nội → cấp vị trí Hà Nội. Đăng xuất. Trong **&lt; 15 phút** mô phỏng vị trí Campuchia (Chrome DevTools → Sensors) **và** đổi device ID trong Local Storage, rồi login lại | Bắt buộc màn xác nhận vị trí; không vào trang chức năng khi chưa cấp quyền; audit login có `new_device` và `impossible_travel` khi đủ điều kiện |

**Privacy case 10:** Chỉ cấp vị trí trên tài khoản test. DB chỉ được có `device_hash`, `ip_hash`, `geo_lat_e2`, `geo_lon_e2` — **không** lưu device ID/IP gốc hoặc tọa độ chính xác.

---

## B. Scam Call Guardian (realtime / offline)

Chạy offline bằng dataset hoặc golden; chạy tay bằng mic sau khi login + cấp microphone.

| # | Tình huống (tóm tắt transcript) | Expected action (hướng) | Ghi chú |
|---|----------------------------------|-------------------------|---------|
| G1 | Giao hàng / bạn bè hỏi thăm | CONTINUE | Safe negative |
| G2 | Ngân hàng gọi thật, **không** yêu cầu OTP / chuyển tiền | CONTINUE hoặc MONITOR nhẹ | Không over-react |
| G3 | Tự xưng bank + urgency + dọa khóa tài khoản | PAUSE / STOP | account_lock + authority |
| G4 | Yêu cầu OTP / mã bảo mật rõ | STOP | `otp_request` |
| G5 | Công an giả + đe dọa khởi tố + chuyển tiền | STOP | authority + legal + money |
| G6 | “Tài khoản an toàn” + yêu cầu chuyển gấp | STOP hoặc PAUSE cao | safe-account pattern |
| G7 | Remote access (AnyDesk / TeamViewer) | STOP | remote_access |

**Offline (dataset Phase 0/1 — đã đạt 100% trên 32 case):**

```bash
export GUARDIAN_PROMPT_VERSION=0.3
export GROQ_API_KEY=...
python eval/scripts/run_baseline_eval.py
# hoặc
python eval/scripts/run_phase1_eval.py --dataset eval/dataset/guardian_cases_v0.json --mode agent
python eval/scripts/run_phase1_eval.py --dataset eval/dataset/guardian_cases_v0.json --mode hybrid
```

**Golden validate:**

```bash
python eval/runners/validate_schema.py
```

Latest metrics: xem `eval/results/report.md` và `baseline_20260823_034947.json` (Schema/Action/Overall **100%**, avg latency ~9.1s).

---

## Quy trình ghi output thực tế (transaction / e2e)

1. `docker compose -f docker-compose.dev.yml up -d --build`
2. Đăng ký tài khoản test + tạo PIN tại `/setup-pin` (và Face ID nếu test GD lớn)
3. Thực hiện từng case trong UI theo bảng A / case 10
4. Lưu response JSON hoặc screenshot đã **che** account, email, token, key vào `eval/results/`
5. Ghi: `risk_level`, `risk_score`, `signals`, `requires_hitl` / quyết định user, `llm_used` (nếu có), latency, kết quả cuối (completed / cancelled)

### Guardian tay (mic)

1. Login → cấp mic → để Guardian chạy nền (MainLayout)
2. Nói hoặc phát audio gần microphone theo G1–G7
3. Ghi: transcript (nếu consent), `recommended_action`, `risk_score`, `risk_level`, signals, `decision_confidence`, nguồn agent/hybrid

---

## Automated tests (rule / agent unit)

```bash
# từ root repo
python -m pytest tests/test_agents -q
# Kỳ vọng: các test weak-signal, high-risk hai strong signals,
# trusted-recipient FP guard, exact blacklist, policy promotion — pass

# Phase 1 normalize + hybrid (khi có file)
pytest tests/test_guardian_normalize.py -q
```

Smoke canonical (không phụ thuộc DB) thường gồm Timi ledger, risk rules/behavior, URL blacklist, blacklist policy, assistant scope — xem root `README.md` mục Kiểm thử.

---

## Liên kết

| Path | Vai trò |
|------|---------|
| `eval/golden/transaction/cases.jsonl` | Golden tx-001 … tx-009 |
| `eval/golden/README.md` | Mô tả multi-suite + schema |
| `eval/dataset/guardian_cases_v0.json` | 32 case baseline agent |
| `eval/results/report.md` | Metrics tổng hợp |
| `eval/manual_cases.md` | File này |
| `docs/PHASE1_IMPLEMENTATION.md` | Checklist Phase 1 |
| `ROADMAP.md` / `JOURNAL.md` | Lịch 6 tuần |

---

## Checklist nhanh trước demo

- [ ] Case 1–5 transaction: safe / unusual / keyword / blacklist / trusted
- [ ] Case 6–8: behavioral / velocity / OTP note
- [ ] Case 10: location + device (audit hash only)
- [ ] Guardian: ít nhất 1 safe CONTINUE + 1 STOP (OTP hoặc công an giả)
- [ ] Không lộ PII trong file lưu `eval/results/`
