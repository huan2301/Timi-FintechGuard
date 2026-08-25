# FIN-19 — Product Requirements Document (PRD)

## 1. Tổng quan (Overview)
Sản phẩm là một **AI Agent** tích hợp trực tiếp vào luồng chuyển tiền của ví điện tử, có nhiệm vụ:
* Phân tích rủi ro của mỗi giao dịch theo thời gian thực (real-time).
* Đưa ra cảnh báo phù hợp với từng mức độ rủi ro.
* **Luồng tương tác:** Đối với giao dịch rủi ro cao, Agent chủ động đặt câu hỏi xác minh (hội thoại nhiều bước) trước khi để người dùng tự quyết định tiếp tục hay hủy giao dịch.

---

## 2. Mục tiêu & Success Metrics
*(Xem chi tiết chỉ số kinh doanh tại phần Project Brief)*

### Mục tiêu kỹ thuật bổ sung cho PRD:
* **Risk Scoring Model:** Đạt độ chính xác chấp nhận được trên tập test (đo bằng *Precision / Recall*, không đặt con số cứng ở giai đoạn MVP).
* **Độ trễ (Latency):** Thời gian xử lý cảnh báo cực thấp, không làm gián đoạn trải nghiệm chuyển tiền của người dùng.
* **Trách nhiệm giải trình (Accountability):** Toàn bộ quyết định của Agent (nội dung câu hỏi, phản hồi người dùng, khuyến nghị đưa ra) được ghi log đầy đủ.

---

## 3. User Personas

| Persona | Mô tả | Nhu cầu chính |
| :--- | :--- | :--- |
| **Người dùng phổ thông** | Chuyển tiền thường xuyên, ít kiến thức bảo mật. | Được cảnh báo rõ ràng, dễ hiểu; không bị làm phiền với giao dịch bình thường. |
| **Người dùng lớn tuổi** | Ít quen thuộc công nghệ, dễ bị thao túng tâm lý. | Cảnh báo đơn giản, hướng dẫn từng bước cụ thể. |
| **Nhân viên Vận hành / CSKH** | Quản lý danh sách đen (blacklist), xử lý khiếu nại. | Công cụ cập nhật dữ liệu nhanh, Dashboard theo dõi hiệu quả cảnh báo. |
| **Quản trị doanh nghiệp** | Ra quyết định đầu tư, chịu trách nhiệm tuân thủ. | Báo cáo hiệu quả, bằng chứng tuân thủ pháp lý (HITL Log). |

---

## 4. User Stories
* **Là người dùng**, tôi muốn được cảnh báo ngay khi chuyển tiền cho người nhận có dấu hiệu lừa đảo, để tránh mất tiền oan.
* **Là người dùng**, tôi muốn hiểu rõ lý do giao dịch bị cảnh báo, để tự tin quyết định tiếp tục hay dừng lại.
* **Là người dùng**, tôi muốn Agent hỏi thêm câu xác minh khi rủi ro cao, để có thêm cơ sở nhận biết lừa đảo trước khi thực hiện.
* **Là người dùng**, tôi không muốn bị làm phiền bởi cảnh báo khi chuyển tiền cho người nhận đã được tôi xác nhận an toàn trước đó.
* **Là nhân viên vận hành**, tôi muốn thêm kịch bản lừa đảo mới vào hệ thống mà không cần đợi deploy lại, giúp hệ thống luôn cập nhật.
* **Là quản trị doanh nghiệp**, tôi muốn xem báo cáo số lượng cảnh báo và tỷ lệ người dùng tuân theo khuyến nghị, để đánh giá hiệu quả sản phẩm.

---

## 5. Functional Requirements

### 5.1 Risk Analysis Engine
* Phân tích mỗi giao dịch dựa trên: số tiền, tần suất, độ mới của người nhận, nội dung chuyển khoản và đối chiếu blacklist.
* Trả về **Risk Score** và phân loại thành 3 mức: **Thấp** / **Trung bình** / **Cao**.

### 5.2 Cảnh báo & Giải thích (LLM)
* Sinh lời giải thích bằng ngôn ngữ tự nhiên dựa trên dữ liệu đối chiếu thực tế (không tự suy diễn/hallucinate).
* Với rủi ro **Trung bình / Cao**, tham chiếu kịch bản lừa đảo tương tự qua **RAG** để giải thích cụ thể cho người dùng.

### 5.3 Luồng can thiệp HITL (Agent)
* **Rủi ro cao:** Đặt thêm **2–3 câu hỏi xác minh** trước khi đưa ra khuyến nghị cuối cùng.
* **Tuyệt đối không tự động chặn/hủy giao dịch** trong bất kỳ trường hợp nào — chỉ đưa ra khuyến nghị.
* Log đầy đủ toàn bộ luồng hội thoại và quyết định cuối cùng của người dùng.

