# FIN-19: AI Agent Chống Lừa Đảo & Cảnh Báo Giao Dịch Rủi Ro Cho Người Dùng Ví Điện Tử

*Phân tích theo hội đồng: Senior PM · AI Solution Architect · Business Analyst · UX Researcher · Technical Lead · Mentor Vingroup/VinUni AI Build*

---

## PHẦN 1. TÓM TẮT ĐỀ BÀI

**Đề bài, nói đơn giản:** Xây một AI Agent đứng "canh" ngay tại thời điểm người dùng ví điện tử chuẩn bị chuyển tiền, phát hiện dấu hiệu lừa đảo, cảnh báo và giải thích rõ ràng — nhưng **không được tự ý chặn giao dịch**, quyền quyết định cuối cùng luôn thuộc về người dùng (HITL bắt buộc).

**Mục tiêu thực sự của doanh nghiệp:** Giảm thiệt hại tài chính do lừa đảo chuyển khoản, giữ niềm tin người dùng vào nền tảng, giảm tải khiếu nại/hoàn tiền cho CSKH, và tránh rủi ro pháp lý liên quan đến bảo vệ người tiêu dùng tài chính (PDPA).

**Họ đang đau ở đâu:** Người dùng bị lừa mất tiền vì kịch bản lừa đảo ngày càng tinh vi (giả mạo người quen, giả danh cơ quan chức năng, link giả). Doanh nghiệp không có cơ chế cảnh báo real-time đủ thông minh — chỉ có cảnh báo tĩnh, chung chung, dễ bị người dùng bỏ qua.

**Cốt lõi vs. triệu chứng:**
- Triệu chứng: người dùng report bị lừa *sau khi* đã chuyển tiền.
- Vấn đề cốt lõi: thiếu một lớp **phát hiện rủi ro theo ngữ cảnh + can thiệp đúng thời điểm quyết định** (ngay trước khi bấm "Chuyển"), trong khi rule tĩnh không theo kịp tốc độ biến hóa của kịch bản lừa đảo.

---

## PHẦN 2. PHÂN TÍCH BUSINESS

**Stakeholders**
| Vai trò | Ai |
|---|---|
| Người trả tiền | Doanh nghiệp ví điện tử (bài toán B2B2C) |
| Người sử dụng | End-user chuyển tiền qua ví |
| Người bị ảnh hưởng | User (mất tiền), doanh nghiệp (uy tín, chi phí), đội CSKH/vận hành, cơ quan quản lý |

**Pain points**
- Khó phân biệt giao dịch thật/giả theo thời gian thực.
- Blacklist thủ công cập nhật chậm hơn tốc độ kịch bản lừa đảo mới.
- Cảnh báo chung chung khiến người dùng "quen mắt" và bỏ qua.
- Nếu cảnh báo quá nhạy (false positive) → gây phiền, người dùng tắt tính năng.

**Existing workflow:** Nhập số tiền + người nhận → xác nhận → chuyển ngay. Không có bước kiểm tra rủi ro chuyên biệt.

**Existing solution:** Cảnh báo tĩnh ("hãy cẩn thận với lừa đảo"), OTP, danh sách đen cập nhật thủ công.

**Chi phí hiện tại:** Chi phí hoàn tiền/khiếu nại, chi phí CSKH xử lý case, thiệt hại uy tín thương hiệu.

**Rủi ro hiện tại:** Mất khách hàng, truyền thông tiêu cực, rủi ro bị xử phạt nếu không đáp ứng yêu cầu bảo vệ người tiêu dùng tài chính.

---

## PHẦN 3. ROOT CAUSE

**5 Whys**
1. Tại sao user mất tiền? → Chuyển tiền theo hướng dẫn của kẻ lừa đảo mà không nghi ngờ.
2. Tại sao không nghi ngờ? → Kịch bản lừa đảo tinh vi, giả mạo uy tín (người quen/cơ quan chức năng).
3. Tại sao hệ thống không cảnh báo kịp? → Không phân tích ngữ cảnh giao dịch theo thời gian thực.
4. Tại sao không phân tích được? → Thiếu blacklist động + mô hình phát hiện pattern hành vi.
5. Tại sao thiếu? → Trước giờ chỉ dùng rule tĩnh, chưa đầu tư AI/dữ liệu tổng hợp cho fraud detection.

