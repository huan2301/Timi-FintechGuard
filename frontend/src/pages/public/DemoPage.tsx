import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  MessageCircle,
  PhoneCall,
  PlayCircle,
  QrCode,
  ScanLine,
  Send,
  ShieldAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import PublicSiteChrome from "@/components/layout/PublicSiteChrome";
import axiosInstance from "@/services/api/axios";
import { useAuthStore } from "@/stores/authStore";

type ManagedContent = {
  id: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
};

type FeatureGuide = {
  id: string;
  icon: LucideIcon;
  shortLabel: string;
  title: string;
  description: string;
  steps: readonly string[];
  result: string;
  destination: string;
  actionLabel: string;
};

const featureGuides: readonly FeatureGuide[] = [
  {
    id: "start",
    icon: UserCheck,
    shortLabel: "Bắt đầu",
    title: "Tạo tài khoản và vào Timi",
    description: "Bắt đầu bằng email, mật khẩu và số điện thoại. Sau đăng nhập, Timi yêu cầu xác nhận vị trí gần đúng trên thiết bị mới.",
    steps: [
      "Đăng ký tài khoản với email và số điện thoại.",
      "Đăng nhập rồi cấp quyền vị trí khi Timi yêu cầu.",
      "Mở Tổng quan để xem số dư và các lối tắt chính.",
    ],
    result: "Tài khoản sẵn sàng để thiết lập bảo mật và dùng các tính năng giao dịch.",
    destination: "/register",
    actionLabel: "Tạo tài khoản",
  },
  {
    id: "transfer",
    icon: Send,
    shortLabel: "Chuyển tiền",
    title: "Chuyển tiền có kiểm tra rủi ro",
    description: "Timi tra cứu lại người nhận, kiểm tra số dư và phân tích rủi ro trước khi bạn xác nhận giao dịch.",
    steps: [
      "Nhập số tài khoản, chọn ngân hàng, sau đó chờ Timi đối chiếu tên chủ tài khoản.",
      "Nhập số tiền và nội dung; bấm Kiểm tra để xem đánh giá rủi ro.",
      "Kiểm tra lại thông tin, xác thực bằng PIN hoặc Face ID rồi mới hoàn tất.",
    ],
    result: "Bạn biết rõ người nhận, mức rủi ro và luôn là người quyết định có tiếp tục hay không.",
    destination: "/transfer",
    actionLabel: "Mở Chuyển tiền",
  },
  {
    id: "qr",
    icon: QrCode,
    shortLabel: "QR an toàn",
    title: "Quét hoặc tạo QR thanh toán",
    description: "Quét QR thanh toán để điền sẵn giao dịch, hoặc tạo QR nhận tiền có số tiền và nội dung tùy chọn.",
    steps: [
      "Chọn Quét QR để dùng camera hoặc tải ảnh QR từ thiết bị.",
      "QR thanh toán sẽ mở bản nháp Chuyển tiền; QR link được kiểm tra dấu hiệu rủi ro.",
      "Khi tạo QR, chia sẻ mã để người gửi mở đúng luồng thanh toán của Timi.",
    ],
    result: "Thông tin thanh toán được điền nhanh hơn, nhưng tên người nhận vẫn được Timi tra cứu lại.",
    destination: "/qr?mode=scan",
    actionLabel: "Mở Quét QR",
  },
  {
    id: "security",
    icon: KeyRound,
    shortLabel: "PIN & Face ID",
    title: "Thiết lập lớp xác thực giao dịch",
    description: "PIN dùng cho xác nhận giao dịch; Face ID là lớp xác thực bổ sung khi thao tác nhạy cảm hoặc giao dịch lớn.",
    steps: [
      "Mở Hồ sơ để kiểm tra trạng thái PIN và Face ID.",
      "Thiết lập PIN giao dịch, không chia sẻ mã này với bất kỳ ai.",
      "Nếu chưa đăng ký Face ID, làm theo hướng dẫn camera trong phần bảo mật.",
    ],
    result: "Tài khoản có thêm lớp xác thực trước khi tiền được chuyển đi.",
    destination: "/me",
    actionLabel: "Mở Bảo mật tài khoản",
  },
  {
    id: "guardian",
    icon: PhoneCall,
    shortLabel: "Bảo vệ cuộc gọi",
    title: "Nhận cảnh báo khi cuộc gọi có dấu hiệu lừa đảo",
    description: "Guardian lắng nghe theo quyền microphone trong phiên đăng nhập, chuyển lời nói thành tín hiệu rủi ro và cảnh báo khi phát hiện dấu hiệu như giả mạo, OTP hoặc thúc giục chuyển tiền.",
    steps: [
      "Đăng nhập và cấp quyền microphone khi bạn muốn dùng lớp bảo vệ cuộc gọi.",
      "Timi phân tích transcript theo thời gian thực, không tự thực hiện giao dịch.",
      "Khi có cảnh báo, dừng cuộc gọi và xác minh qua số chính thức hoặc kênh độc lập.",
    ],
    result: "Bạn nhận được cảnh báo sớm để bình tĩnh kiểm tra, thay vì bị thúc ép chuyển tiền.",
    destination: "/dashboard",
    actionLabel: "Mở Tổng quan",
  },
  {
    id: "assistant",
    icon: MessageCircle,
    shortLabel: "Trợ lý Timi",
    title: "Hỏi Timi để được hướng dẫn trong ứng dụng",
    description: "Trợ lý giải thích chức năng, hướng dẫn luồng chuyển tiền và đưa bạn đến đúng trang; trợ lý không thể tự chuyển tiền hay xem thông tin bí mật của bạn.",
    steps: [
      "Mở khung Trò chuyện với Timi ở khu vực đã đăng nhập.",
      "Nói rõ mục tiêu, ví dụ: “Tôi muốn quét QR” hoặc “Hướng dẫn chuyển tiền”.",
      "Kiểm tra lại thông tin trên màn hình trước khi thực hiện bất kỳ giao dịch nào.",
    ],
    result: "Bạn nhận được hướng dẫn theo ngữ cảnh, còn các quyết định và xác nhận quan trọng vẫn do bạn thực hiện.",
    destination: "/dashboard",
    actionLabel: "Mở Timi Assistant",
  },
];

