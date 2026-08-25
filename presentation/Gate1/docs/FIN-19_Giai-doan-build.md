# FIN-19 — Các Giai Đoạn Hoàn Thiện Dự Án Trong Quá Trình Build

Mỗi giai đoạn có: **Mục tiêu** → **Đầu ra (deliverables)** → **Tiêu chí hoàn thành (Definition of Done)** → **Rủi ro cần canh**. Thiết kế theo kiểu tăng dần độ phức tạp (incremental), để ở bất kỳ điểm nào bạn dừng lại cũng có một bản demo chạy được.

---

## GIAI ĐOẠN 0 — Kick-off & Chuẩn bị nền (0.5 ngày)

**Mục tiêu:** Thống nhất phạm vi, dựng khung dự án, có dữ liệu giả lập ban đầu.

**Đầu ra:**
- Repo GitHub khởi tạo (backend, frontend, docs).
- Bộ dữ liệu giả lập: giao dịch mẫu, blacklist người nhận, 10–15 kịch bản lừa đảo thật (thu từ báo chí/công an, đã ẩn danh).
- Wireframe UI luồng chuyển tiền + vị trí hiển thị cảnh báo.
- Danh sách ràng buộc bắt buộc (HITL, không tự chặn, PDPA) dán ngay đầu README để cả team không đi lệch.

**Definition of Done:** Team đồng thuận scope MVP theo mốc "2 ngày / 1 tuần / 1 tháng"; repo chạy được "Hello World" cho cả backend lẫn frontend.

**Rủi ro cần canh:** Dành quá nhiều thời gian tìm dữ liệu thật — giới hạn 1 ngày, phần còn thiếu bù bằng dữ liệu giả lập có kiểm soát.

---

## GIAI ĐOẠN 1 — Core Rule-Based MVP (Ngày 1–2)

**Mục tiêu:** Có một luồng chạy được đầu-cuối, dù đơn giản, để làm xương sống cho các giai đoạn sau.

**Đầu ra:**
- API kiểm tra rule cơ bản: đối chiếu blacklist tĩnh, ngưỡng số tiền, người nhận mới lần đầu.
- LLM viết lại kết quả rule thành lời cảnh báo tự nhiên, dễ hiểu (chưa cần phân tích ngữ cảnh sâu).
- Frontend: form chuyển tiền + popup cảnh báo tĩnh.

**Definition of Done:** Demo được kịch bản "chuyển tiền cho số trong blacklist → hiện cảnh báo giải thích bằng tiếng Việt tự nhiên → user chọn tiếp tục hoặc hủy".

**Rủi ro cần canh:** Đừng để LLM tự ý thêm thông tin không có trong dữ liệu đối chiếu (hallucination) — prompt phải ràng buộc rõ "chỉ diễn giải dữ liệu được cung cấp".

---

## GIAI ĐOẠN 2 — AI Risk Scoring (Tuần 1, nửa đầu)

**Mục tiêu:** Thay rule tĩnh bằng mô hình chấm điểm rủi ro có khả năng phân tầng.

**Đầu ra:**
- Feature engineering: số tiền, tần suất giao dịch, độ mới của người nhận, keyword nhạy cảm trong nội dung chuyển khoản.
- Mô hình ML đơn giản (logistic regression / gradient boosting nhẹ) chấm điểm rủi ro 0–100, phân thành 3 mức: thấp / trung bình / cao.
- Backend tích hợp: mỗi giao dịch trả về risk score kèm lý do (feature nào đóng góp nhiều nhất).

**Definition of Done:** Test với ≥30 giao dịch giả lập (mix hợp lệ/lừa đảo), model phân loại đúng hướng ở phần lớn case rõ ràng; có báo cáo sơ bộ về precision/recall.

**Rủi ro cần canh:** Model học lệch nếu dữ liệu giả lập không đa dạng — cố tình thêm case "trông giống lừa đảo nhưng hợp lệ" (vd người lớn tuổi chuyển tiền xa) để tránh false positive dễ thấy.

---

## GIAI ĐOẠN 3 — RAG: Vector DB Kịch Bản Lừa Đảo (Tuần 1, nửa sau)

**Mục tiêu:** Cho AI khả năng tham chiếu các kịch bản lừa đảo đã biết khi giải thích cảnh báo, thay vì chỉ dựa vào rule/score đơn thuần.

