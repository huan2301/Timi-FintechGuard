FIN-19 — AI Agent Chống Lừa Đảo & Cảnh Báo Giao Dịch Rủi Ro Cho Người Dùng Ví Điện Tử

Báo cáo nộp Gate 1 — Khảo sát, phân tích đề bài & thu thập thông tin Trạng thái tài liệu: Living Document — PRD/Brief sẽ tiếp tục được cập nhật qua các Gate tiếp theo dựa trên kết quả thử nghiệm thực tế (xem mục "Ghi chú quản lý thay đổi" cuối file).

1. Tổng quan đề bài

Người dùng ví điện tử ngày càng bị lừa chuyển tiền do các kịch bản lừa đảo tinh vi (giả mạo người quen, giả danh cơ quan chức năng, link giả). Cảnh báo hiện tại của các ví điện tử phần lớn mang tính tĩnh, chung chung, không phân tích ngữ cảnh giao dịch theo thời gian thực, nên dễ bị người dùng bỏ qua — dẫn đến thiệt hại tài chính, tăng chi phí khiếu nại/hoàn tiền và ảnh hưởng uy tín doanh nghiệp.

Giải pháp: xây dựng một AI Agent phân tích rủi ro giao dịch theo thời gian thực, đưa ra cảnh báo có giải thích cụ thể, và khi cần sẽ chủ động hỏi thêm để xác minh (hội thoại nhiều bước) trước khi để người dùng tự ra quyết định cuối cùng.

Ràng buộc bắt buộc (Hard Constraints)
Ràng buộc	Ý nghĩa
Human-in-the-Loop (HITL) bắt buộc	AI/LLM không được tự ý chặn hoặc hủy giao dịch — quyết định cuối cùng luôn thuộc về người dùng
Tuân thủ PDPA	Bảo vệ dữ liệu cá nhân, tránh cảnh báo gây phiền quá mức
Giải thích được (No Black-box)	Mọi cảnh báo phải nêu rõ lý do dựa trên dữ liệu thực tế, LLM không được tự suy diễn thêm
2. Đối tượng người dùng & Persona
Persona	Mô tả	Nhu cầu chính
Người dùng phổ thông	Chuyển tiền thường xuyên, ít kiến thức bảo mật	Cảnh báo rõ ràng, dễ hiểu, không bị làm phiền với giao dịch bình thường
Người dùng lớn tuổi	Ít quen công nghệ, dễ bị thao túng tâm lý	Cảnh báo đơn giản, hướng dẫn từng bước cụ thể
Nhân viên vận hành/CSKH	Quản lý blacklist, xử lý khiếu nại	Công cụ cập nhật dữ liệu nhanh, dashboard theo dõi hiệu quả cảnh báo
Quản trị doanh nghiệp	Ra quyết định đầu tư, chịu trách nhiệm tuân thủ	Báo cáo hiệu quả, bằng chứng tuân thủ pháp lý (log HITL)
3. Phạm vi dự án
Trong phạm vi (MVP)
Phân tích rủi ro giao dịch (rule-based + ML)
Cảnh báo được diễn giải bằng LLM
Đối chiếu kịch bản lừa đảo qua RAG (vector DB)
Luồng can thiệp hội thoại HITL cơ bản
Dashboard admin quản lý blacklist & kịch bản scam
Ngoài phạm vi (giai đoạn sau)
OCR ảnh tin nhắn/chat
Cảnh báo qua giọng nói
Dự đoán xu hướng scam dài hạn
Tích hợp đa kênh (ngoài ví điện tử)
4. Success Metrics
Recall — giảm tỷ lệ giao dịch lừa đảo trót lọt (tỷ lệ phát hiện đúng)
False Positive Rate — đủ thấp để không gây phiền người dùng
Latency — thời gian phản hồi cảnh báo dưới ngưỡng chấp nhận được cho trải nghiệm chuyển tiền (real-time)
Tỷ lệ tuân thủ khuyến nghị — số người dùng làm theo khuyến nghị của agent khi rủi ro cao
5. Kiến trúc luồng xử lý (tổng quan)