export default function DemoPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [activeFeatureId, setActiveFeatureId] = useState(featureGuides[0].id);
  const managedQuery = useQuery({
    queryKey: ["public-content", "demo"],
    queryFn: async () => (await axiosInstance.get<ManagedContent[]>("/v1/content/demo")).data,
  });
  const activeFeature = featureGuides.find((guide) => guide.id === activeFeatureId) ?? featureGuides[0];
  const ActiveIcon = activeFeature.icon;

  const openFeature = (destination: string) => {
    if (isAuthenticated) {
      navigate(destination);
      return;
    }
    navigate("/login", { state: { returnTo: destination } });
  };

  return (
    <PublicSiteChrome>
      <main className="bg-white text-slate-900">
        <section className="relative overflow-hidden bg-[#F3F5FF] px-6 py-10 sm:py-12 lg:px-12 xl:px-20">
          <div className="absolute -left-32 top-0 h-[26rem] w-[26rem] rounded-full bg-blue-300/25 blur-3xl" />
          <div className="absolute -right-32 bottom-0 h-[24rem] w-[24rem] rounded-full bg-violet-300/25 blur-3xl" />
          <div className="relative mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#4F6BFF]">
                <PlayCircle className="h-4 w-4" /> Hướng dẫn dùng Timi
              </div>
              <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[#0B0B0B] sm:text-4xl">
                Thử từng tính năng chính, theo đúng thứ tự an toàn.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Chọn một mục bên dưới để xem bạn cần làm gì, Timi kiểm tra điều gì và đi thẳng tới nơi thực hiện khi đã sẵn sàng.
              </p>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
              <div className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-lg shadow-violet-200/40 backdrop-blur-sm sm:p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Các tính năng chính</p>
                <div className="mt-5 space-y-2">
                  {featureGuides.map(({ id, icon: Icon, shortLabel }, index) => {
                    const isActive = id === activeFeature.id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActiveFeatureId(id)}
                        className={`flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition ${
                          isActive
                            ? "bg-[#4F6BFF] text-white shadow-lg shadow-blue-200"
                            : "text-slate-600 hover:bg-blue-50 hover:text-[#4F6BFF]"
                        }`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-semibold">{index + 1}. {shortLabel}</span>
                        <ArrowRight className={`h-4 w-4 shrink-0 transition-transform ${isActive ? "translate-x-0.5" : "opacity-40"}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <article className="flex flex-col justify-between rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-700 p-7 text-white shadow-2xl shadow-blue-200/70 sm:p-9">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-100">
                      {activeFeature.shortLabel}
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                      <ActiveIcon className="h-5 w-5 text-white" />
                    </span>
                  </div>
                  <h2 className="mt-8 max-w-xl text-3xl font-bold leading-tight sm:text-4xl">{activeFeature.title}</h2>
                  <p className="mt-4 max-w-xl text-base leading-7 text-blue-100">{activeFeature.description}</p>
                  <ol className="mt-7 space-y-3">
                    {activeFeature.steps.map((step, index) => (
                      <li key={step} className="flex gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm leading-6 text-white/95">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold">{index + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="mt-7 rounded-2xl border border-white/15 bg-slate-950/15 p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-200">Sau khi hoàn tất</p>
                  <p className="mt-2 text-sm leading-6 text-white/95">{activeFeature.result}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openFeature(activeFeature.destination)}
                  className="mt-5 inline-flex w-fit items-center gap-2 rounded-2xl bg-white px-5 py-3 font-bold text-blue-700 transition hover:bg-blue-50"
                >
                  {activeFeature.actionLabel} <ArrowRight className="h-4 w-4" />
                </button>
              </article>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-16 sm:py-20 lg:px-12 xl:px-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Lần đầu sử dụng</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Một lộ trình ngắn để bắt đầu an tâm</h2>
              <p className="mt-4 leading-7 text-slate-500">Bạn không cần bật mọi tính năng cùng lúc. Ba bước này giúp tạo nền tảng trước khi giao dịch.</p>
            </div>
            <div className="mt-9 grid gap-5 md:grid-cols-3">
              {[
                { title: "1. Vào tài khoản", text: "Đăng ký, đăng nhập và xác nhận vị trí trên thiết bị mới.", icon: UserCheck, destination: "/register" },
                { title: "2. Bảo vệ giao dịch", text: "Thiết lập PIN, sau đó đăng ký Face ID nếu bạn muốn dùng lớp xác thực bổ sung.", icon: KeyRound, destination: "/me" },
                { title: "3. Thử một luồng", text: "Mở Chuyển tiền hoặc Quét QR để xem Timi kiểm tra người nhận và rủi ro thế nào.", icon: ScanLine, destination: "/transfer" },
              ].map(({ title, text, icon: Icon, destination }) => (
                <button key={title} type="button" onClick={() => openFeature(destination)} className="group rounded-3xl border border-slate-200 bg-slate-50 p-6 text-left transition hover:-translate-y-1 hover:border-blue-200 hover:bg-blue-50 hover:shadow-lg hover:shadow-blue-100/50">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 transition group-hover:bg-[#4F6BFF] group-hover:text-white"><Icon className="h-6 w-6" /></span>
                  <h3 className="mt-5 text-xl font-bold text-slate-900">{title}</h3>
                  <p className="mt-2 leading-7 text-slate-500">{text}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-600">Mở bước này <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#F8FAFF] px-6 py-16 sm:py-20 lg:px-12 xl:px-20">
          <div className="mx-auto grid max-w-6xl gap-8 rounded-[2rem] border border-blue-100 bg-white p-7 shadow-sm md:grid-cols-[auto_1fr] md:items-start sm:p-9">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500"><ShieldAlert className="h-6 w-6" /></span>
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-rose-500">Nguyên tắc an toàn</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">Timi hỗ trợ bạn quyết định, không thay bạn quyết định.</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  "Không chia sẻ OTP, PIN, mật khẩu hoặc mã xác thực cho bất kỳ ai.",
                  "Luôn kiểm tra tên người nhận và nội dung trước khi xác nhận.",
                  "Cảnh báo rủi ro là tín hiệu để dừng lại và xác minh qua kênh độc lập.",
                  "Timi Assistant chỉ hướng dẫn; bạn luôn tự bấm xác nhận giao dịch.",
                ].map((item) => (
                  <p key={item} className="flex gap-2.5 text-sm leading-6 text-slate-600"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{item}</p>
                ))}
              </div>
            </div>
          </div>
        </section>

        {managedQuery.data?.length ? (
          <section className="bg-white px-6 py-16 lg:px-12 xl:px-20">
            <div className="mx-auto max-w-6xl">
              <p className="text-sm font-bold uppercase tracking-widest text-violet-600">Nội dung từ Admin</p>
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                {managedQuery.data.map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">
                    {item.image_url && <img src={item.image_url} alt={item.title || "Hình ảnh demo Timi"} className="h-48 w-full object-contain" />}
                    <div className="p-6"><h2 className="text-xl font-bold">{item.title || "AI Anti-Scam"}</h2><p className="mt-3 leading-7 text-slate-600">{item.body}</p></div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="bg-white px-6 pb-16 text-center sm:pb-20 lg:px-12 xl:px-20">
          <h2 className="text-3xl font-bold">Sẵn sàng trải nghiệm Timi?</h2>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-slate-500">Bắt đầu từ một tính năng bạn cần nhất; các lớp bảo vệ sẽ hướng dẫn bạn trong từng bước.</p>
          <Link to={isAuthenticated ? "/dashboard" : "/register"} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 font-bold text-white transition hover:bg-slate-800">{isAuthenticated ? "Mở Timi Banking" : "Tạo tài khoản"} <ArrowRight className="h-5 w-5" /></Link>
        </section>
      </main>
    </PublicSiteChrome>
  );
}
