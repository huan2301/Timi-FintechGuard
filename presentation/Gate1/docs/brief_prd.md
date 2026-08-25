
T020 – Anti Scam
FIN-19 — Project Brief
Tên dự án
AI Agent Chống Lừa Đảo & Cảnh Báo Giao Dịch Rủi Ro Cho Người Dùng Ví Điện Tử
Vấn đề (Problem Statement)
Người dùng ví điện tử ngày càng bị lừa chuyển tiền do các kịch bản lừa đảo tinh vi (giả mạo người quen, giả danh cơ quan chức năng, link giả). Cảnh báo hiện tại chỉ mang tính tĩnh, chung chung, không phân tích ngữ cảnh giao dịch theo thời gian thực nên dễ bị người dùng bỏ qua — dẫn đến thiệt hại tài chính, tăng chi phí khiếu nại/hoàn tiền và ảnh hưởng uy tín doanh nghiệp.
Mục tiêu (Goal)
Xây dựng một AI Agent phân tích rủi ro giao dịch theo thời gian thực, đưa ra cảnh báo có giải thích cụ thể và (khi cần) can thiệp hội thoại nhiều bước để xác minh — nhưng không tự ý chặn giao dịch; quyết định cuối cùng luôn thuộc về người dùng (Human-in-the-Loop bắt buộc).
Đối tượng người dùng (Target Users)
•	Người dùng cuối của ví điện tử, thực hiện chuyển tiền.
•	Đội vận hành/CSKH (quản lý blacklist, kịch bản scam).
•	Ban quản trị doanh nghiệp ví điện tử (đơn vị ra đề, người trả tiền cho giải pháp).
Success Metrics (chỉ số thành công)
•	Giảm tỷ lệ giao dịch lừa đảo trót lọt (đo qua tỷ lệ phát hiện đúng — recall).
•	Tỷ lệ báo động giả (false positive) đủ thấp để không gây phiền người dùng.
•	Thời gian phản hồi cảnh báo dưới ngưỡng chấp nhận được cho trải nghiệm chuyển tiền (real-time).
•	Tỷ lệ người dùng làm theo khuyến nghị của agent khi rủi ro cao.
Phạm vi (Scope)
Trong phạm vi (MVP): phân tích rủi ro giao dịch (rule + ML), cảnh báo giải thích bằng LLM, đối chiếu kịch bản scam qua RAG, luồng can thiệp hội thoại HITL cơ bản, dashboard admin quản lý blacklist/kịch bản.
Ngoài phạm vi (giai đoạn sau): OCR ảnh tin nhắn/chat, cảnh báo qua giọng nói, dự đoán xu hướng scam dài hạn, tích hợp đa kênh (ngoài ví điện tử).
Ràng buộc bắt buộc (Hard Constraints)
•	HITL bắt buộc — AI/LLM không được tự quyết định chặn hoặc hủy giao dịch.
•	Tuân thủ PDPA (bảo vệ dữ liệu cá nhân), tránh cảnh báo gây phiền quá mức.
•	Mọi cảnh báo phải giải thích được lý do (không hộp đen).
Timeline tóm tắt
2 ngày (rule-based MVP) → 1 tuần (AI risk scoring + RAG) → 1 tháng (Agent HITL đầy đủ + admin dashboard). Chi tiết xem tài liệu “Giai đoạn hoàn thiện dự án”.
Stakeholders
Doanh nghiệp ví điện tử (sponsor/người trả tiền), người dùng cuối, đội CSKH/vận hành, cơ quan quản lý (PDPA, bảo vệ người tiêu dùng tài chính), mentor chương trình AI Build.
________________________________________
FIN-19 — Product Requirements Document (PRD)
1. Tổng quan (Overview)
Sản phẩm là một AI Agent tích hợp vào luồng chuyển tiền của ví điện tử, có nhiệm vụ phân tích rủi ro của mỗi giao dịch theo thời gian thực và đưa ra cảnh báo phù hợp với mức độ rủi ro. Với giao dịch rủi ro cao, agent chủ động hỏi thêm câu hỏi xác minh (hội thoại nhiều bước) trước khi để người dùng tự quyết định tiếp tục hay hủy giao dịch.
2. Mục tiêu & Success Metrics
Xem chi tiết ở phần Brief. PRD bổ sung các mục tiêu kỹ thuật: - Risk scoring model đạt độ chính xác chấp nhận được trên tập test (đo bằng precision/recall, không đặt con số cứng ở giai đoạn MVP). - Độ trễ xử lý cảnh báo không làm gián đoạn trải nghiệm chuyển tiền. - Toàn bộ quyết định của agent (câu hỏi hỏi gì, người dùng trả lời gì, khuyến nghị gì) được log đầy đủ phục vụ accountability.
3. User Personas
Persona	Mô tả	Nhu cầu chính
Người dùng phổ thông	Chuyển tiền thường xuyên, ít kiến thức bảo mật	Được cảnh báo rõ ràng, dễ hiểu, không bị làm phiền với giao dịch bình thường
Người dùng lớn tuổi	Ít quen công nghệ, dễ bị thao túng tâm lý	Cảnh báo đơn giản, hướng dẫn từng bước cụ thể
Nhân viên vận hành/CSKH	Quản lý blacklist, xử lý khiếu nại	Công cụ cập nhật dữ liệu nhanh, dashboard theo dõi hiệu quả cảnh báo
Quản trị doanh nghiệp	Ra quyết định đầu tư, chịu trách nhiệm tuân thủ	Báo cáo hiệu quả, bằng chứng tuân thủ pháp lý (log HITL)
4. User Stories
•	Là người dùng, tôi muốn được cảnh báo ngay khi chuyển tiền cho một người nhận có dấu hiệu lừa đảo, để tôi không mất tiền oan.
•	Là người dùng, tôi muốn hiểu rõ lý do vì sao giao dịch bị cảnh báo, để tôi tự tin quyết định tiếp tục hay dừng lại.
•	Là người dùng, tôi muốn agent hỏi thêm vài câu xác minh khi rủi ro cao, để tôi có thêm cơ sở nhận biết lừa đảo trước khi mất tiền.
•	Là người dùng, tôi không muốn bị làm phiền với cảnh báo khi chuyển tiền cho người nhận tôi đã xác nhận an toàn trước đó.
•	Là nhân viên vận hành, tôi muốn thêm một kịch bản lừa đảo mới vào hệ thống mà không cần đợi deploy lại, để hệ thống luôn cập nhật.
•	Là quản trị doanh nghiệp, tôi muốn xem báo cáo về số lượng cảnh báo, tỷ lệ người dùng làm theo khuyến nghị, để đánh giá hiệu quả sản phẩm.
5. Functional Requirements
5.1 Risk Analysis Engine
•	Phân tích mỗi giao dịch dựa trên: số tiền, tần suất, độ mới của người nhận, nội dung chuyển khoản, đối chiếu blacklist.
•	Trả về risk score và phân loại 3 mức: thấp / trung bình / cao.
5.2 Cảnh báo & Giải thích (LLM)
•	Sinh lời giải thích bằng ngôn ngữ tự nhiên, dựa trên dữ liệu đối chiếu thực tế (không tự suy diễn).
•	Với rủi ro trung bình/cao, tham chiếu kịch bản lừa đảo tương tự (qua RAG) để giải thích cụ thể.
5.3 Luồng can thiệp HITL (Agent)
•	Với rủi ro cao: đặt thêm 2–3 câu hỏi xác minh trước khi đưa khuyến nghị cuối.
•	Không tự động chặn/hủy giao dịch trong bất kỳ trường hợp nào — chỉ khuyến nghị.
•	Log đầy đủ toàn bộ luồng hội thoại và quyết định cuối cùng của người dùng.
5.4 Memory người nhận tin cậy
•	Cho phép người dùng đánh dấu người nhận là an toàn; giảm mức cảnh báo cho các lần chuyển tiếp theo tới cùng người nhận.
5.5 Admin Dashboard
•	Thêm/sửa/xóa blacklist người nhận.
•	Thêm kịch bản lừa đảo mới (tự động embedding vào vector DB).
•	Xem thống kê: số lượng cảnh báo theo mức độ, tỷ lệ người dùng tuân theo khuyến nghị.
5.6 Authentication & Phân quyền
•	Đăng nhập, phân quyền user/admin qua JWT.
6. Non-Functional Requirements
•	Hiệu năng: cảnh báo phải xuất hiện gần như tức thời, không làm gián đoạn luồng chuyển tiền.
•	Bảo mật: mã hóa dữ liệu nhạy cảm, sanitize input để chống prompt injection qua nội dung chuyển khoản.
•	Privacy: tuân thủ PDPA, ẩn danh hóa dữ liệu demo, không lưu trữ thông tin thật của người dùng thật.
•	Độ tin cậy: có cơ chế fallback rule-based khi AI service gặp sự cố.
•	Khả năng mở rộng: kiến trúc cho phép thêm kịch bản/blacklist mới mà không cần sửa code hoặc deploy lại.
7. Ngoài phạm vi (Out of Scope — MVP)
OCR ảnh chat/tin nhắn, cảnh báo bằng giọng nói, dự đoán xu hướng scam dài hạn, tích hợp đa kênh ngoài ví điện tử.
8. Giả định & Ràng buộc (Assumptions & Constraints)
•	Giả định người dùng sẽ đọc cảnh báo nếu được trình bày đủ rõ ràng và cụ thể (chưa được kiểm chứng — xem rủi ro).
•	Dữ liệu huấn luyện ban đầu chủ yếu là giả lập/case study công khai, chưa có dữ liệu giao dịch thật.
•	Ràng buộc pháp lý: AI không được tự động ra quyết định tài chính thay người dùng.
9. Dependencies
•	Nguồn dữ liệu kịch bản lừa đảo (ACB, chongluadao.vn, NCSC) cần được cập nhật định kỳ.
•	LLM API và vector DB là thành phần hạ tầng bắt buộc, ảnh hưởng trực tiếp đến chi phí vận hành ở quy mô lớn.
10. Acceptance Criteria (mức MVP)
•	Một giao dịch trùng khớp blacklist/kịch bản đã biết → hệ thống cảnh báo đúng mức độ rủi ro kèm giải thích.
•	Một giao dịch hợp lệ, bình thường → không bị cảnh báo sai (false positive) trong các case test cơ bản.
•	Giao dịch rủi ro cao → hệ thống đưa ra ít nhất một bước xác minh trước khuyến nghị cuối, toàn bộ được log lại.
•	Admin có thể thêm kịch bản mới qua dashboard và hệ thống nhận diện được ngay mà không cần deploy lại.
11. Rủi ro & Câu hỏi mở
•	Người dùng có thể bỏ qua cảnh báo vì tâm lý gấp gáp — cần kiểm chứng qua test người dùng thật.
•	Chi phí LLM ở quy mô lớn (hàng triệu giao dịch/ngày) chưa được ước tính chi tiết.
•	Trách nhiệm pháp lý khi cảnh báo sai (bỏ sót hoặc chặn nhầm giao dịch hợp lệ) cần được doanh nghiệp xác nhận rõ trước khi triển khai thật.
