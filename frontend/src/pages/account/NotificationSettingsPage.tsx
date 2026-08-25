import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, Check, Mail, ShieldAlert, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

type NotificationSettings = {
  transaction: boolean;
  security: boolean;
  promotion: boolean;
};

const defaults: NotificationSettings = {
  transaction: true,
  security: true,
  promotion: false,
};

function getStorageKey(email?: string) {
  return `timi-notification-settings:${email || "guest"}`;
}

export default function NotificationSettingsPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const email = useAuthStore((state) => state.user?.email);
  const storageKey = useMemo(() => getStorageKey(email), [email]);
  const [settings, setSettings] = useState<NotificationSettings>(() => {
    try {
      const saved = localStorage.getItem(getStorageKey(email));
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings, storageKey]);

  const items = [
    { key: "transaction" as const, title: "Giao dịch", description: "Nhận thông báo khi có giao dịch mới", icon: WalletCards, tone: "blue" },
    { key: "security" as const, title: "Bảo mật", description: "Cảnh báo khi phát hiện hoạt động bất thường", icon: ShieldAlert, tone: "violet" },
    { key: "promotion" as const, title: "Khuyến mãi", description: "Nhận ưu đãi và thông tin mới từ Timi", icon: Mail, tone: "fuchsia" },
  ];

  return (
    <div className="min-h-screen bg-[#f5f3ff] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <button type="button" onClick={() => navigate(isAuthenticated ? "/dashboard" : "/")} className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-violet-600">
          <ArrowLeft className="h-4 w-4" /> {isAuthenticated ? "Về Dashboard" : "Về trang chủ"}
        </button>
        <div className="mb-6 rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 p-7 text-white shadow-xl shadow-violet-200">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15"><Bell className="h-7 w-7" /></div>
            <div><h1 className="text-2xl font-bold">Cài đặt thông báo</h1><p className="mt-1 text-sm text-violet-100">Chọn loại thông báo bạn muốn nhận.</p></div>
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">
          {items.map(({ key, title, description, icon: Icon, tone }, index) => (
            <div key={key} className={`flex items-center gap-4 px-5 py-5 sm:px-7 ${index ? "border-t border-slate-100" : ""}`}>
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone === "blue" ? "bg-blue-50 text-blue-600" : tone === "violet" ? "bg-violet-50 text-violet-600" : "bg-fuchsia-50 text-fuchsia-600"}`}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-400">{description}</p></div>
              <button type="button" role="switch" aria-checked={settings[key]} aria-label={`Bật hoặc tắt ${title}`} onClick={() => setSettings((current) => ({ ...current, [key]: !current[key] }))} className={`relative flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-4 focus:ring-violet-500/20 ${settings[key] ? "border-violet-700 bg-violet-600" : "border-slate-300 bg-slate-200"}`}>
                <span className={`absolute left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform ${settings[key] ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-700"><Check className="h-4 w-4 shrink-0" /> Cài đặt được lưu tự động cho tài khoản này.</div>
      </div>
    </div>
  );
}
