import { useQuery } from "@tanstack/react-query";
import axiosInstance from "@/services/api/axios";
import {
  CheckCircle2,
  HeartHandshake,
  LockKeyhole,
  Shield,
  Target,
  Users,
} from "lucide-react";
import PublicSiteChrome from "@/components/layout/PublicSiteChrome";

const pillars = [
  {
    icon: Shield,
    title: "An toàn trước tiên",
    text: "Mọi trải nghiệm của Timi đều bắt đầu từ câu hỏi: làm thế nào để bảo vệ tốt hơn tiền bạc, dữ liệu và sự bình yên của người dùng?",
  },
  {
    icon: HeartHandshake,
    title: "Công nghệ vì con người",
    text: "AI phải giúp mọi người hiểu tài chính dễ hơn, ra quyết định tự tin hơn và tiếp cận dịch vụ tài chính một cách công bằng.",
  },
  {
    icon: Users,
    title: "Minh bạch và đồng hành",
    text: "Chúng tôi giải thích các cảnh báo rõ ràng, tôn trọng quyền lựa chọn và luôn đặt người dùng ở vị trí chủ động.",
  },
];

const commitments = [
  "Phát hiện sớm các dấu hiệu lừa đảo và giao dịch bất thường.",
  "Giúp người dùng hình thành thói quen quản lý tài chính lành mạnh.",
  "Bảo vệ dữ liệu bằng các lớp xác thực và kiểm soát truy cập phù hợp.",
  "Thiết kế sản phẩm đơn giản để mọi người đều có thể sử dụng.",
  "Liên tục lắng nghe phản hồi để cải thiện chất lượng dịch vụ.",
];

export default function MissionPage() {
  const managedQuery = useQuery({
    queryKey: ["public-content", "mission"],
    queryFn: async () => (await axiosInstance.get<Array<{ title: string | null; body: string | null; image_url: string | null; placement: string }>>("/v1/content/mission")).data,
  });
  return (
    <PublicSiteChrome>
      <main>
        <section className="w-full bg-[#F3F5FF]">
          <div className="w-full px-6 py-9 lg:px-12 lg:py-12 xl:px-20">
            <div className="max-w-4xl">
              <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-[#4F6BFF]">
                Timi · Sứ mệnh
              </p>
              <h1 className="font-display mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-[#0B0B0B] sm:text-4xl">
                Giúp mọi người bảo vệ và làm chủ đồng tiền của mình.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Timi được xây dựng để biến tài chính cá nhân từ một điều phức tạp và nhiều rủi ro
                thành một trải nghiệm rõ ràng, an toàn và dễ tiếp cận hơn mỗi ngày.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Vì sao Timi tồn tại</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                An tâm hơn trong từng quyết định tài chính
              </h2>
            </div>
            <div className="space-y-5 text-lg leading-8 text-slate-600">
              <p>
                Các giao dịch số giúp cuộc sống thuận tiện hơn, nhưng cũng kéo theo những rủi ro
                mới: lừa đảo, giả mạo, thao túng tâm lý và những quyết định vội vàng.
              </p>
              <p>
                Timi kết hợp trí tuệ nhân tạo, dữ liệu cảnh báo và thiết kế lấy con người làm trung tâm
                để trở thành một lớp bảo vệ chủ động cho mỗi người dùng.
              </p>
              <p>
                Chúng tôi không muốn thay bạn quyết định. Chúng tôi muốn cung cấp đúng thông tin,
                đúng thời điểm để bạn quyết định sáng suốt hơn.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Giá trị cốt lõi</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Ba nguyên tắc định hướng mọi sản phẩm</h2>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {pillars.map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-3xl border border-slate-200 bg-slate-50 p-7">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-xl font-bold">{title}</h3>
                  <p className="mt-3 leading-7 text-slate-600">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <Target className="h-7 w-7" />
              </div>
              <h2 className="mt-6 text-3xl font-bold sm:text-4xl">Timi cam kết điều gì?</h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Sứ mệnh chỉ có ý nghĩa khi được thể hiện bằng những việc cụ thể trong sản phẩm và
                cách chúng tôi phục vụ người dùng.
              </p>
            </div>
            <div className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
              <ul className="space-y-5">
                {commitments.map((commitment) => (
                  <li key={commitment} className="flex gap-3 leading-7 text-slate-700">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-blue-600" />
                    <span>{commitment}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {managedQuery.data?.length ? <section className="bg-violet-50 px-6 py-16 sm:py-20"><div className="mx-auto max-w-6xl"><p className="text-sm font-bold uppercase tracking-widest text-violet-600">Nội dung cập nhật</p><div className="mt-6 grid gap-5 md:grid-cols-2">{managedQuery.data.map((item) => <article key={`${item.title}-${item.placement}`} className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">{item.image_url && <div className="flex min-h-44 items-center justify-center overflow-hidden bg-slate-50"><img src={item.image_url} alt={item.title || "Nội dung sứ mệnh"} className="max-h-80 w-full object-contain" /></div>}<div className="p-6"><h2 className="text-xl font-bold text-slate-900">{item.title}</h2><p className="mt-3 leading-7 text-slate-600">{item.body}</p></div></article>)}</div></div></section> : null}

        <section className="bg-[#0B0B0B] px-6 py-16 text-white sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-blue-400">
                <LockKeyhole className="h-7 w-7" />
              </div>
              <h2 className="mt-6 text-3xl font-bold sm:text-4xl">Niềm tin được xây dựng mỗi ngày</h2>
            </div>
            <p className="text-lg leading-8 text-slate-300">
              Timi hiểu rằng tài chính là câu chuyện rất riêng của mỗi người. Vì vậy, chúng tôi
              luôn ưu tiên sự an toàn, tính minh bạch và khả năng kiểm soát của người dùng trong
              từng trải nghiệm — từ lúc mở tài khoản đến mỗi lần xác nhận giao dịch.
            </p>
          </div>
        </section>
      </main>
    </PublicSiteChrome>
  );
}
