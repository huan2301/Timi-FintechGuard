import { useQuery } from "@tanstack/react-query";
import axiosInstance from "@/services/api/axios";
import PublicSiteChrome from "@/components/layout/PublicSiteChrome";

interface LegalPageProps {
  type: "terms" | "privacy";
}

const content = {
  terms: {
    title: "Điều khoản sử dụng",
    intro: "Các điều khoản này quy định việc sử dụng dịch vụ Timi của bạn.",
    sections: [
      ["1. Chấp nhận điều khoản", "Bằng việc tạo tài khoản hoặc sử dụng Timi, bạn xác nhận đã đọc, hiểu và đồng ý với các điều khoản sử dụng này."],
      ["2. Tài khoản người dùng", "Bạn có trách nhiệm cung cấp thông tin chính xác, bảo mật thông tin đăng nhập và thông báo ngay cho Timi khi phát hiện hoạt động bất thường."],
      ["3. Sử dụng dịch vụ", "Bạn chỉ sử dụng Timi cho mục đích hợp pháp và không được can thiệp, phá hoại hoặc sử dụng dịch vụ để thực hiện hành vi gian lận."],
      ["4. Giao dịch và bảo mật", "Timi áp dụng các lớp bảo vệ phù hợp, tuy nhiên bạn vẫn cần kiểm tra kỹ thông tin người nhận trước khi xác nhận giao dịch."],
      ["5. Thay đổi điều khoản", "Timi có thể cập nhật điều khoản để phù hợp với dịch vụ và quy định hiện hành. Phiên bản mới sẽ được công bố trên trang này."],
    ],
  },
  privacy: {
    title: "Chính sách bảo mật",
    intro: "Timi tôn trọng quyền riêng tư và minh bạch về cách dữ liệu của bạn được sử dụng.",
    sections: [
      ["1. Dữ liệu được thu thập", "Timi có thể thu thập thông tin tài khoản, thông tin giao dịch và dữ liệu kỹ thuật cần thiết để vận hành, bảo vệ và cải thiện dịch vụ."],
      ["2. Dữ liệu khuôn mặt", "Dữ liệu khuôn mặt được sử dụng cho mục đích đăng ký và xác thực theo lựa chọn của bạn. Timi không sử dụng dữ liệu này cho mục đích quảng cáo."],
      ["3. Mục đích sử dụng", "Dữ liệu được dùng để xác minh danh tính, phát hiện rủi ro, hỗ trợ giao dịch và liên hệ với bạn về các vấn đề liên quan đến tài khoản."],
      ["4. Bảo vệ dữ liệu", "Timi áp dụng các biện pháp kỹ thuật và tổ chức phù hợp để hạn chế truy cập, sử dụng hoặc tiết lộ dữ liệu trái phép."],
      ["5. Quyền của bạn", "Bạn có thể yêu cầu kiểm tra, cập nhật hoặc xóa thông tin cá nhân theo quy định và quy trình hỗ trợ của Timi."],
    ],
  },
} as const;

export default function LegalPage({ type }: LegalPageProps) {
  const page = content[type];
  const managedQuery = useQuery({
    queryKey: ["public-content", type],
    queryFn: async () => (await axiosInstance.get<Array<{ title: string | null; body: string | null; image_url: string | null }>>(`/v1/content/${type}`)).data,
  });
  const sections = managedQuery.data?.length
    ? managedQuery.data.map((item) => [item.title || "Nội dung", item.body || ""] as const)
    : page.sections;

  return (
    <PublicSiteChrome>
      <main>
        <section className="w-full bg-[#F3F5FF]">
          <div className="w-full px-6 py-9 lg:px-12 lg:py-12 xl:px-20">
            <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-[#4F6BFF]">Timi · Thông tin pháp lý</p>
            <h1 className="font-display mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-[#0B0B0B] sm:text-4xl">{page.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{page.intro}</p>
          </div>
        </section>

        <section className="w-full bg-white">
          <div className="w-full px-6 py-12 lg:px-12 lg:py-20 xl:px-20">
            <div className="mx-auto max-w-4xl rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm sm:p-10">
              <div className="space-y-8">
                {sections.map(([heading, text], index) => (
                  <section key={heading} className="border-b border-slate-100 pb-8 last:border-0 last:pb-0">
                    <h2 className="font-display text-xl font-bold text-[#0B0B0B]">{heading}</h2>
                    <p className="mt-3 leading-7 text-slate-600">{text}</p>
                    {managedQuery.data?.[index]?.image_url && <div className="mt-4 flex min-h-44 w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-50"><img src={managedQuery.data[index].image_url || ""} alt={heading} className="max-h-80 w-full object-contain" /></div>}
                  </section>
                ))}
              </div>
              <p className="mt-10 border-t border-slate-100 pt-6 text-sm text-slate-500">Cập nhật lần cuối: 19/08/2026</p>
            </div>
          </div>
        </section>
      </main>
    </PublicSiteChrome>
  );
}
