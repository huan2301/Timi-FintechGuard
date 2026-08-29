import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Cookie,
  FileText,
  LockKeyhole,
  Mail,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import axiosInstance from "@/services/api/axios";
import PublicSiteChrome from "@/components/layout/PublicSiteChrome";

type LegalPageType = "terms" | "privacy" | "cookies";

interface LegalPageProps {
  type: LegalPageType;
}

type LegalSection = readonly [heading: string, body: string];

type LegalContent = {
  eyebrow: string;
  title: string;
  intro: string;
  icon: LucideIcon;
  points: readonly string[];
  sections: readonly LegalSection[];
};

const content: Record<LegalPageType, LegalContent> = {
  terms: {
    eyebrow: "Trung tâm chính sách · Điều khoản",
    title: "Điều khoản sử dụng",
    intro: "Các nguyên tắc rõ ràng để bạn sử dụng Timi an toàn, minh bạch và chủ động trong mọi giao dịch.",
    icon: FileText,
    points: [
      "Đọc kỹ thông tin trước khi xác nhận giao dịch",
      "Bảo vệ tài khoản và thông tin đăng nhập",
      "Sử dụng dịch vụ đúng mục đích, đúng quy định",
    ],
    sections: [
      [
        "1. Phạm vi và chấp nhận điều khoản",
        "Bằng việc tạo tài khoản, truy cập hoặc sử dụng Timi, bạn xác nhận đã đọc, hiểu và đồng ý với các điều khoản này. Nếu không đồng ý, vui lòng không tiếp tục sử dụng các tính năng của dịch vụ.",
      ],
      [
        "2. Tài khoản và thông tin người dùng",
        "Bạn cần cung cấp thông tin chính xác, cập nhật khi có thay đổi và tự chịu trách nhiệm bảo mật thông tin đăng nhập. Hãy thông báo ngay cho Timi nếu bạn nghi ngờ tài khoản hoặc thiết bị đã bị truy cập trái phép.",
      ],
      [
        "3. Giao dịch và xác nhận",
        "Trước khi xác nhận, bạn cần kiểm tra người nhận, số tiền và nội dung giao dịch. Timi có thể yêu cầu thêm bước xác thực hoặc tạm dừng giao dịch khi phát hiện dấu hiệu bất thường để bảo vệ tài khoản.",
      ],
      [
        "4. Cảnh báo Anti-Scam",
        "Các cảnh báo của Timi được tạo từ tín hiệu rủi ro và dữ liệu liên quan tại thời điểm phân tích. Cảnh báo là thông tin hỗ trợ ra quyết định, không thay thế cho việc bạn tự kiểm tra người nhận và nội dung giao dịch.",
      ],
      [
        "5. Hành vi không được phép",
        "Bạn không được sử dụng Timi để gian lận, mạo danh, xâm nhập, phát tán mã độc, can thiệp vào hoạt động của dịch vụ hoặc thực hiện bất kỳ hành vi nào vi phạm pháp luật.",
      ],
      [
        "6. Thay đổi và liên hệ",
        "Timi có thể cập nhật điều khoản để phản ánh thay đổi của sản phẩm hoặc quy định hiện hành. Phiên bản mới sẽ được công bố trên trang này. Nếu cần giải thích thêm, bạn có thể liên hệ Trung tâm trợ giúp.",
      ],
    ],
  },
  privacy: {
    eyebrow: "Trung tâm chính sách · Quyền riêng tư",
    title: "Chính sách bảo mật dữ liệu",
    intro: "Timi tôn trọng quyền riêng tư và giải thích rõ dữ liệu nào được sử dụng để vận hành, bảo vệ và cải thiện dịch vụ.",
    icon: ShieldCheck,
    points: [
      "Chỉ xử lý dữ liệu cho mục đích phù hợp",
      "Bảo vệ thông tin bằng kiểm soát truy cập",
      "Tôn trọng quyền kiểm tra và cập nhật dữ liệu",
    ],
    sections: [
      [
        "1. Thông tin Timi có thể xử lý",
        "Tùy vào tính năng bạn sử dụng, Timi có thể xử lý thông tin tài khoản, thông tin thiết bị, dữ liệu giao dịch, nhật ký bảo mật và thông tin bạn chủ động cung cấp khi cần hỗ trợ.",
      ],
      [
        "2. Camera và dữ liệu xác thực",
        "Khi bạn chọn đăng ký hoặc xác thực khuôn mặt, Timi có thể sử dụng camera và dữ liệu liên quan trong phạm vi cần thiết cho mục đích xác thực. Dữ liệu này không được dùng cho quảng cáo hoặc bán cho bên thứ ba.",
      ],
      [
        "3. Mục đích sử dụng",
        "Dữ liệu được dùng để tạo và duy trì tài khoản, xác minh danh tính, xử lý giao dịch, phát hiện rủi ro, hỗ trợ người dùng, cải thiện trải nghiệm và đáp ứng nghĩa vụ pháp lý khi có yêu cầu phù hợp.",
      ],
      [
        "4. Chia sẻ có kiểm soát",
        "Timi chỉ chia sẻ thông tin trong phạm vi cần thiết với nhà cung cấp hỗ trợ vận hành, đối tác xử lý dịch vụ hoặc cơ quan có thẩm quyền theo quy định. Các bên liên quan phải có trách nhiệm bảo vệ thông tin được cung cấp.",
      ],
      [
        "5. Lưu trữ và bảo vệ dữ liệu",
        "Timi áp dụng các biện pháp kỹ thuật và tổ chức phù hợp như kiểm soát quyền truy cập, bảo vệ đường truyền và theo dõi hoạt động bất thường. Không có phương thức truyền hoặc lưu trữ nào an toàn tuyệt đối, vì vậy bạn cũng cần bảo vệ thiết bị và thông tin đăng nhập của mình.",
      ],
      [
        "6. Quyền của bạn",
        "Bạn có thể yêu cầu xem, cập nhật hoặc xóa thông tin cá nhân trong phạm vi pháp luật cho phép. Một số dữ liệu có thể cần được lưu giữ trong thời gian nhất định để bảo mật, xử lý tranh chấp hoặc đáp ứng nghĩa vụ pháp lý.",
      ],
    ],
  },
  cookies: {
    eyebrow: "Trung tâm chính sách · Cookie",
    title: "Chính sách Cookie",
    intro: "Cookie giúp Timi ghi nhớ lựa chọn, duy trì phiên đăng nhập và hiểu cách cải thiện trải nghiệm trên website.",
    icon: Cookie,
    points: [
      "Cookie cần thiết giúp website hoạt động ổn định",
      "Cookie phân tích chỉ dùng để cải thiện dịch vụ",
      "Bạn có thể kiểm soát cookie trong trình duyệt",
    ],
    sections: [
      [
        "1. Cookie là gì?",
        "Cookie là các tệp dữ liệu nhỏ được lưu trên trình duyệt hoặc thiết bị của bạn. Chúng giúp website nhận biết phiên truy cập, ghi nhớ lựa chọn và cung cấp trải nghiệm nhất quán hơn.",
      ],
      [
        "2. Cookie cần thiết",
        "Timi có thể sử dụng cookie hoặc bộ nhớ cục bộ cần thiết cho đăng nhập, bảo mật phiên, điều hướng và hiển thị đúng giao diện. Nếu tắt các cơ chế này, một số tính năng có thể không hoạt động bình thường.",
      ],
      [
        "3. Phân tích và cải thiện",
        "Khi được bật, các công nghệ phân tích giúp Timi hiểu những phần đang hoạt động tốt và những điểm cần cải thiện. Timi ưu tiên sử dụng thông tin tổng hợp, phù hợp với mục đích vận hành dịch vụ.",
      ],
      [
        "4. Lựa chọn của bạn",
        "Bạn có thể xóa hoặc chặn cookie trong phần cài đặt của trình duyệt. Việc thay đổi cài đặt có thể làm mất một số lựa chọn đã lưu hoặc yêu cầu bạn đăng nhập lại.",
      ],
      [
        "5. Ứng dụng trên thiết bị",
        "Khi Timi được sử dụng trong ứng dụng di động, ứng dụng có thể dùng bộ nhớ và cơ chế phiên tương đương cookie để duy trì trạng thái, bảo mật và các lựa chọn của bạn.",
      ],
      [
        "6. Cập nhật chính sách",
        "Khi cách sử dụng cookie thay đổi, Timi sẽ cập nhật nội dung trên trang này và ghi rõ thời điểm cập nhật gần nhất.",
      ],
    ],
  },
};

