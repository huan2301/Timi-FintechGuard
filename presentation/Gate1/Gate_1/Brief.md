# FIN-19 — Project Brief

## 📌 Tên dự án
**AI Agent Chống Lừa Đảo & Cảnh Báo Giao Dịch Rủi Ro Cho Người Dùng Ví Điện Tử**

---

## 🚨 Vấn đề (Problem Statement)
* **Thực trạng:** Người dùng ví điện tử ngày càng dễ bị lừa chuyển tiền do các kịch bản lừa đảo tinh vi (giả mạo người quen, giả danh cơ quan chức năng, gửi link giả).
* **Hạn chế hiện tại:** Các cảnh báo giao dịch hiện tại chỉ mang tính tĩnh, chung chung và **không phân tích ngữ cảnh theo thời gian thực**, dẫn đến việc người dùng dễ dàng bỏ qua.
* **Hậu quả:** 
  * Gây thiệt hại tài chính nghiêm trọng cho người dùng.
  * Tăng chi phí xử lý khiếu nại/hoàn tiền cho doanh nghiệp.
  * Làm ảnh hưởng tiêu cực đến uy tín thương hiệu ví điện tử.

---

## 🎯 Mục tiêu (Goal)
Xây dựng một **AI Agent** có khả năng:
1. Phân tích rủi ro giao dịch theo thời gian thực.
2. Đưa ra cảnh báo trực quan kèm giải thích lý do cụ thể.
3. Can thiệp thông qua hội thoại nhiều bước để xác minh (khi cần thiết).

> ⚠️ **Lưu ý cốt lõi:** AI Agent **không tự ý chặn giao dịch**. Quyết định cuối cùng luôn thuộc về người dùng (**Human-in-the-Loop** bắt buộc).

---

## 👥 Đối tượng người dùng (Target Users)
* **Người dùng cuối:** Khách hàng sử dụng ví điện tử để thực hiện các giao dịch chuyển tiền.
* **Đội vận hành / CSKH:** Quản lý danh sách đen (blacklist) và cập nhật các kịch bản lừa đảo (scam patterns).
* **Ban quản trị doanh nghiệp (Sponsor):** Đơn vị ra đề bài, đánh giá hiệu quả và chi trả cho giải pháp.

---

## 📊 Chỉ số thành công (Success Metrics)

| Chỉ số | Mô tả mục tiêu |
| :--- | :--- |
| **Tỷ lệ phát hiện (Recall)** | Giảm tối đa tỷ lệ giao dịch lừa đảo trót lọt nhờ phát hiện chính xác. |
| **Tỷ lệ báo động giả (False Positive)** | Giữ ở mức đủ thấp để không gây phiền phức cho trải nghiệm chuyển tiền bình thường. |
| **Thời gian phản hồi (Latency)** | Phản hồi cảnh báo cực nhanh theo thời gian thực (real-time), dưới ngưỡng ảnh hưởng đến UX. |
| **Tỷ lệ tuân thủ (Conversion)** | Tỷ lệ người dùng thực sự dừng/nghe theo khuyến nghị của AI Agent khi phát hiện rủi ro cao. |

---

## 🛠️ Phạm vi dự án (Scope)

### ✅ Trong phạm vi (MVP)
* **Phân tích rủi ro:** Kết hợp giữa Luật kinh doanh (Rule-based) + Machine Learning (ML).
* **Cảnh báo thông minh:** Giải thích lý do cảnh báo bằng Large Language Model (LLM).
* **Đối chiếu ngữ cảnh:** Tra cứu kịch bản lừa đảo bằng RAG (Retrieval-Augmented Generation).
* **Luồng can thiệp HITL:** Hội thoại xác minh nhiều bước cơ bản với người dùng.
* **Admin Dashboard:** Trang quản trị cho phép CSKH quản lý blacklist và các kịch bản scam.

### ❌ Ngoài phạm vi (Giai đoạn phát triển sau)
* OCR bóc tách ảnh chụp tin nhắn / đoạn chat.
* Cảnh báo tương tác bằng giọng nói (Voice Agent).
* Dự đoán xu hướng / hành vi lừa đảo dài hạn bằng AI.
* Tích hợp đa kênh ngoài ứng dụng ví điện tử.

---

## ⛔ Ràng buộc bắt buộc (Hard Constraints)

1. **Human-in-the-Loop (HITL) bắt buộc:** AI/LLM chỉ đóng vai trò cố vấn và cảnh báo, **tuyệt đối không tự quyền chặn hoặc hủy giao dịch** của người dùng.
2. **Tuân thủ PDPA:** Bảo đảm an toàn và bảo mật dữ liệu cá nhân; tránh gửi cảnh báo dồn dập gây phiền hà.
3. **Tính minh bạch (Explainable AI):** Mọi cảnh báo phát ra đều phải có lý do giải thích rõ ràng, tuyệt đối không dùng mô hình "hộp đen" (Black-box).

---

## 📅 Timeline tóm tắt

```mermaid
timeline
    title Lộ trình triển khai dự án FIN-19
    2 Ngày : Rule-based MVP
    1 Tuần : AI Risk Scoring + RAG
    1 Tháng : Agent HITL đầy đủ + Admin Dashboard