# Phase 2 — Hierarchical Multi-Agent / Bank Risk Manager

**Mục tiêu:** Xuất hiện **Bank Risk Manager Agent** đứng trên các specialist; backend chỉ thực thi sau khi validate khuyến nghị của Manager.

**Nguyên tắc bất biến (giữ từ Phase 0/1):**
1. LLM **không** có tool thực thi (transfer, khóa TK, sửa DB)
2. Fail-closed
3. Mọi đổi agent có số liệu trước/sau
4. Ưu tiên giảm false negative
5. Tiếng Việt + kịch bản scam VN
6. Backend + HITL là quyền lực cuối

**Repo:** `ngovan15121977-bit/Anti-Scam-Demo` · Branch: `tuananh-dev-rieng`

---

## 0. Bối cảnh sau Phase 0/1

| Thành phần hiện có | Vai trò trong Phase 2 |
|--------------------|------------------------|
| Transaction rule engine + HITL | → **Transaction Risk Specialist** (input có cấu trúc) |
| Guardian Agent (prompt v0.3, hybrid) | → **Call Guardian Specialist** |
| Telemetry / device / velocity signals | → một phần **Behavior Profiler** |
| Audit / signals / Mini Timi | → **Evidence & Explanation** + UI |

Phase 2 **không** thay Guardian/Transaction bằng Manager một mình — Manager **tổng hợp** output specialist rồi đưa khuyến nghị thống nhất.

---

## 1. Kiến trúc mục tiêu

```text
                    ┌─────────────────────────────┐
                    │   Bank Risk Manager Agent   │
                    │  (tư duy quản lý, không tool)│
                    └──────────────┬──────────────┘
           structured summary in   │   recommendation out
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
┌───────────────┐      ┌────────────────────┐      ┌─────────────────────┐
│ Call Guardian │      │ Transaction Risk   │      │ Behavior Profiler   │
│  Specialist   │      │    Specialist      │      │    Specialist       │
└───────────────┘      └────────────────────┘      └─────────────────────┘
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │ Evidence & Explanation      │
                    │ Specialist (optional node)  │
                    └─────────────────────────────┘
                                   │
                                   ▼
                    Backend validate → HITL / STOP / allow
```

| Agent | Input chính | Output chính |
|-------|-------------|--------------|
| **Call Guardian Specialist** | Transcript / session risk timeline | action, score, level, signals, confidence |
| **Transaction Risk Specialist** | Amount, note, payee, rules, HITL state | risk_level, score, signals, requires_hitl |
| **Behavior Profiler Specialist** | History, velocity, device/geo, trusted | anomaly flags, profile summary |
| **Evidence & Explanation** | Outputs 3 specialist trên | evidence pack ngắn, “why” cho user/audit |
| **Bank Risk Manager** | Structured packs từ specialists | **khuyến nghị cuối**: action đề xuất, confidence, lý do quản lý, thiếu gì |

---

## 2. Hai tầng thời gian

### Tầng A — Tuần 6 đề tài (Phase 2 **nhẹ**, bắt buộc tối thiểu nếu còn giờ)

| # | Việc | Deliverable | Ước lượng |
|---|------|-------------|-----------|
| A1 | Schema giao tiếp Manager ↔ Specialist (JSON) | `docs/phase2/manager_schema.md` + `schemas/manager_recommendation.json` | 0.5–1 ngày |
| A2 | System prompt Manager (tư duy quản lý VN) | `prompts/manager_v0.1.yaml` | 0.5 ngày |
| A3 | Mock 1 vòng: 2–3 specialist **fake structured input** → Manager → khuyến nghị | Script `eval/scripts/run_manager_mock.py` hoặc notebook | 1 ngày |
| A4 | Tài liệu 1 trang trong README / ROADMAP | Link Phase 2 | 0.5 ngày |

**Không bắt buộc tuần 6:** LangGraph multi-node production, self-ask thật, Behavior Profiler đầy đủ, wire WebSocket.

### Tầng B — Đầy đủ 3–4 tuần (sau đề tài)