**Đầu ra:**
- Vector DB (pgvector hoặc tương đương) chứa embedding của các kịch bản lừa đảo đã thu thập.
- Pipeline: khi có giao dịch risk trung bình/cao → truy vấn similarity → lấy kịch bản gần nhất → đưa vào prompt LLM để giải thích cụ thể ("giao dịch này giống kịch bản giả danh công an X").
- Backend lưu log: giao dịch nào được đối chiếu với kịch bản nào.

**Definition of Done:** Với một giao dịch test mô phỏng đúng một kịch bản đã biết, hệ thống trả lời đúng loại kịch bản trong lời giải thích.

**Rủi ro cần canh:** Latency tăng do phải embedding + truy vấn vector DB mỗi lần — cân nhắc chỉ kích hoạt RAG khi risk score vượt ngưỡng, không chạy cho mọi giao dịch.

---

## GIAI ĐOẠN 4 — Agent Orchestration & HITL Flow (Tuần 2, nửa đầu)

**Mục tiêu:** Chuyển từ "cảnh báo một chiều" sang "hội thoại can thiệp nhiều bước", đúng tinh thần AI Agent của đề bài.

**Đầu ra:**
- LangGraph flow: risk check → cảnh báo → (nếu risk cao) hỏi thêm câu hỏi xác minh ("bạn có quen người nhận này không?", "họ có yêu cầu bạn giữ bí mật giao dịch không?") → tổng hợp câu trả lời → đưa ra khuyến nghị cuối → user tự quyết định.
- Log đầy đủ mọi bước quyết định (ai hỏi gì, user trả lời gì, quyết định cuối cùng là gì) — phục vụ accountability.
- Memory người nhận tin cậy: nếu user đã xác nhận một người nhận là an toàn trước đó, giảm mức cảnh báo cho lần sau.

**Definition of Done:** Demo được một kịch bản risk cao đi qua ít nhất 2–3 bước hội thoại trước khi user quyết định, toàn bộ log được lưu và có thể truy xuất.

**Rủi ro cần canh:** Đừng để flow hội thoại quá dài gây khó chịu — giới hạn tối đa 2–3 câu hỏi xác minh cho một giao dịch.

---

## GIAI ĐOẠN 5 — Admin Dashboard & Data Management (Tuần 2, song song)

**Mục tiêu:** Cho phép vận hành cập nhật blacklist/kịch bản mới mà không cần sửa code.

**Đầu ra:**
- Trang admin: thêm/sửa/xóa blacklist, thêm kịch bản scam mới (tự động embedding vào vector DB), xem thống kê cảnh báo (bao nhiêu lần cảnh báo, bao nhiêu lần user vẫn chuyển tiền).
- Phân quyền user/admin qua JWT.

**Definition of Done:** Admin thêm một kịch bản scam mới qua UI, giao dịch test tương tự kịch bản đó được nhận diện ngay mà không cần deploy lại.

**Rủi ro cần canh:** Đừng để phần admin chiếm quá nhiều thời gian — đây là điểm cộng, không phải core chấm điểm; giới hạn scope tối thiểu khả dụng (MVP admin, không cần đẹp).

---

## GIAI ĐOẠN 6 — Hardening: Bảo mật, Privacy, Chống Prompt Injection (Tuần 2, song song)

**Mục tiêu:** Vá các lỗ hổng dễ bị giám khảo "bắt bài" nhất (Phần 14 trong bản phân tích trước).

**Đầu ra:**
- Sanitize input nội dung chuyển khoản trước khi đưa vào prompt LLM (loại bỏ chuỗi cố tình chỉ thị LLM bỏ qua cảnh báo).
- Mã hóa dữ liệu nhạy cảm trong PostgreSQL, giới hạn quyền truy cập theo role.
- Ẩn danh hóa toàn bộ dữ liệu demo (không dùng thông tin thật).
- Viết một đoạn ngắn trong docs giải thích cơ chế tuân thủ PDPA + rule "AI không tự quyết định" để trả lời câu hỏi pháp lý khi pitch.

**Definition of Done:** Thử nghiệm chèn một chuỗi "prompt injection" mẫu vào nội dung chuyển khoản, hệ thống không bị đánh lừa bỏ qua cảnh báo.