### 5.4 Memory người nhận tin cậy
* Cho phép người dùng đánh dấu người nhận là **An toàn**.
* Tự động giảm mức cảnh báo cho các giao dịch tiếp theo tới cùng người nhận này.

### 5.5 Admin Dashboard
* Thêm / sửa / xóa thông tin blacklist người nhận.
* Thêm kịch bản lừa đảo mới (tự động embedding vào Vector DB).
* Xem thống kê: Số lượng cảnh báo theo mức độ, tỷ lệ người dùng tuân theo khuyến nghị.

### 5.6 Authentication & Phân quyền
* Đăng nhập và phân quyền (User / Admin) bảo mật qua **JWT**.

---

## 6. Non-Functional Requirements
* **Hiệu năng (Performance):** Cảnh báo xuất hiện gần như tức thời, không gây tắc nghẽn luồng chuyển tiền.
* **Bảo mật (Security):** Mã hóa dữ liệu nhạy cảm, làm sạch input (sanitize) để chống tấn công **Prompt Injection** qua nội dung chuyển khoản.
* **Quyền riêng tư (Privacy):** Tuân thủ luật **PDPA**, ẩn danh hóa dữ liệu demo, không lưu trữ thông tin thật của người dùng thật trong môi trường thử nghiệm.
* **Độ tin cậy (Reliability):** Có cơ chế **Fallback Rule-based** khi AI Service gặp sự cố hoặc quá tải.
* **Khả năng mở rộng (Scalability):** Kiến trúc thiết kế cho phép thêm kịch bản/blacklist mới mà không cần sửa code hay re-deploy hệ thống.

---

## 7. Ngoài phạm vi (Out of Scope — MVP)
* OCR bóc tách ảnh chụp màn hình tin nhắn / đoạn chat.
* Cảnh báo tương tác bằng giọng nói (Voice Agent).
* Dự đoán xu hướng lừa đảo dài hạn.
* Tích hợp đa kênh ngoài ứng dụng ví điện tử.

---

## 8. Giả định & Ràng buộc (Assumptions & Constraints)
* **Giả định:** Người dùng sẽ đọc cảnh báo nếu thông tin được trình bày đủ rõ ràng và cụ thể *(cần kiểm chứng lại qua user testing)*.
* **Dữ liệu:** Dữ liệu huấn luyện ban đầu chủ yếu là dữ liệu giả lập / case study công khai, chưa sử dụng dữ liệu giao dịch thật.
* **Ràng buộc pháp lý:** AI không được phép tự động ra quyết định tài chính hoặc can thiệp tài sản thay cho người dùng.

---

## 9. Dependencies
* **Nguồn dữ liệu:** Các kịch bản lừa đảo từ nguồn uy tín (ACB, chongluadao.vn, NCSC) cần được cập nhật định kỳ.
* **Hạ tầng AI:** **LLM API** và **Vector Database** là thành phần bắt buộc, ảnh hưởng trực tiếp đến chi phí vận hành ở quy mô lớn.

---

## 10. Acceptance Criteria (Mức MVP)
- [ ] **Trùng khớp dữ liệu:** Giao dịch trùng khớp blacklist / kịch bản đã biết $\rightarrow$ Hệ thống phát cảnh báo đúng mức độ rủi ro kèm giải thích chi tiết.
- [ ] **Giao dịch bình thường:** Giao dịch hợp lệ $\rightarrow$ Không bị cảnh báo sai (*false positive*) trong các case test cơ bản.
- [ ] **Xác minh rủi ro cao:** Giao dịch rủi ro cao $\rightarrow$ Hệ thống kích hoạt ít nhất 1 bước xác minh trước khuyến nghị cuối, toàn bộ tiến trình được lưu log.
- [ ] **Cập nhật thời gian thực:** Admin thêm kịch bản mới qua Dashboard $\rightarrow$ Hệ thống nhận diện được ngay lập tức mà không cần deploy lại code.

---

## 11. Rủi ro & Câu hỏi mở
* **Hành vi người dùng:** Người dùng có thể phớt lờ cảnh báo do thói quen thao tác nhanh/gấp gáp $\rightarrow$ *Cần kiểm chứng qua thử nghiệm người dùng thật*.
* **Chi phí vận hành:** Chi phí LLM API ở quy mô lớn (hàng triệu giao dịch/ngày) chưa được định lượng chi tiết.
* **Trách nhiệm pháp lý:** Cần doanh nghiệp xác nhận rõ ràng về giới hạn trách nhiệm pháp lý khi xảy ra trường hợp cảnh báo sai (bỏ sót lừa đảo hoặc cảnh báo nhầm giao dịch hợp lệ).