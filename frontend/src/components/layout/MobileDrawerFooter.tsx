import { CircleHelp, ChevronRight, FileText, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

const supportLinks = [
  { to: "/help", label: "Trợ giúp", icon: CircleHelp },
  { to: "/terms", label: "Điều khoản sử dụng", icon: FileText },
  { to: "/privacy", label: "Chính sách bảo mật", icon: ShieldCheck },
];

export default function MobileDrawerFooter() {
  return (
    <div className="mt-auto border-t border-slate-100 pt-5">
      <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Hỗ trợ & thông tin
      </p>
      <div className="mt-2 grid gap-1">
        {supportLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-violet-700"
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex-1">{link.label}</span>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </Link>
          );
        })}
      </div>
      <div className="mt-4 rounded-2xl bg-violet-50 px-3 py-3">
        <p className="text-xs font-bold text-violet-700">Timi Banking</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Giao dịch an toàn, đơn giản mỗi ngày.
        </p>
      </div>
    </div>
  );
}