**Fishbone**
- People: user thiếu kiến thức, dễ bị thao túng tâm lý (gấp gáp, sợ hãi, tin tưởng).
- Process: luồng chuyển tiền không có bước risk-check.
- Technology: thiếu AI/ML fraud detection, blacklist không real-time.
- Data: thiếu dữ liệu scam pattern tổng hợp từ nhiều nguồn.
- Policy: chưa có quy định nội bộ bắt buộc cảnh báo theo mức độ rủi ro.

**Jobs To Be Done:** *"Khi tôi chuẩn bị chuyển tiền, tôi muốn được nhắc nhở nếu giao dịch có dấu hiệu bất thường, để tôi không mất tiền oan nhưng vẫn giữ quyền tự quyết."*

---

## PHẦN 4. AI CÓ THỰC SỰ CẦN KHÔNG?

**Có nên dùng AI? → Có.** Bài toán đòi hỏi phân tích ngữ cảnh tự nhiên (nội dung chuyển khoản, hội thoại) và nhận diện pattern phức tạp, thay đổi liên tục — điều mà rule cứng khó theo kịp.

**AI giải quyết phần nào:**
- Phân loại rủi ro giao dịch (ML).
- Giải thích cảnh báo bằng ngôn ngữ tự nhiên, hội thoại hướng dẫn (LLM).
- Phát hiện pattern ngữ nghĩa trong nội dung chuyển khoản (NLP/embedding).
- Điều phối luồng can thiệp nhiều bước (Agent/LangGraph).

**Phương án đơn giản hơn?** Rule-based thuần (blacklist tĩnh, ngưỡng số tiền) — dễ bị qua mặt, không giải thích được lý do, không thích nghi kịch bản mới. **Kết luận: nên làm hybrid** — rule-based làm lớp lọc nhanh + AI làm lớp phân tích ngữ cảnh sâu, không thay thế hoàn toàn rule.

---

## PHẦN 5. CƠ HỘI DÙNG AI

| Công nghệ | Vai trò trong dự án | Ưu điểm | Nhược điểm |
|---|---|---|---|
| LLM | Giải thích cảnh báo, hội thoại hướng dẫn | Linh hoạt, tự nhiên | Hallucination, cost, latency |
| RAG | Tra cứu kịch bản lừa đảo/chính sách đã biết | Cập nhật dễ, giảm hallucination | Cần vector DB, thêm latency |
| Agent (LangGraph) | Điều phối flow multi-step HITL | Xử lý được flow phức tạp | Engineering phức tạp, khó test |
| Vision/OCR | Scan ảnh chat/lệnh chuyển tiền nghi ngờ (nâng cao) | Mở rộng nguồn input | Ngoài scope MVP, tăng độ phức tạp |
| Classification | Phân loại rủi ro thấp/trung/cao (core) | Nhanh, dễ giải thích nếu model đơn giản | Cần dữ liệu gán nhãn |
| Recommendation | Gợi ý hành động an toàn tiếp theo | Tăng UX | Không critical cho MVP |
| Prediction/Forecast | Dự đoán xu hướng scam dài hạn | Giá trị chiến lược | Không cần cho MVP |
| Speech | Cảnh báo bằng giọng nói (mở rộng) | Tiếp cận đa dạng | Không cần cho MVP |
| Automation/Workflow | Luồng cảnh báo → xác nhận → log (core) | Chuẩn hóa quy trình | Cần thiết kế cẩn thận để không phiền user |

---

## PHẦN 6. THIẾT KẾ MVP

**2 ngày:** Rule-based check (blacklist mẫu, ngưỡng số tiền) + LLM viết lại cảnh báo bằng ngôn ngữ tự nhiên, dễ hiểu. UI đơn giản: luồng chuyển tiền + popup cảnh báo.