| Tuần | Focus | DoD |
|------|--------|-----|
| **B1** | Schema + Manager prompt + mock end-to-end | Manager nhận JSON chuẩn, output validate được |
| **B2** | Wire 2 specialist thật (Guardian + Transaction) | 1 API/internal function gọi Manager khi có cả call + tx context |
| **B3** | Behavior Profiler + Evidence node; self-ask 1 vòng | Manager hỏi lại khi thiếu evidence; log audit |
| **B4** | Eval set Manager + so sánh vs specialist-only; UI tóm tắt “lý do quản lý” | Metric Phase 2 đạt mục tiêu tối thiểu |

---

## 3. Công việc chi tiết (Tầng B)

### B1 — Schema & Manager foundation (tuần 1 Phase 2)

**3.1 Schema giao tiếp (bắt buộc thống nhất)**

```json
{
  "request_id": "uuid",
  "context": {
    "user_id_hash": "...",
    "session_type": "call_only | tx_only | call_and_tx",
    "locale": "vi"
  },
  "specialists": {
    "call_guardian": {
      "available": true,
      "risk_score": 0,
      "risk_level": "low|medium|high",
      "recommended_action": "CONTINUE|MONITOR|PAUSE|STOP",
      "signals": [],
      "decision_confidence": 0.0,
      "summary": "1-3 câu"
    },
    "transaction_risk": {
      "available": true,
      "risk_score": 0,
      "risk_level": "low|medium|high",
      "signals": [],
      "requires_hitl": true,
      "summary": "1-3 câu"
    },
    "behavior_profiler": {
      "available": false,
      "anomalies": [],
      "summary": ""
    }
  },
  "manager_output": {
    "recommended_action": "CONTINUE|MONITOR|PAUSE|STOP",
    "confidence": 0.0,
    "rationale": "giải thích mức quản lý",
    "evidence_used": ["call_guardian.otp_request", "transaction_risk.blacklist_exact_match"],
    "missing_info": [],
    "escalate_to_human": false
  }
}
```

**3.2 System prompt Manager — khung tư duy bắt buộc**

Manager phải trả lời (trong JSON / structured):

1. Tình huống hiện tại là gì?  
2. Bằng chứng mạnh / yếu từ từng specialist?  
3. Kịch bản xấu nhất nếu cho CONTINUE?  
4. Còn thiếu thông tin gì? (→ `missing_info` / self-ask)  
5. Mức tin cậy (`confidence`) và hành động đề xuất  

**3.3 Deliverable B1**

- [ ] `prompts/manager_v0.1.yaml`  
- [ ] JSON Schema validate `manager_output`  
- [ ] Mock runner: 5–10 case cố định (call-only, tx-only, cả hai, mâu thuẫn specialist)  
- [ ] Không wire production

---

### B2 — Hai specialist thật + Manager (tuần 2)

| Việc | Chi tiết |
|------|----------|
| Adapter Guardian | Map output Phase 1 → `specialists.call_guardian` |
| Adapter Transaction | Map rule engine / assess API → `specialists.transaction_risk` |
| Orchestrator | Hàm `run_manager(context)` — **không** LangGraph phức tạp ngay; có thể sequential |
| Backend gate | Chỉ áp dụng action sau `validate(manager_output)` + policy fail-closed |
| Conflict policy | Guardian STOP vs Transaction low → Manager ưu tiên **max severity** (giảm FN) |

**Metric sớm:** trên bộ case mâu thuẫn, Manager không “trung bình hóa” nguy hiểm thành CONTINUE.

---

### B3 — Profiler + Evidence + self-ask (tuần 3)

| Việc | Chi tiết |
|------|----------|
| Behavior Profiler v0 | Rule-based trước (velocity, new device, amount vs history) — **chưa** cần LLM |
| Evidence Specialist | Gộp `evidence_used` + câu giải thích user-facing (VN) |
| Self-ask (1 vòng) | Nếu `missing_info` non-empty → gọi lại 1 specialist với câu hỏi hẹp → Manager quyết định lần 2 |
| Audit | Lưu manager_output + specialist packs (không PII thô) |

**Giới hạn self-ask:** tối đa 1 vòng / request; timeout → fail-closed PAUSE/STOP theo policy.

---

### B4 — Eval + UI + ổn định (tuần 4)