**Rủi ro cần canh:** Đây là phần dễ bị bỏ qua vì không "nhìn thấy" trên demo — nhưng lại là phần giám khảo khó tính hỏi nhiều nhất, đừng để đến phút chót.

---

## GIAI ĐOẠN 7 — Testing & QA (Cuối tuần 2)

**Mục tiêu:** Đo lường chất lượng thật, không chỉ "chạy được demo".

**Đầu ra:**
- Bộ test case: kịch bản lừa đảo thật đã sưu tầm + giao dịch hợp pháp bất thường (để đo false positive).
- Báo cáo: tỷ lệ phát hiện đúng (recall), tỷ lệ báo động giả (false positive rate), thời gian phản hồi trung bình.
- Test edge case: hệ thống AI service down → có fallback rule-based hoạt động không.

**Definition of Done:** Có con số cụ thể (vd "phát hiện đúng 8/10 kịch bản lừa đảo test, false positive 1/10 giao dịch hợp lệ") để đưa vào slide pitch — tránh nói chung chung.

**Rủi ro cần canh:** Đừng chỉ test case "dễ" để số liệu đẹp — cố tình thêm case khó để chứng minh sự trung thực, giám khảo đánh giá cao điều này hơn là số liệu hoàn hảo giả tạo.

---

## GIAI ĐOẠN 8 — Demo Prep & Pitch (1 ngày trước nộp)

**Mục tiêu:** Đóng gói câu chuyện thuyết phục, không chỉ đóng gói code.

**Đầu ra:**
- Kịch bản demo cố định (2–3 phút): 1 case rõ ràng "user suýt bị lừa, AI can thiệp thành công" + 1 case "giao dịch hợp lệ không bị làm phiền".
- Slide pitch: vấn đề → giải pháp → kiến trúc → kết quả test → roadmap mở rộng.
- Chuẩn bị sẵn câu trả lời cho các câu hỏi khó ở Phần 14 (chi phí LLM ở scale lớn, trách nhiệm pháp lý, cách cập nhật kịch bản mới).

**Definition of Done:** Chạy thử toàn bộ kịch bản demo ít nhất 2 lần không lỗi, có phương án dự phòng nếu mạng/API lỗi khi demo trực tiếp (video quay sẵn).

**Rủi ro cần canh:** Demo trực tiếp phụ thuộc API/mạng — luôn có bản quay màn hình dự phòng.

---

## GIAI ĐOẠN 9 — Deployment & Submission

**Mục tiêu:** Đảm bảo giám khảo có thể tự trải nghiệm sản phẩm, không chỉ xem qua slide.

**Đầu ra:**
- Deploy bản demo lên cloud, có domain/URL truy cập được, uptime ổn định trong thời gian chấm.
- README rõ ràng: cách chạy local, kiến trúc, giới hạn hiện tại, hướng phát triển tiếp theo.
- Video demo backup (2–3 phút) đính kèm bài nộp.

**Definition of Done:** Một người ngoài team (không biết trước) có thể tự đọc README và hiểu được sản phẩm làm gì trong 5 phút.

---

## Tổng quan tiến độ (gantt rút gọn)

| Giai đoạn | Thời điểm | Trạng thái demo sau giai đoạn |
|---|---|---|
| 0. Kick-off | Ngày 0.5 | Repo chạy, chưa có tính năng |
| 1. Core Rule-Based | Ngày 1–2 | Demo end-to-end đơn giản (rule + LLM giải thích) |
| 2. AI Risk Scoring | Tuần 1 (đầu) | Cảnh báo có phân tầng rủi ro |
| 3. RAG Kịch bản Scam | Tuần 1 (cuối) | Cảnh báo giải thích cụ thể theo kịch bản |
| 4. Agent HITL | Tuần 2 (đầu) | Hội thoại can thiệp nhiều bước |
| 5. Admin Dashboard | Tuần 2 (song song) | Vận hành tự cập nhật dữ liệu |
| 6. Hardening | Tuần 2 (song song) | Chống injection, bảo mật, privacy |
| 7. Testing & QA | Cuối tuần 2 | Có số liệu đo lường thật |
| 8. Demo Prep | Trước nộp 1 ngày | Kịch bản pitch hoàn chỉnh |
| 9. Deployment | Trước nộp | Sản phẩm sống, giám khảo tự trải nghiệm được |