**1 tuần:** Thêm ML risk scoring cơ bản (feature: số tiền, tần suất, người nhận mới/cũ, keyword nội dung chuyển khoản), vector DB nhỏ cho blacklist + kịch bản scam (RAG), LangGraph 2–3 bước can thiệp (cảnh báo → xác nhận → log), PostgreSQL lưu giao dịch, frontend hoàn chỉnh luồng cảnh báo.

**1 tháng:** Hội thoại HITL multi-step đầy đủ, admin dashboard cập nhật kịch bản scam mới, memory người nhận tin cậy, phân tầng risk level, feedback loop giảm false positive, auth roles user/admin, deploy cloud, testing diện rộng.

**Ưu tiên (impact cao / complexity thấp):** Risk scoring cơ bản + cảnh báo giải thích tự nhiên bằng LLM là điểm impact cao nhất với complexity vừa phải — nên ưu tiên trước agent hội thoại multi-step.

---

## PHẦN 7. USER FLOW

```
User (nhập giao dịch chuyển tiền)
        ↓
System (validate input, trigger risk check)
        ↓
AI (ML risk scoring + LLM phân tích ngữ cảnh nội dung/blacklist)
        ↓
Database (tra cứu blacklist, lịch sử người nhận, vector DB kịch bản scam)
        ↓
Tool (kiểm tra ngưỡng, đối chiếu blacklist, tính risk score)
        ↓
Response (hiển thị mức rủi ro + giải thích + gợi ý hành động;
          nếu risk cao → thêm bước xác nhận/hội thoại hướng dẫn kiểm chứng)
```

---

## PHẦN 8. KIẾN TRÚC

- **Frontend:** React — luồng chuyển tiền, popup cảnh báo, dashboard admin.
- **Backend:** FastAPI — điều phối risk check, gọi AI service.
- **LLM:** phân tích ngữ cảnh + sinh lời giải thích cảnh báo + hội thoại hướng dẫn.
- **Embedding + Vector DB:** lưu kịch bản scam đã biết, blacklist ngữ nghĩa (vd pgvector/Pinecone) để RAG truy vấn similarity.
- **RAG:** truy xuất kịch bản lừa đảo tương tự để LLM tham chiếu khi giải thích.
- **Agent (LangGraph):** điều phối flow: risk check → cảnh báo → HITL xác nhận → log/escalate.
- **Database:** PostgreSQL — giao dịch, user, lịch sử người nhận, log quyết định.
- **API:** REST giữa frontend ↔ backend ↔ AI service.
- **Tool Calling:** tool kiểm tra ngưỡng số tiền, tool đối chiếu blacklist, tool tính risk score ML.
- **OCR (nếu cần):** cho phép user upload ảnh tin nhắn/lệnh chuyển tiền nghi ngờ để AI phân tích (nâng cao).
- **Authentication:** JWT, phân quyền user/admin.
- **Cloud:** container hóa, deploy trên AWS/GCP/Render.

---

## PHẦN 9. DATA

**Cần:** dữ liệu giao dịch mẫu (giả lập), blacklist người nhận/scam, kịch bản lừa đảo phổ biến (case study thật), lịch sử người nhận tin cậy, feedback đúng/sai từ user.

**Nguồn:** cảnh báo lừa đảo công khai (công an, ngân hàng công bố), dữ liệu giả lập tự tạo cho demo, case study từ báo chí.

**Thiếu:** dữ liệu giao dịch thật (giới hạn bởi privacy), dữ liệu gán nhãn scam/not-scam đủ lớn để train ML robust.

**Data quality:** dữ liệu giả lập cần đa dạng kịch bản để tránh overfit; cần cập nhật liên tục vì pattern lừa đảo thay đổi nhanh.

**Data privacy:** giao dịch tài chính là dữ liệu nhạy cảm → ẩn danh hóa khi demo, tuân thủ PDPA, không lưu thông tin thật của người dùng thật.

---

## PHẦN 10. RỦI RO

