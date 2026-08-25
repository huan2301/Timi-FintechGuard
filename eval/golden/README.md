# Golden Dataset — Timi Anti-Scam

Bộ case **đã kiểm tra / cố định** dùng để regression và so sánh transaction risk, Guardian call, seasonal, URL safety và security login.

Khác với `eval/dataset/guardian_cases_v0.json` (dùng cho baseline agent Phase 0/1), thư mục **golden** theo chuẩn JSONL + schema chung, ưu tiên P0 map từ `eval/manual_cases.md`.

---

## Cấu trúc thư mục

```text
eval/golden/
├── README.md                 # File này
├── golden_dataset.json       # (tuỳ chọn) aggregate / export
├── schema/
│   └── case.schema.json      # JSON Schema chung mọi suite
├── transaction/
│   ├── cases.jsonl           # 9 case P0/P1 (map manual_cases 1–8 + boundary)
│   └── CHANGELOG.md
├── guardian/
│   ├── cases.jsonl
│   └── CHANGELOG.md
├── seasonal/
│   ├── cases.jsonl
│   └── CHANGELOG.md
├── url_safety/
│   └── cases.jsonl
└── security_login/
    └── cases.jsonl           # Device / geo — chủ yếu manual / e2e
```

---

## Suites

| Suite | File | Mô tả | Ghi chú |
|-------|------|--------|---------|
| **transaction** | `transaction/cases.jsonl` | Assess chuyển tiền: rule score, signal, HITL | 9 case đã seed từ manual_cases |
| **guardian** | `guardian/cases.jsonl` | Call realtime: action CONTINUE/MONITOR/PAUSE/STOP | Bổ sung song song với `eval/dataset/guardian_cases_*.json` |
| **seasonal** | `seasonal/cases.jsonl` | Mùa lễ VN (Tết, …) + stricter threshold | Forecast / campaign calendar |
| **url_safety** | `url_safety/cases.jsonl` | QR / hostname blacklist | Map `/url-safety/check` |
| **security_login** | `security_login/cases.jsonl` | Device / geo / impossible travel | Case 9 manual_cases; chạy e2e là chính |

---

## Format case (JSONL)

Mỗi dòng một JSON object. Schema: `schema/case.schema.json`.

**Bắt buộc:**

| Field | Ý nghĩa |
|-------|---------|
| `id` | ID ổn định (vd. `tx-001-safe-small`) |
| `suite` | `transaction` \| `guardian` \| `seasonal` \| `url_safety` \| `security_login` |
| `version` | Integer ≥ 1 |
| `priority` | `P0` \| `P1` \| `P2` |
| `input` | Object đầu vào (amount, note, transcript, url, …) |
| `expected` | Object kỳ vọng (xem dưới) |

**`expected` bắt buộc có:**

- `risk_level` — mảng, phần tử thuộc `low` \| `medium` \| `high`
- `min_score` / `max_score` — 0–100
- `must_signals` / `must_not_signals` — mảng tên signal

**Tuỳ suite thêm:**

- Transaction: `requires_hitl`, `allow_complete_without_hitl`
- Guardian: `action` — mảng `CONTINUE` \| `MONITOR` \| `PAUSE` \| `STOP`
- Seasonal: `season_active`, `season_id`, `stricter`
- URL: `blocked`

Ví dụ (transaction):

```json
{
  "id": "tx-001-safe-small",
  "suite": "transaction",
  "version": 1,
  "tags": ["safe", "low", "regression"],
  "priority": "P0",
  "input": {
    "amount": 50000,
    "note": "tra tien an",
    "recipient_account": "SAFE_NEW_001",
    "recipient_is_new": true,
    "recipient_trusted": false
  },
  "context": {
    "user_history": "default_low_volume",
    "blacklist": false
  },
  "expected": {
    "risk_level": ["low"],
    "min_score": 0,
    "max_score": 39,
    "must_signals": [],
    "must_not_signals": ["blacklist_exact_match", "scam_keyword"],
    "requires_hitl": false,
    "allow_complete_without_hitl": true
  },
  "notes": "Manual case 1 — GD nhỏ note bình thường"
}
```

---

## Transaction suite (đã seed)

Map từ `eval/manual_cases.md` (2026-08-20):