Bước 1 — Khởi tạo giao dịch Nhập thông tin (số tiền, tài khoản nguồn/đích, nội dung) → Xác thực người dùng (KYC/eKYC, định danh sinh trắc, phiên đăng nhập) → Submit giao dịch (timestamp, device fingerprint, IP/geo-location).

Bước 2 — Phân tích đa nguồn dữ liệu

Lịch sử giao dịch (tần suất, giá trị trung bình, vùng giao dịch)
Phân tích hành vi (velocity check, thói quen người dùng, bất thường)
Phân tích mạng lưới (graph analysis, quan hệ tài khoản, cluster gian lận)
Feature engineering (chuẩn hóa dữ liệu, vector đặc trưng, real-time feed)

Bước 3 — AI Risk Engine Chấm điểm rủi ro 0–100 bằng ML/Deep Learning, ensemble models, threshold engine, real-time inference.

Bước 4 — Phân loại & xử lý kết quả

Mức rủi ro	Điểm	Hành động
Thấp	0–30	Tự động phê duyệt → ghi log → thông báo thành công → giao dịch hoàn tất
Trung bình	31–70	Cảnh báo người dùng → yêu cầu xác thực bổ sung (OTP/sinh trắc/câu hỏi bảo mật) → xác nhận (duyệt) hoặc từ chối (hủy) → ghi log & cập nhật hồ sơ rủi ro
Cao	71–100	Chặn giao dịch tạm thời → HITL Review (chuyên viên kiểm duyệt) → đối chiếu AML/Blacklist → duyệt / từ chối / leo thang

Bước 5 — Báo cáo & lưu trữ Ghi log giao dịch (Transaction ID, điểm rủi ro, kết quả phán quyết) → Báo cáo tuân thủ (AML report, compliance log, alert dashboard) → Phản hồi mô hình (gán nhãn kết quả, retrain trigger, cập nhật ngưỡng) → vòng lặp cập nhật & học liên tục (retrain mô hình AI, cập nhật rule-based, feedback loop).

Sơ đồ chi tiết được đính kèm trong repo (xem thư mục Gate 1/assets).

6. Yêu cầu chức năng chính (Functional Requirements)
Risk Analysis Engine — phân tích số tiền, tần suất, độ mới của người nhận, nội dung chuyển khoản, đối chiếu blacklist; trả về risk score + phân loại 3 mức.
Cảnh báo & Giải thích (LLM) — sinh lời giải thích tự nhiên dựa trên dữ liệu thực tế; với rủi ro trung bình/cao, tham chiếu kịch bản lừa đảo tương tự qua RAG.
Luồng can thiệp HITL (Agent) — với rủi ro cao, đặt thêm 2–3 câu hỏi xác minh trước khi đưa khuyến nghị cuối; không tự động chặn/hủy; log đầy đủ toàn bộ luồng hội thoại.
Memory người nhận tin cậy — giảm mức cảnh báo cho các lần chuyển tiếp theo tới người nhận đã được đánh dấu an toàn.
Admin Dashboard — thêm/sửa/xóa blacklist, thêm kịch bản lừa đảo mới (tự động embedding vào vector DB), xem thống kê cảnh báo.
Authentication & Phân quyền — đăng nhập, phân quyền user/admin qua JWT.
7. Yêu cầu phi chức năng (Non-Functional Requirements)
Hiệu năng: cảnh báo xuất hiện gần như tức thời, không gián đoạn luồng chuyển tiền
Bảo mật: mã hóa dữ liệu nhạy cảm, sanitize input chống prompt injection qua nội dung chuyển khoản
Privacy: tuân thủ PDPA, ẩn danh hóa dữ liệu demo
Độ tin cậy: có cơ chế fallback rule-based khi AI service gặp sự cố
Khả năng mở rộng: thêm kịch bản/blacklist mới mà không cần sửa code hoặc deploy lại
8. Timeline & các giai đoạn build
Giai đoạn	Thời điểm	Trạng thái demo sau giai đoạn
0. Kick-off	Ngày 0.5	Repo chạy, chưa có tính năng
1. Core Rule-Based MVP	Ngày 1–2	Demo end-to-end đơn giản (rule + LLM giải thích) — Gate 1
2. AI Risk Scoring	Tuần 1 (đầu)	Cảnh báo có phân tầng rủi ro
3. RAG Kịch bản Scam	Tuần 1 (cuối)	Cảnh báo giải thích cụ thể theo kịch bản
4. Agent HITL	Tuần 2 (đầu)	Hội thoại can thiệp nhiều bước
5. Admin Dashboard	Tuần 2 (song song)	Vận hành tự cập nhật dữ liệu
6. Hardening (bảo mật, PDPA, chống injection)	Tuần 2 (song song)	Chống injection, bảo mật, privacy
7. Testing & QA	Cuối tuần 2	Có số liệu đo lường thật
8. Demo Prep & Pitch	Trước nộp 1 ngày	Kịch bản pitch hoàn chỉnh
9. Deployment & Submission	Trước nộp	Sản phẩm sống, giám khảo tự trải nghiệm được
Trạng thái Gate 1 (Giai đoạn 1 — Core Rule-Based MVP, Ngày 1–2)