- **Hallucination:** LLM bịa dấu hiệu lừa đảo không có thật → ràng buộc LLM chỉ giải thích dựa trên dữ liệu đối chiếu thật, không tự suy diễn.
- **Security:** giao dịch tài chính là mục tiêu tấn công cao → mã hóa dữ liệu, bảo mật API.
- **Privacy:** nội dung chuyển khoản/thông tin người nhận là dữ liệu nhạy cảm.
- **Latency:** cảnh báo phải xuất hiện trong vài giây trước khi user chuyển tiền — cần tối ưu (cache, model nhỏ cho scoring, LLM chỉ dùng để giải thích chứ không quyết định).
- **Cost:** gọi LLM cho mỗi giao dịch tốn kém ở scale lớn → chỉ gọi LLM khi risk score vượt ngưỡng.
- **Bias:** model có thể bỏ sót kịch bản mới hoặc false positive với giao dịch hợp pháp bất thường (vd người lớn tuổi chuyển tiền xa).
- **Prompt Injection:** nội dung chuyển khoản do user/kẻ lừa đảo nhập có thể chứa chuỗi đánh lừa LLM → sanitize input, không cho LLM tự thực thi hành động nhạy cảm.
- **Failure case:** hệ thống down → cần fallback rule-based; false negative với kịch bản mới → cần feedback loop cập nhật liên tục.

---

## PHẦN 11. ĐÁNH GIÁ KHẢ THI

| Loại | Đánh giá |
|---|---|
| Business | Cao — pain point rõ ràng, giảm chi phí khiếu nại/hoàn tiền |
| Technical | Khả thi trong scope MVP; phần agent multi-step phức tạp hơn nhưng làm dần được |
| Operational | Cần quy trình cập nhật blacklist/kịch bản scam liên tục — đòi hỏi cam kết vận hành dài hạn |
| Financial | Chi phí LLM API + hạ tầng cần tính ở scale thật; MVP demo chi phí thấp |
| Legal | Cần tuân thủ PDPA, quy định bảo vệ người dùng tài chính; ràng buộc HITL giúp giảm rủi ro pháp lý |

---

## PHẦN 12. ROADMAP

- **Ngày 1:** Setup repo, thiết kế data giả lập, wireframe UI luồng chuyển tiền.
- **Ngày 2:** Rule-based check cơ bản + tích hợp LLM sinh cảnh báo; demo end-to-end đơn giản.
- **Tuần 1:** ML risk scoring, vector DB (RAG), LangGraph 2–3 bước, PostgreSQL, frontend hoàn chỉnh.
- **Tuần 2:** Hội thoại HITL multi-step, admin dashboard, memory người nhận tin cậy, testing edge case, chuẩn bị demo + pitch.
- **Demo:** kịch bản end-to-end — user chuyển tiền có dấu hiệu lừa đảo → agent cảnh báo, giải thích, hướng dẫn xác minh → user quyết định.
- **Testing:** case scam thật (từ báo chí) + giao dịch hợp pháp để đo false positive rate.
- **Deployment:** deploy web demo trên cloud, đảm bảo uptime cho buổi chấm.

---

## PHẦN 13. TIÊU CHÍ CHẤM (thang 10, đứng vai ban giám khảo)

| Tiêu chí | Điểm | Lý do |
|---|---|---|
| Innovation | 7 | Cảnh báo chuyển khoản không mới, nhưng AI Agent + HITL + giải thích ngữ cảnh là điểm khác biệt |
| Business Value | 9 | Pain point rõ, ROI đo được (giảm khiếu nại/hoàn tiền) |
| Technical Depth | 7 | Kết hợp ML + LLM + RAG + Agent nếu triển khai đủ; MVP 2 ngày sẽ thấp hơn |
| UX | 7 | Cần cẩn thận để cảnh báo không gây phiền nhưng vẫn đủ rõ |
| Demo | 8 | Kịch bản trực quan, dễ gây ấn tượng nếu dàn dựng tốt |
| Scalability | 6 | Cần đầu tư thêm cho cost LLM và pipeline cập nhật dữ liệu liên tục |
| ROI | 8 | Business case rõ ràng |
| Execution | 7 | Phụ thuộc team có build đủ theo roadmap không |

---

## PHẦN 14. ĐIỂM YẾU (vai giám khảo khó tính)