const policyLinks: Array<{ type: LegalPageType; label: string; icon: LucideIcon }> = [
  { type: "terms", label: "Điều khoản sử dụng", icon: FileText },
  { type: "privacy", label: "Bảo mật dữ liệu", icon: ShieldCheck },
  { type: "cookies", label: "Chính sách Cookie", icon: Cookie },
];

export default function LegalPage({ type }: LegalPageProps) {
  const page = content[type];
  const PageIcon = page.icon;
  const managedQuery = useQuery({
    queryKey: ["public-content", type],
    queryFn: async () =>
      (
        await axiosInstance.get<
          Array<{ title: string | null; body: string | null; image_url: string | null }>
        >(`/v1/content/${type}`)
      ).data,
  });
  const sections = managedQuery.data?.length
    ? managedQuery.data.map((item) => [item.title || "Nội dung", item.body || ""] as const)
    : page.sections;

  return (
    <PublicSiteChrome>
      <main className="bg-slate-50">
        <section className="relative overflow-hidden bg-[#F3F5FF]">
          <div className="absolute -right-24 -top-36 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
          <div className="absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-blue-300/25 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-6 py-10 sm:py-12 lg:px-12 xl:px-20">
            <div className="flex max-w-4xl flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-white/75 shadow-lg shadow-violet-200/40 backdrop-blur-sm">
                <PageIcon className="h-7 w-7 text-[#4F6BFF]" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#4F6BFF]">{page.eyebrow}</p>
                <h1 className="font-display mt-3 text-3xl font-bold leading-tight tracking-tight text-[#0B0B0B] sm:text-4xl">{page.title}</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">{page.intro}</p>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/70 px-4 py-2 text-sm text-slate-600">
                  <CalendarDays className="h-4 w-4 text-[#4F6BFF]" />
                  Cập nhật lần cuối: 27/08/2026
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-10 sm:py-14 lg:px-12 xl:px-20">
          <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
            <aside className="lg:sticky lg:top-24">
              <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="px-3 pb-2 pt-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Trung tâm chính sách</p>
                <nav aria-label="Điều hướng chính sách" className="grid gap-1 sm:grid-cols-3 lg:grid-cols-1">
                  {policyLinks.map((link) => {
                    const Icon = link.icon;
                    const active = link.type === type;
                    return (
                      <Link
                        key={link.type}
                        to={`/${link.type}`}
                        className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-colors ${
                          active
                            ? "bg-blue-50 text-[#4F6BFF]"
                            : "text-slate-600 hover:bg-slate-50 hover:text-[#4F6BFF]"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{link.label}</span>
                        </span>
                        {active && <ChevronRight className="h-4 w-4 shrink-0" />}
                      </Link>
                    );
                  })}
                </nav>
              </div>
              <div className="mt-4 rounded-3xl bg-slate-900 p-5 text-white">
                <LockKeyhole className="h-5 w-5 text-blue-300" />
                <p className="mt-4 text-sm font-semibold">Cần giải thích thêm?</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">Đội ngũ Timi sẵn sàng hỗ trợ các câu hỏi về tài khoản và dữ liệu.</p>
                <Link to="/help" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-blue-300 hover:text-white">
                  Đến Trung tâm trợ giúp <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="rounded-[2rem] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-6 sm:p-8">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-blue-100">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Tóm tắt nhanh</p>
                    <h2 className="mt-2 text-xl font-bold text-slate-950">Những điều bạn nên biết</h2>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {page.points.map((point) => (
                    <div key={point} className="flex gap-2.5 rounded-2xl bg-white/80 p-3 text-sm leading-6 text-slate-600 ring-1 ring-blue-100/70">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              <article className="mt-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-6 sm:px-9">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Nội dung chính sách</p>
                  <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <h2 className="font-display text-2xl font-bold text-slate-950 sm:text-3xl">{page.title}</h2>
                    {managedQuery.isLoading && <span className="text-sm text-slate-400">Đang cập nhật nội dung…</span>}
                  </div>
                </div>
                <div className="divide-y divide-slate-100 px-6 sm:px-9">
                  {sections.map(([heading, text], index) => (
                    <section key={`${heading}-${index}`} className="py-7 sm:py-8">
                      <div className="flex gap-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-500">{String(index + 1).padStart(2, "0")}</span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-bold leading-7 text-slate-950">{heading}</h3>
                          <p className="mt-3 text-[15px] leading-7 text-slate-600">{text}</p>
                          {managedQuery.data?.[index]?.image_url && (
                            <div className="mt-5 flex min-h-44 w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
                              <img src={managedQuery.data[index].image_url || ""} alt={heading} className="max-h-80 w-full object-contain" />
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              </article>

              <div className="mt-6 flex flex-col gap-4 rounded-[2rem] bg-slate-950 p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div className="flex items-start gap-3">
                  <Mail className="mt-1 h-5 w-5 shrink-0 text-blue-300" />
                  <div>
                    <p className="font-bold">Bạn có câu hỏi về chính sách?</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">Gửi câu hỏi cho Timi, chúng tôi sẽ hỗ trợ bạn.</p>
                  </div>
                </div>
                <Link to="/help" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-blue-50">
                  Liên hệ hỗ trợ <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicSiteChrome>
  );
}