| ID | Ý | Expected chính |
|----|---|----------------|
| `tx-001-safe-small` | GD nhỏ, note bình thường | low, không HITL |
| `tx-002-unusual-amount` | Số tiền cao / lịch sử thấp | unusual_amount, HITL |
| `tx-003-scam-note` | Note scam keyword | scam_keyword, HITL |
| `tx-004-blacklist-exact` | Blacklist exact | blacklist_exact_match, high |
| `tx-005-trusted-ok` | Trusted recipient | giảm FP; không override blacklist |
| `tx-006-behavioral-50m` | 50M + history thấp | behavioral_amount_anomaly, new_payee |
| `tx-007-velocity` | Nhiều payee trong thời gian ngắn | transaction_velocity |
| `tx-008-police-otp-note` | Note công an + OTP | scam_keyword |
| `tx-009-boundary-low-medium` | Boundary không overblock | low/medium, không HITL bắt buộc |

Case impossible-travel (manual #9) nằm suite **security_login**, không nhét vào transaction.

---

## Liên quan dataset Guardian (Phase 0/1)

| Path | Vai trò |
|------|---------|
| `eval/dataset/guardian_cases_v0.json` | 32 case baseline agent (Phase 0/1) |
| `eval/dataset/guardian_cases_v1_extra.json` | Case bổ sung Phase 1 |
| `eval/golden/guardian/cases.jsonl` | Golden JSONL cùng schema multi-suite |

Baseline mới nhất (2026-08-23): **100%** schema / action / level / signal trên 32 case dataset — xem `eval/results/report.md` và `baseline_20260823_034947.json`.

Golden guardian JSONL dùng khi chạy runner golden thống nhất; dataset JSON dùng script `eval/scripts/run_baseline_eval.py` / `run_phase1_eval.py`.

---

## Runners

| Script | Mục đích |
|--------|----------|
| `eval/runners/validate_schema.py` | Parse JSONL + kiểm tra field bắt buộc mọi suite |
| `eval/runners/run_transaction_golden.py` | Chạy suite transaction |
| `eval/runners/run_guardian_golden.py` | Chạy suite guardian |
| `eval/runners/run_all.py` | Chạy tất cả suite có dữ liệu |

### Validate schema

```bash
# từ root repo
python eval/runners/validate_schema.py
```

Kỳ vọng: `OK transaction/cases.jsonl (N cases)` … và `All non-empty suites OK`. Suite trống được SKIP.

### Chạy golden (khi đã wire runner)

```bash
python eval/runners/run_transaction_golden.py
python eval/runners/run_guardian_golden.py
python eval/runners/run_all.py
```

Kết quả nên lưu dưới `eval/results/` (không commit secret / PII).

---

## Quy tắc bảo trì

1. **Không sửa im lặng** case đã freeze nếu đổi ý nghĩa expected — tăng `version` hoặc thêm case mới + ghi `CHANGELOG.md` trong suite.
2. Case mới: ưu tiên `priority: P0` nếu regression bắt buộc; thêm `tags` rõ (safe, blacklist, otp, …).
3. `id` ổn định xuyên git history — không đổi id chỉ để “đẹp tên”.
4. Transaction expected bám rule engine thực tế; Guardian expected bám action/signal của agent (và hybrid nếu `GUARDIAN_HYBRID=true`).
5. Sau mỗi lần đổi prompt / rule / hybrid: chạy validate + runner liên quan, cập nhật `eval/results/report.md` nếu metric đổi.

---

## Checklist nhanh (tuần cuối đề tài)

- [ ] `python eval/runners/validate_schema.py` → OK
- [ ] Transaction 9 case chạy được (hoặc map tay từ manual_cases vẫn pass)
- [ ] Guardian: dataset 32 case 100% vẫn giữ; golden guardian bổ sung nếu có
- [ ] url_safety / seasonal có ít nhất vài case P0 nếu feature demo
- [ ] CHANGELOG từng suite có ngày cập nhật gần nhất

---

## Liên kết

- `eval/manual_cases.md` — hướng dẫn chạy tay UI/Docker
- `eval/results/report.md` — metrics agent/baseline
- `eval/dataset/` — guardian cases Phase 0/1
- `docs/PHASE0_REPORT.md` / `PHASE1_IMPLEMENTATION.md`
- Root `README.md` — section Evaluation