Mục tiêu: có một luồng chạy được đầu-cuối, dù đơn giản, làm xương sống cho các giai đoạn sau.

Đầu ra:

API kiểm tra rule cơ bản: đối chiếu blacklist tĩnh, ngưỡng số tiền, người nhận mới lần đầu
LLM viết lại kết quả rule thành lời cảnh báo tự nhiên bằng tiếng Việt
Frontend: form chuyển tiền + popup cảnh báo tĩnh

Definition of Done: Demo được kịch bản "chuyển tiền cho số trong blacklist → hiện cảnh báo giải thích bằng tiếng Việt tự nhiên → user chọn tiếp tục hoặc hủy".

Rủi ro cần canh: không để LLM tự ý thêm thông tin không có trong dữ liệu đối chiếu (hallucination) — prompt phải ràng buộc rõ "chỉ diễn giải dữ liệu được cung cấp".

9. Giả định, Rủi ro & Câu hỏi mở

Giả định:

Người dùng sẽ đọc cảnh báo nếu được trình bày đủ rõ ràng, cụ thể (chưa được kiểm chứng)
Dữ liệu huấn luyện ban đầu chủ yếu là giả lập/case study công khai, chưa có dữ liệu giao dịch thật

Ràng buộc pháp lý: AI không được tự động ra quyết định tài chính thay người dùng.

Rủi ro & câu hỏi mở:

Người dùng có thể bỏ qua cảnh báo vì tâm lý gấp gáp — cần kiểm chứng qua test người dùng thật
Chi phí LLM ở quy mô lớn (hàng triệu giao dịch/ngày) chưa được ước tính chi tiết
Trách nhiệm pháp lý khi cảnh báo sai (bỏ sót hoặc chặn nhầm giao dịch hợp lệ) cần được doanh nghiệp xác nhận rõ trước khi triển khai thật

Dependencies:

Nguồn dữ liệu kịch bản lừa đảo (ACB, chongluadao.vn, NCSC) cần được cập nhật định kỳ
LLM API và vector DB là hạ tầng bắt buộc, ảnh hưởng trực tiếp đến chi phí vận hành ở quy mô lớn
10. Acceptance Criteria (mức MVP)
 Giao dịch trùng khớp blacklist/kịch bản đã biết → hệ thống cảnh báo đúng mức độ rủi ro kèm giải thích
 Giao dịch hợp lệ, bình thường → không bị cảnh báo sai (false positive) trong các case test cơ bản
 Giao dịch rủi ro cao → hệ thống đưa ra ít nhất một bước xác minh trước khuyến nghị cuối, toàn bộ được log lại
 Admin có thể thêm kịch bản mới qua dashboard và hệ thống nhận diện được ngay mà không cần deploy lại
11. Ghi chú quản lý thay đổi (Living Document)

PRD/Brief của dự án được xem là tài liệu sống, không phải bản chốt cứng ở Gate 1:

Ở Gate 1, tài liệu này đóng vai trò kim chỉ nam — thể hiện team có kế hoạch rõ ràng và tư duy logic.
Trong quá trình build, nếu qua thử nghiệm phát hiện hướng cũ chưa tối ưu, team sẽ cập nhật lại PRD và ghi chú lý do thay đổi trong commit history của repo.
Các tính năng ngoài core MVP có thể được điều chỉnh phạm vi dựa trên kết quả test thực tế ở các Gate tiếp theo.