| Việc | Chi tiết |
|------|----------|
| Dataset Manager | ≥ 20–40 case: đồng thuận / mâu thuẫn / thiếu evidence / progressive call+tx |
| So sánh | Specialist-only action vs Manager action (agreement, FN/FP) |
| UI | Mini Timi hoặc panel: “Khuyến nghị quản lý” + rationale ngắn |
| Docs | `docs/PHASE2_REPORT.md` + cập nhật README |

---

## 4. Metric thành công Phase 2

| Metric | Target |
|--------|--------|
| Schema Manager OK | ≥ 95% trên eval set |
| Khuyến nghị nhất quán hơn specialist đơn lẻ | Trên case mâu thuẫn: giảm CONTINUE sai (FN) so với lấy min severity |
| Giải thích mức quản lý | ≥ 80% case có `rationale` không chỉ liệt kê signal thô (chấm tay / rubric) |
| Self-ask | Khi thiếu evidence, `missing_info` khác rỗng và có vòng hỏi lại hoặc escalate |
| Safety | 0 lần Manager tự ý transfer / sửa DB; mọi action qua backend validate |
| Latency | Theo dõi; chấp nhận cao hơn Phase 1 nếu multi-call — ghi P50/P95 |

---

## 5. Cấu trúc thư mục đề xuất

```text
prompts/
  manager_v0.1.yaml
  specialists/          # optional
src/app/
  services/
    risk_manager/
      schema.py
      orchestrator.py
      manager_agent.py
      adapters/
        guardian.py
        transaction.py
        behavior.py
docs/
  PHASE2_ROADMAP.md     # file này
  phase2/
    manager_schema.md
eval/
  dataset/
    manager_cases_v0.json
  scripts/
    run_manager_mock.py
    run_manager_eval.py
```

---

## 6. Thứ tự làm việc khuyến nghị (checklist)

### Tuần 6 đề tài (nếu còn thời gian)

- [ ] A1 Schema JSON + 1 trang mô tả  
- [ ] A2 `prompts/manager_v0.1.yaml`  
- [ ] A3 Mock 5 case → in khuyến nghị  
- [ ] A4 Link từ README / ROADMAP  

### Sau đề tài — B1

- [ ] Freeze schema v0  
- [ ] Manager prompt + validate  
- [ ] Mock runner + 10 case  

### B2

- [ ] Adapter Guardian + Transaction  
- [ ] Orchestrator sequential  
- [ ] Conflict policy max-severity  
- [ ] Backend validate gate  

### B3

- [ ] Behavior Profiler rule-based  
- [ ] Evidence pack  
- [ ] Self-ask 1 vòng + audit  

### B4

- [ ] Eval set + report  
- [ ] UI rationale  
- [ ] PHASE2_REPORT.md  

---

## 7. Rủi ro & cách tránh

| Rủi ro | Cách tránh |
|--------|------------|
| Manager “trung bình” hai specialist → bỏ lọt STOP | Policy: max severity; STOP từ Guardian không bị hạ |
| Latency x3–x4 | Cache specialist; chỉ gọi Manager khi `call_and_tx` hoặc score > ngưỡng |
| Prompt Manager lan man | JSON schema chặt + max_tokens + few-shot quản lý VN |
| Scope phình | Tuần 6 chỉ mock; Behavior LLM để sau |
| Trùng code Guardian | Adapter mỏng, không copy logic score |

---

## 8. Liên kết

| File | Nội dung |
|------|----------|
| `docs/PHASE1_IMPLEMENTATION.md` | Phase 1 đã đạt 100% metric |
| `ROADMAP.md` | Lịch 6 tuần (Phase 2 nhẹ tuần 6) |
| `prompts/README.md` | Versioning — thêm `manager_v0.1` khi có |
| `eval/results/report.md` | Baseline Guardian |
| `ARCHITECTURE.md` | Cập nhật sơ đồ khi wire Manager |

---

**Chốt:** Phase 0/1 **xong về chất lượng Guardian**. Phase 2 bắt đầu bằng **schema + prompt Manager + mock**; production hierarchical chỉ sau khi mock và policy an toàn (max severity, validate backend) đã rõ.