**Điều gì khiến dự án bị loại:**
- MVP chỉ dừng ở demo giả lập, chưa có kịch bản/dữ liệu thật đủ thuyết phục.
- False positive rate cao khiến trải nghiệm tệ.
- Không rõ cách xử lý khi kịch bản lừa đảo thay đổi nhanh hơn tốc độ cập nhật hệ thống.

**Câu hỏi doanh nghiệp sẽ hỏi:**
- Làm sao đo lường false positive/false negative trong thực tế?
- Chi phí vận hành LLM ở scale hàng triệu giao dịch/ngày là bao nhiêu?
- Ai chịu trách nhiệm pháp lý nếu agent cảnh báo sai (bỏ sót) hoặc cảnh báo sai khiến giao dịch hợp pháp bị chặn?
- Làm sao cập nhật blacklist/kịch bản scam theo thời gian thực?

**Lỗ hổng trong giải pháp:**
- Dữ liệu train/kịch bản scam chủ yếu giả lập, chưa validate với dữ liệu thật.
- Prompt injection qua nội dung chuyển khoản chưa có giải pháp kỹ càng.
- Nhiều bước can thiệp cho risk cao có thể làm chậm trải nghiệm chuyển tiền.

**Giả định chưa chứng minh:**
- User sẽ đọc và làm theo cảnh báo (thực tế nhiều người bỏ qua vì tâm lý gấp gáp/tin tưởng kẻ lừa đảo).
- Hệ thống có đủ dữ liệu kịch bản scam để nhận diện chính xác đa số case mới.

---

## PHẦN 15. ĐỀ XUẤT PHIÊN BẢN TỐT HƠN

Nếu làm lại từ đầu, nên tập trung vào:

1. **Feedback loop chặt chẽ** — mỗi lần user báo "đúng là lừa đảo" hay "cảnh báo sai" được dùng để cập nhật kịch bản/retrain.
2. **Risk scoring nhiều tầng** — soft warning cho risk thấp, hard stop tạm thời + xác minh nhiều bước cho risk cao, giảm phiền nhiễu nhưng vẫn bảo vệ hiệu quả.
3. **Behavior-based signal** — thêm tín hiệu hành vi (thời gian trong ngày, tốc độ nhập liệu, số lần thử) thay vì chỉ dựa nội dung/blacklist tĩnh.
4. **Case study thật (ẩn danh)** từ báo chí/công an để tăng độ tin cậy khi demo.
5. **Cơ chế accountability rõ ràng** — log đầy đủ quyết định HITL để chứng minh AI chỉ hỗ trợ, user luôn là người quyết định cuối cùng.

---

## PHẦN 16. KẾ HOẠCH THỰC HIỆN

| Task | Mảng | Thời gian ước lượng | Ưu tiên |
|---|---|---|---|
| Xác định pain point, ROI case | Business | 0.5 ngày | Cao |
| Thu thập kịch bản scam thật (báo chí, công an) | Research | 1 ngày | Cao |
| Wireframe UI luồng chuyển tiền + cảnh báo | Design | 0.5 ngày | Cao |
| Setup FastAPI, API risk-check, tool ngưỡng/blacklist | Backend | 2 ngày | Cao |
| React luồng chuyển tiền + popup cảnh báo | Frontend | 2 ngày | Cao |
| ML risk scoring model | AI | 1.5 ngày | Cao |
| LLM giải thích cảnh báo + RAG vector DB kịch bản scam | AI | 2 ngày | Cao |
| LangGraph agent multi-step HITL | AI | 2 ngày | Trung bình (nâng cao) |
| Thiết kế + test prompt (giải thích, hội thoại, chống injection) | Prompt | 1 ngày | Cao |
| Test case scam thật + đo false positive/negative | Testing | 1 ngày | Cao |
| Build kịch bản demo end-to-end | Demo | 0.5 ngày | Cao |
| Slide, pitch deck | Presentation | 0.5 ngày | Cao |
| Setup repo, docs, README | GitHub | 0.5 ngày | Trung bình |
| Luyện tập trình bày, chuẩn bị trả lời câu hỏi khó | Pitching | 0.5 ngày | Cao |

**Tổng ước lượng:** ~2 tuần, khớp với roadmap ở Phần 12.
