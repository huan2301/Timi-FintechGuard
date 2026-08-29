import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import axiosInstance from "@/services/api/axios";
import { authApi } from "@/services/api/auth";
import FaceVerificationModal, { type FaceMatchResult } from "@/components/auth/FaceVerificationModal";
import ContentManagementTab from "@/pages/admin/ContentManagementTab";
import { ProfileNotificationBell } from "@/pages/account/ProfilePage";
import { useNavigate } from "react-router-dom";
//Đã check admin page
import {
  ArrowLeft,
  ArrowRightLeft,
  ShieldAlert,
  BarChart3,
  Settings,
  Search,
  Ban,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Filter,
  Download,
  MoreVertical,
  FileClock,
  RefreshCw,
  Activity,
  Wifi,
  Pause,
  Play,
  Users,
  Trash2,
  Menu,
  X,
  Plus,
  Home,
  Mail,
  Send,
  Megaphone,
  Eye,
  Files,
} from "lucide-react";

type TabType =
  | "overview"
  | "transactions"
  | "users"
  | "blacklist"
  | "audit"
  | "email"
  | "content"
  | "settings"
  | "agent-metrics";

type AdminTransaction = {
  id: string;
  user_id: string;
  user_name: string;
  payee_account: string;
  payee_name: string;
  bank_code: string | null;
  amount: number;
  transaction_status: string;
  risk_level: "safe" | "low" | "medium" | "high" | null;
  created_at: string;
};

type AdminAuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata_json: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

type AdminStats = {
  total_transactions: number;
  by_risk_level: Record<string, number>;
  high_risk_count: number;
  high_risk_cancelled: number;
  recommendation_compliance_rate: number | null;
  blacklist_size: number;
  pattern_count: number;
};

type AdminAgentMetric = {
  agent_id: string;
  name: string;
  description: string;
  group: "supervisor" | "standalone";
  status: "ready" | "active" | "legacy";
  capabilities: string[];
  api_path: string;
  calls: number;
  successes: number;
  failures: number;
  success_rate: number | null;
  avg_latency_ms: number | null;
  last_activity_at: string | null;
  domain_events: number;
  domain_last_activity_at: string | null;
};

type AdminSupervisorMetric = {
  id: string;
  name: string;
  routing_mode: string;
  managed_agent_count: number;
  dispatches: number;
  successes: number;
  failures: number;
  success_rate: number | null;
  avg_latency_ms: number | null;
  last_activity_at: string | null;
};

type AdminAgentMetrics = {
  generated_at: string;
  supervisor: AdminSupervisorMetric;
  managed_agents: AdminAgentMetric[];
  intervention_agent: AdminAgentMetric;
};

type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
};

type BlacklistEntry = {
  id: string;
  entity_type: string;
  entity_value: string;
  bank?: string | null;
  source: string;
  evidence?: Record<string, unknown> | null;
  created_at: string;
};

type BlacklistPage = {
  items: BlacklistEntry[];
  next_cursor: string | null;
};

function useAdminTransactions() {
  return useQuery({
    queryKey: ["admin-transactions"],
    queryFn: async () => (await axiosInstance.get<AdminTransaction[]>("/v1/admin/transactions", { params: { limit: 100 } })).data,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

function useAdminAgentMetrics() {
  return useQuery<AdminAgentMetrics>({
    queryKey: ["admin-agent-metrics"],
    queryFn: async () => (await axiosInstance.get<AdminAgentMetrics>("/v1/admin/agent-metrics")).data,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

type AdminTransactionsQuery = ReturnType<typeof useAdminTransactions>;

// ===== SHARED FALCON-STYLE PRIMITIVES =====

/** Card shell matching Falcon's widget cards: white surface, soft shadow, thin border, header slot. */
function FalconCard({
  title,
  subtitle,
  action,
  className = "",
  bodyClassName = "p-4",
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-[0_0.75rem_1.5rem_rgba(18,38,63,0.03)] ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

function IconBadge({ icon: Icon, tone }: { icon: any; tone: "primary" | "success" | "warning" | "danger" | "info" | "violet" }) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "warning"
      ? "bg-amber-50 text-amber-600"
      : tone === "danger"
      ? "bg-red-50 text-red-600"
      : tone === "info"
      ? "bg-sky-50 text-sky-600"
      : tone === "violet"
      ? "bg-violet-50 text-violet-600"
      : "bg-blue-50 text-blue-600";
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
      <Icon className="h-4 w-4" />
    </div>
  );
}

function SoftBadge({ tone, children }: { tone: "success" | "warning" | "danger" | "info" | "slate"; children: React.ReactNode }) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "warning"
      ? "bg-amber-50 text-amber-600"
      : tone === "danger"
      ? "bg-red-50 text-red-600"
      : tone === "info"
      ? "bg-sky-50 text-sky-600"
      : "bg-slate-100 text-slate-500";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

/** Small inline trend line, no axes — used inside compact stat cards. */
function Sparkline({ values, color = "#2563eb", height = 32, width = 96, fill = false }: { values: number[]; color?: string; height?: number; width?: number; fill?: boolean }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => ({ x: i * stepX, y: height - ((v - min) / range) * (height - 4) - 2 }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="shrink-0 overflow-visible">
      {fill && <path d={areaPath} fill={color} fillOpacity={0.12} stroke="none" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Vertical bar sparkline (last bar highlighted) — used inside compact stat cards. */
function BarSparkline({ values, color = "#2563eb", height = 32 }: { values: number[]; color?: string; height?: number }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex shrink-0 items-end gap-1" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm"
          style={{ height: `${Math.max((v / max) * 100, 8)}%`, backgroundColor: i === values.length - 1 ? color : `${color}45` }}
        />
      ))}
    </div>
  );
}

/** Ring / donut chart. Pass one segment for a single percentage, or several for a distribution. */
function DonutChart({
  segments,
  size = 128,
  trackColor = "#e2e8f0",
  centerLabel,
  centerSublabel,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  trackColor?: string;
  centerLabel?: string;
  centerSublabel?: string;
}) {
  let cumulative = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={trackColor} strokeWidth="3" />
        {segments.map((seg, i) => {
          const dash = `${seg.value} ${100 - seg.value}`;
          const offset = -cumulative;
          cumulative += seg.value;
          return (
            <circle
              key={i}
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke={seg.color}
              strokeWidth="3"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              strokeLinecap={segments.length === 1 ? "round" : "butt"}
            />
          );
        })}
      </svg>
      {(centerLabel || centerSublabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
          {centerLabel && <span className="text-xl font-bold text-slate-800">{centerLabel}</span>}
          {centerSublabel && <span className="text-[10px] leading-tight text-slate-400">{centerSublabel}</span>}
        </div>
      )}
    </div>
  );
}

/** Larger filled trend chart with gridlines and axis labels — used for the daily volume widget. */
function TrendAreaChart({ data, height = 200, color = "#2563eb", gradientId }: { data: { label: string; value: number }[]; height?: number; color?: string; gradientId: string }) {
  const width = 640;
  const max = Math.max(...data.map((d) => d.value), 1);
  const niceMax = Math.max(Math.ceil(max / 4) * 4, 4);
  const stepX = width / Math.max(data.length - 1, 1);
  const points = data.map((d, i) => ({ x: i * stepX, y: height - (d.value / niceMax) * (height - 20) - 10 }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const gridFractions = [0, 0.25, 0.5, 0.75, 1];
  const labelStride = Math.max(Math.ceil(data.length / 8), 1);
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 22}`} className="w-full" style={{ minWidth: Math.max(data.length * 28, 420) }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridFractions.map((g) => (
          <line key={g} x1="0" x2={width} y1={height - g * (height - 20) - 10} y2={height - g * (height - 20) - 10} stroke="#eef2f7" strokeDasharray="4 4" />
        ))}
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke={color} strokeWidth="2" />
        ))}
        {data.map((d, i) =>
          i % labelStride === 0 ? (
            <text key={i} x={points[i].x} y={height + 16} textAnchor="middle" fontSize="10" fill="#94a3b8">
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/** Grouped bar comparison (two series) — used for the per-bank breakdown widget. */
function GroupedBarChart({
  data,
  seriesA,
  seriesB,
  height = 160,
}: {
  data: { label: string; a: number; b: number }[];
  seriesA: { label: string; color: string };
  seriesB: { label: string; color: string };
  height?: number;
}) {
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  return (
    <div>
      <div className="mb-4 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesA.color }} />
          {seriesA.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesB.color }} />
          {seriesB.label}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex items-end gap-1" style={{ height }}>
              <div className="w-3 rounded-t-sm sm:w-4" style={{ height: `${Math.max((d.a / max) * 100, 3)}%`, backgroundColor: seriesA.color }} />
              <div className="w-3 rounded-t-sm sm:w-4" style={{ height: `${Math.max((d.b / max) * 100, 3)}%`, backgroundColor: seriesB.color }} />
            </div>
            <span className="max-w-[56px] truncate text-[10px] text-slate-400">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Buckets loaded transactions into daily counters for the last N days (today inclusive). */
function buildDailyBuckets(transactions: AdminTransaction[], days: number) {
  const buckets: { key: string; label: string; total: number; highRisk: number; safe: number; cancelled: number; amount: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ key, label: d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }), total: 0, highRisk: 0, safe: 0, cancelled: 0, amount: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  transactions.forEach((tx) => {
    const key = new Date(tx.created_at).toISOString().slice(0, 10);
    const bucket = byKey.get(key);
    if (!bucket) return;
    bucket.total += 1;
    bucket.amount += tx.amount;
    if (tx.risk_level === "high") bucket.highRisk += 1;
    if (tx.risk_level === "safe" || tx.risk_level === "low") bucket.safe += 1;
    if (tx.transaction_status === "cancelled") bucket.cancelled += 1;
  });
  return buckets;
}

/** Groups loaded transactions by bank code for the comparison bar chart. */
function buildBankDistribution(transactions: AdminTransaction[]) {
  const map = new Map<string, { total: number; highRisk: number }>();
  transactions.forEach((tx) => {
    const bank = tx.bank_code || "Khác";
    const entry = map.get(bank) ?? { total: 0, highRisk: 0 };
    entry.total += 1;
    if (tx.risk_level === "high") entry.highRisk += 1;
    map.set(bank, entry);
  });
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

export default function AdminPage() {
  const navigate = useNavigate();
  const transactionsQuery = useAdminTransactions();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const tabs = [
    { key: "overview" as TabType, label: "Tổng quan", icon: BarChart3 },
    { key: "transactions" as TabType, label: "Giao dịch", icon: ArrowRightLeft },
    { key: "users" as TabType, label: "Users", icon: Users },
    { key: "blacklist" as TabType, label: "Blacklist", icon: Ban },
    { key: "audit" as TabType, label: "Audit log", icon: FileClock },
    { key: "email" as TabType, label: "Email", icon: Mail },
    { key: "content" as TabType, label: "Nội dung", icon: Files },
    { key: "settings" as TabType, label: "Cài đặt AI", icon: Settings },
    { key: "agent-metrics" as TabType, label: "Metric Agents", icon: Activity },
  ];

  const activeTabMeta = tabs.find((tab) => tab.key === activeTab)!;

  return (
    <div className="min-h-screen bg-[#f9fafd]">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 bg-slate-950/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ===== TOPBAR ===== */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <button onClick={() => navigate("/dashboard")} className="hidden items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 lg:flex">
          <Home className="h-3.5 w-3.5" />
        </button>
        <span className="hidden text-slate-300 lg:inline">/</span>
        <div>
          <h1 className="text-sm font-bold text-slate-800">{activeTabMeta.label}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void transactionsQuery.refetch()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Làm mới dữ liệu">
            <RefreshCw className={`h-4 w-4 ${transactionsQuery.isFetching ? "animate-spin" : ""}`} />
          </button>
          <ProfileNotificationBell />
          <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">AD</div>
            <span className="hidden text-sm font-medium text-slate-700 sm:inline">Admin</span>
          </div>
        </div>
      </header>

      <div className="flex items-start">

      {/* ===== SIDEBAR ===== */}
      <aside
        className={`fixed left-0 top-16 z-50 flex h-[calc(100vh-4rem)] w-64 shrink-0 flex-col bg-[#0b1727] text-white transition-transform duration-200 lg:sticky lg:top-16 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <ShieldAlert className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">Timi Admin</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Dashboard</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Quản trị</p>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSidebarOpen(false);
                }}
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-blue-500" />}
                <Icon className={`h-4 w-4 ${isActive ? "text-blue-400" : ""}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 p-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Về Dashboard
          </button>
        </div>
      </aside>

      {/* ===== MAIN AREA ===== */}
      <main className="min-w-0 flex-1">
        <div className="hidden">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <button onClick={() => navigate("/dashboard")} className="hidden items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 lg:flex">
            <Home className="h-3.5 w-3.5" />
          </button>
          <span className="hidden text-slate-300 lg:inline">/</span>
          <div>
            <h1 className="text-sm font-bold text-slate-800">{activeTabMeta.label}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => void transactionsQuery.refetch()}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`h-4 w-4 ${transactionsQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
            <ProfileNotificationBell />
            <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">AD</div>
              <span className="hidden text-sm font-medium text-slate-700 sm:inline">Admin</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 lg:p-6">
          {activeTab === "overview" && <OverviewTab transactionsQuery={transactionsQuery} onViewAll={() => setActiveTab("transactions")} />}
          {activeTab === "transactions" && <TransactionsTab transactionsQuery={transactionsQuery} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
          {activeTab === "users" && <UsersTab searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
          {activeTab === "blacklist" && <BlacklistTab searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
          {activeTab === "audit" && <AuditTab />}
          {activeTab === "email" && <EmailTab />}
          {activeTab === "content" && <ContentManagementTab />}
          {activeTab === "settings" && <SettingsTab />}
          {activeTab === "agent-metrics" && <AgentMetricsTab />}
        </div>
      </main>
      </div>
    </div>
  );
}

// ===== AUDIT TAB =====
function AuditTab() {
  const [action, setAction] = useState("");
  const [liveEnabled, setLiveEnabled] = useState(true);
  const auditQuery = useQuery<AdminAuditLog[]>({
    queryKey: ["admin-audit-logs", action],
    queryFn: async () => (await axiosInstance.get<AdminAuditLog[]>("/v1/admin/audit-logs", { params: { limit: 200, ...(action ? { action } : {}) } })).data,
    refetchInterval: liveEnabled ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const statsQuery = useQuery<AdminStats>({
    queryKey: ["admin-stats", "live-audit"],
    queryFn: async () => (await axiosInstance.get<AdminStats>("/v1/admin/stats")).data,
    refetchInterval: liveEnabled ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const logs = auditQuery.data ?? [];
  const actions = Array.from(new Set(logs.map((log) => log.action))).sort();
  const now = Date.now();
  const recentLogs = useMemo(
    () => logs.filter((log) => now - new Date(log.created_at).getTime() <= 5 * 60 * 1000),
    [logs, now],
  );
  const warningEvents = recentLogs.filter((log) =>
    /warning|risk|blacklist/i.test(log.action),
  ).length;
  const hitlEvents = recentLogs.filter((log) =>
    /intervention|cancelled|proceeded|decision/i.test(log.action),
  ).length;
  const intelligenceEvents = recentLogs.filter((log) =>
    /scam|pattern/i.test(log.action),
  ).length;
  const lastUpdated = auditQuery.dataUpdatedAt || statsQuery.dataUpdatedAt;
  const isLive = liveEnabled && !auditQuery.isError && !statsQuery.isError;

  return (
    <div className="space-y-4">
      <FalconCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <h2 className="font-bold text-slate-800">Live audit dashboard</h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${isLive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                {isLive ? "Live" : "Paused"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Theo dõi audit, cảnh báo và HITL từ dữ liệu thật; tự làm mới mỗi 5 giây.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
              <Wifi className={`h-3.5 w-3.5 ${isLive ? "text-emerald-500" : "text-slate-400"}`} />
              {lastUpdated ? `Cập nhật ${new Date(lastUpdated).toLocaleTimeString("vi-VN")}` : "Đang kết nối..."}
            </span>
            <select value={action} onChange={(event) => setAction(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Tất cả hành động</option>
              {actions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button onClick={() => setLiveEnabled((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" title={liveEnabled ? "Tạm dừng live" : "Bật live polling"}>
              {liveEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="hidden sm:inline">{liveEnabled ? "Tạm dừng" : "Tiếp tục"}</span>
            </button>
            <button onClick={() => void auditQuery.refetch()} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Làm mới">
              <RefreshCw className={`h-4 w-4 ${auditQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </FalconCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Sự kiện / 5 phút", value: recentLogs.length, icon: Activity, tone: "primary" as const },
          { label: "Cảnh báo rủi ro", value: warningEvents, icon: ShieldAlert, tone: "warning" as const },
          { label: "HITL / quyết định", value: hitlEvents, icon: CheckCircle2, tone: "info" as const },
          { label: "Scam intelligence", value: intelligenceEvents, icon: Ban, tone: "violet" as const },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_0.75rem_1.5rem_rgba(18,38,63,0.03)]">
              <div className="flex items-center justify-between">
                <IconBadge icon={Icon} tone={card.tone} />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Live</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="mt-1 text-xs text-slate-500">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <FalconCard title="Trạng thái hệ thống" subtitle="Snapshot từ risk engine và dữ liệu kiểm duyệt" action={<SoftBadge tone="slate">{statsQuery.isFetching ? "Đang đồng bộ" : "Đã đồng bộ"}</SoftBadge>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Giao dịch", statsQuery.data?.total_transactions ?? 0],
              ["Rủi ro cao", statsQuery.data?.high_risk_count ?? 0],
              ["Blacklist", statsQuery.data?.blacklist_size ?? 0],
              ["Scam patterns", statsQuery.data?.pattern_count ?? 0],
            ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-lg font-bold text-slate-800">{value}</p><p className="mt-1 text-[11px] text-slate-500">{label}</p></div>)}
          </div>
        </FalconCard>
        <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-[0_0.75rem_1.5rem_rgba(18,38,63,0.03)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Audit health</p>
          <p className="mt-2 text-2xl font-bold">{isLive ? "Đang theo dõi" : "Đang tạm dừng"}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">Luồng audit chỉ đọc dữ liệu đã mask; không hiển thị PIN hoặc số tài khoản đầy đủ.</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> PDPA safe logging</div>
        </div>
      </div>

      <FalconCard bodyClassName="p-0">
        {auditQuery.isLoading && <p className="p-6 text-sm text-slate-500">Đang tải audit log...</p>}
        {auditQuery.isError && <p className="p-6 text-sm text-red-600">Không tải được audit log từ máy chủ.</p>}
        {!auditQuery.isLoading && !auditQuery.isError && logs.length === 0 && <p className="p-6 text-sm text-slate-500">Chưa có audit log phù hợp.</p>}
        {logs.map((log) => (
          <div key={log.id} className="border-b border-slate-50 p-4 last:border-0 hover:bg-slate-50">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <IconBadge icon={FileClock} tone="primary" />
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-800">{log.action}</p>
                  <p className="mt-1 text-xs text-slate-400">{log.resource_type} {log.resource_id ? `• ${log.resource_id}` : ""}</p>
                </div>
              </div>
              <time className="shrink-0 text-xs text-slate-400">{new Date(log.created_at).toLocaleString("vi-VN")}</time>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
              <span>Actor: {log.actor_id ?? "system"}</span>
              <span>IP: {log.ip_address ?? "—"}</span>
            </div>
            {log.metadata_json && Object.keys(log.metadata_json).length > 0 && (
              <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">{JSON.stringify(log.metadata_json, null, 2)}</pre>
            )}
          </div>
        ))}
      </FalconCard>
    </div>
  );
}

// ===== USERS TAB =====
function UsersTab({ searchQuery, setSearchQuery }: { searchQuery: string; setSearchQuery: (value: string) => void }) {
  const queryClient = useQueryClient();
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null);
  const [deleteNotice, setDeleteNotice] = useState("");
  const [undeletableUserIds, setUndeletableUserIds] = useState<Set<string>>(new Set());
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await axiosInstance.get<AdminUser[]>("/v1/admin/users")).data,
  });
  const updateUser = useMutation({
    mutationFn: async ({ id, path, body }: { id: string; path: "role" | "status"; body: object }) =>
      axiosInstance.patch(`/v1/admin/users/${id}/${path}`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const deleteUser = useMutation({
    mutationFn: async (id: string) => axiosInstance.delete(`/v1/admin/users/${id}`),
    onSuccess: () => {
      setDeleteNotice("Đã xóa user thành công.");
      setConfirmUser(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: any, userId: string) => {
      setUndeletableUserIds((current) => new Set(current).add(userId));
      setConfirmUser(null);
      const detail = error?.response?.data?.detail;
      setDeleteNotice(typeof detail === "string" ? detail : "Không thể xóa user vì tài khoản đang có dữ liệu cần giữ lại.");
    },
  });
  const users = (usersQuery.data ?? []).filter((user) =>
    `${user.full_name} ${user.email}`.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const initials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .slice(-2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

  return (
    <div className="space-y-4">
      <FalconCard bodyClassName="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm theo tên hoặc email..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500" />
        </div>
      </FalconCard>
      {usersQuery.isError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">Không tải được danh sách người dùng.</p>}
      {updateUser.isError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">Không thể cập nhật quyền hoặc trạng thái. Hãy kiểm tra lại quyền admin.</p>}
      {deleteNotice && (
        <div className={`rounded-lg p-3 text-sm ${deleteUser.isError ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
          <div className="flex items-center justify-between gap-3">
            <span>{deleteNotice}</span>
            <button type="button" onClick={() => setDeleteNotice("")} className="font-bold">×</button>
          </div>
        </div>
      )}
      <FalconCard title="Danh sách người dùng" subtitle={`${users.length} tài khoản`} bodyClassName="p-0">
        <div className="divide-y divide-slate-100">
          {usersQuery.isLoading && <p className="p-4 text-sm text-slate-500">Đang tải người dùng...</p>}
          {users.map((user) => (
            <div key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                  {initials(user.full_name || user.email)}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{user.full_name}</p>
                  <p className="truncate text-xs text-slate-400">{user.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SoftBadge tone={user.role === "admin" ? "info" : "slate"}>{user.role}</SoftBadge>
                <button disabled={updateUser.isPending || deleteUser.isPending} onClick={() => updateUser.mutate({ id: user.id, path: "role", body: { role: user.role === "admin" ? "user" : "admin" } })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{user.role === "admin" ? "Gỡ admin" : "Cấp admin"}</button>
                <button disabled={updateUser.isPending || deleteUser.isPending} onClick={() => updateUser.mutate({ id: user.id, path: "status", body: { is_active: !user.is_active } })} className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${user.is_active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}>{user.is_active ? "Khóa" : "Mở khóa"}</button>
                {!undeletableUserIds.has(user.id) && (
                  <button
                    disabled={updateUser.isPending || deleteUser.isPending}
                    onClick={() => {
                      setDeleteNotice("");
                      setConfirmUser(user);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </FalconCard>
      {confirmUser && createPortal(
        <div className="fixed inset-0 z-[10000] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Xóa user?</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Bạn chắc chắn muốn xóa vĩnh viễn <strong>{confirmUser.email}</strong>? Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setConfirmUser(null)} disabled={deleteUser.isPending} className="flex-1 rounded-lg bg-slate-100 px-4 py-3 font-semibold text-slate-700 disabled:opacity-50">Hủy</button>
              <button type="button" onClick={() => deleteUser.mutate(confirmUser.id)} disabled={deleteUser.isPending} className="flex-1 rounded-lg bg-red-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                {deleteUser.isPending ? "Đang xóa..." : "Xóa user"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ===== OVERVIEW TAB =====
function OverviewTab({ transactionsQuery, onViewAll }: { transactionsQuery: AdminTransactionsQuery; onViewAll: () => void }) {
  const [trendDays, setTrendDays] = useState(14);
  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => (await axiosInstance.get<AdminStats>("/v1/admin/stats")).data,
  });
  // Same query key as UsersTab so React Query shares the cache instead of double-fetching.
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await axiosInstance.get<AdminUser[]>("/v1/admin/users")).data,
  });

  const liveStats = statsQuery.data;
  const transactions = transactionsQuery.data ?? [];
  const total = liveStats?.total_transactions ?? 0;
  const safeCount = (liveStats?.by_risk_level.safe ?? 0) + (liveStats?.by_risk_level.low ?? 0);
  const safeRate = total ? Math.round((safeCount / total) * 1000) / 10 : 0;

  const week = useMemo(() => buildDailyBuckets(transactions, 7), [transactions]);
  const trendBuckets = useMemo(() => buildDailyBuckets(transactions, trendDays), [transactions, trendDays]);
  const bankDistribution = useMemo(() => buildBankDistribution(transactions), [transactions]);

  const weekTotal = week.reduce((s, b) => s + b.total, 0);
  const weekAmount = week.reduce((s, b) => s + b.amount, 0);
  const half = Math.floor(week.length / 2);
  const pctChange = (series: number[]) => {
    const prev = series.slice(0, half).reduce((s, v) => s + v, 0);
    const curr = series.slice(half).reduce((s, v) => s + v, 0);
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };
  const weekCountChange = pctChange(week.map((b) => b.total));
  const weekAmountChange = pctChange(week.map((b) => b.amount));

  const compliance = liveStats?.recommendation_compliance_rate;
  const compliancePct = compliance != null ? Math.round(compliance * 100) : null;
  const uncompliant = Math.max((liveStats?.high_risk_count ?? 0) - (liveStats?.high_risk_cancelled ?? 0), 0);

  const attentionList = transactions
    .filter((tx) => tx.risk_level === "high" || tx.transaction_status === "awaiting_decision")
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);
  const initials = (name: string) =>
    name.split(" ").filter(Boolean).slice(-2).map((p) => p[0]).join("").toUpperCase();
  const avatarPalette = ["bg-blue-50 text-blue-600", "bg-emerald-50 text-emerald-600", "bg-sky-50 text-sky-600", "bg-orange-50 text-orange-600", "bg-rose-50 text-rose-600"];

  const liveRiskDistribution = [
    { label: "An toàn", value: total ? Math.round((safeCount / total) * 100) : 0, color: "#10b981" },
    { label: "Lưu ý", value: total ? Math.round(((liveStats?.by_risk_level.medium ?? 0) / total) * 100) : 0, color: "#f59e0b" },
    { label: "Nguy hiểm", value: total ? Math.round(((liveStats?.by_risk_level.high ?? 0) / total) * 100) : 0, color: "#ef4444" },
  ];

  const liveRecentTransactions = transactions.slice(0, 3).map((transaction) => ({
    id: transaction.id,
    user: transaction.user_name,
    amount: transaction.amount,
    status: transaction.transaction_status === "completed" ? "success" : transaction.transaction_status === "cancelled" || transaction.transaction_status === "failed" ? "failed" : "pending",
    risk: transaction.risk_level === "high" ? "high" : transaction.risk_level === "medium" ? "medium" : "low",
    time: new Date(transaction.created_at).toLocaleString("vi-VN"),
  }));

  const statCards = [
    {
      label: "Tổng giao dịch", value: total.toLocaleString("vi-VN"), icon: ArrowRightLeft, tone: "primary" as const,
      spark: week.map((b) => b.total), color: "#2563eb", change: weekCountChange,
    },
    {
      label: "Cảnh báo rủi ro cao", value: (liveStats?.high_risk_count ?? 0).toLocaleString("vi-VN"), icon: ShieldAlert, tone: "danger" as const,
      spark: week.map((b) => b.highRisk), color: "#ef4444", change: pctChange(week.map((b) => b.highRisk)),
    },
    {
      label: "Đã hủy sau cảnh báo", value: (liveStats?.high_risk_cancelled ?? 0).toLocaleString("vi-VN"), icon: CheckCircle2, tone: "success" as const,
      spark: week.map((b) => b.cancelled), color: "#10b981", change: pctChange(week.map((b) => b.cancelled)),
    },
    {
      label: "Tỷ lệ an toàn", value: `${safeRate}%`, icon: ShieldAlert, tone: "info" as const,
      spark: week.map((b) => b.safe), color: "#0ea5e9", change: pctChange(week.map((b) => b.safe)),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Weekly headline widgets */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FalconCard bodyClassName="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="flex items-center gap-1 text-sm text-slate-500">Giao dịch trong tuần</p>
              <p className="mt-1 text-3xl font-bold text-slate-800">{weekTotal.toLocaleString("vi-VN")}</p>
              <SoftBadge tone={weekCountChange >= 0 ? "success" : "danger"}>
                {weekCountChange >= 0 ? "+" : ""}
                {weekCountChange}%
              </SoftBadge>
            </div>
            <BarSparkline values={week.map((b) => b.total)} color="#2563eb" height={64} />
          </div>
        </FalconCard>
        <FalconCard bodyClassName="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Khối lượng giao dịch (7 ngày)</p>
              <p className="mt-1 text-3xl font-bold text-slate-800">{new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(weekAmount)} đ</p>
              <SoftBadge tone={weekAmountChange >= 0 ? "success" : "danger"}>
                {weekAmountChange >= 0 ? "+" : ""}
                {weekAmountChange}%
              </SoftBadge>
            </div>
            <Sparkline values={week.map((b) => b.amount)} color="#2563eb" height={64} width={110} fill />
          </div>
        </FalconCard>
      </div>

      {/* Stats Grid with sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_0.75rem_1.5rem_rgba(18,38,63,0.03)]">
              <div className="flex items-center justify-between mb-3">
                <IconBadge icon={Icon} tone={stat.tone} />
                <span className={`flex items-center gap-1 text-xs font-medium ${stat.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {stat.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {stat.change >= 0 ? "+" : ""}
                  {stat.change}%
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                <Sparkline values={stat.spark} color={stat.color} height={28} width={64} />
              </div>
              <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Risk Distribution (market-share style) */}
        <FalconCard title="Phân bổ rủi ro giao dịch" subtitle="Theo dữ liệu risk engine">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="min-w-0 flex-1 space-y-3">
              {liveRiskDistribution.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-slate-600">{item.label}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-800">{item.value}%</span>
                </div>
              ))}
            </div>
            <DonutChart
              segments={liveRiskDistribution.map((d) => ({ value: d.value, color: d.color }))}
              centerLabel={total.toLocaleString("vi-VN")}
              centerSublabel="giao dịch"
            />
          </div>
        </FalconCard>

        {/* Compliance ring (storage-style) */}
        <FalconCard title="Tuân thủ khuyến nghị AI" subtitle="Giao dịch rủi ro cao đã xử lý đúng khuyến nghị">
          <div className="flex items-center gap-4 sm:gap-6">
            <DonutChart
              segments={[{ value: compliancePct ?? 0, color: "#2563eb" }]}
              centerLabel={compliancePct != null ? `${compliancePct}%` : "--"}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="flex items-center gap-1.5 text-sm text-slate-600">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {(liveStats?.high_risk_cancelled ?? 0).toLocaleString("vi-VN")} đã xử lý đúng khuyến nghị
              </p>
              <p className="text-xs text-slate-400">{(liveStats?.high_risk_count ?? 0).toLocaleString("vi-VN")} tổng giao dịch rủi ro cao</p>
              {uncompliant > 0 && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {uncompliant} giao dịch chưa theo khuyến nghị
                </p>
              )}
            </div>
          </div>
        </FalconCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Daily volume trend chart */}
        <FalconCard
          title="Xu hướng giao dịch theo ngày"
          subtitle="Số lượng giao dịch ghi nhận"
          action={
            <select
              value={trendDays}
              onChange={(e) => setTrendDays(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={7}>7 ngày qua</option>
              <option value={14}>14 ngày qua</option>
              <option value={30}>30 ngày qua</option>
            </select>
          }
        >
          <TrendAreaChart data={trendBuckets.map((b) => ({ label: b.label, value: b.total }))} gradientId="overview-volume-trend" />
        </FalconCard>

        {/* Giao dịch cần chú ý (running-projects style) */}
        <FalconCard title="Giao dịch cần chú ý" subtitle="Rủi ro cao hoặc đang chờ quyết định" action={<button onClick={onViewAll} className="text-sm font-medium text-blue-600 hover:underline">Xem tất cả</button>}>
          <div className="divide-y divide-slate-50">
            {attentionList.length === 0 && <p className="py-4 text-sm text-slate-500">Không có giao dịch cần chú ý.</p>}
            {attentionList.map((tx, i) => {
              const riskPct = tx.risk_level === "high" ? 90 : tx.risk_level === "medium" ? 55 : 20;
              const barColor = tx.risk_level === "high" ? "bg-red-500" : tx.risk_level === "medium" ? "bg-amber-500" : "bg-emerald-500";
              return (
                <div key={tx.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarPalette[i % avatarPalette.length]}`}>
                    {initials(tx.user_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{tx.user_name}</p>
                      <SoftBadge tone={tx.risk_level === "high" ? "danger" : tx.risk_level === "medium" ? "warning" : "success"}>
                        {tx.risk_level === "high" ? "Cao" : tx.risk_level === "medium" ? "T.bình" : "Thấp"}
                      </SoftBadge>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${riskPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </FalconCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Per-bank breakdown */}
        <FalconCard title="Giao dịch theo ngân hàng" subtitle="So sánh tổng số và số lượng rủi ro cao">
          {bankDistribution.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có dữ liệu ngân hàng.</p>
          ) : (
            <GroupedBarChart
              data={bankDistribution.map((b) => ({ label: b.label, a: b.total, b: b.highRisk }))}
              seriesA={{ label: "Tổng giao dịch", color: "#cbd5e1" }}
              seriesB={{ label: "Rủi ro cao", color: "#2563eb" }}
            />
          )}
        </FalconCard>

        {/* Latest users */}
        <FalconCard title="Người dùng mới nhất" action={<span className="text-xs text-slate-400">{usersQuery.data?.length ?? 0} tổng</span>}>
          <div className="divide-y divide-slate-50">
            {usersQuery.isLoading && <p className="py-3 text-sm text-slate-500">Đang tải...</p>}
            {(usersQuery.data ?? [])
              .slice()
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 5)
              .map((user, i) => (
                <div key={user.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="relative shrink-0">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${avatarPalette[i % avatarPalette.length]}`}>
                      {initials(user.full_name || user.email)}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${user.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{user.full_name}</p>
                    <p className="truncate text-xs text-slate-400">{user.email}</p>
                  </div>
                  <SoftBadge tone={user.role === "admin" ? "info" : "slate"}>{user.role === "admin" ? "Quản trị" : "User"}</SoftBadge>
                </div>
              ))}
          </div>
        </FalconCard>
      </div>

      {/* Recent Activity */}
      <FalconCard
        title="Hoạt động gần đây"
        action={<button onClick={onViewAll} className="text-sm text-blue-600 font-medium hover:underline">Xem tất cả</button>}
      >
        <div className="space-y-3">
          {transactionsQuery.isError && <p className="text-sm text-red-600">Không tải được giao dịch từ máy chủ.</p>}
          {!transactionsQuery.isLoading && !transactionsQuery.isError && liveRecentTransactions.length === 0 && <p className="text-sm text-slate-500">Chưa có giao dịch trong database.</p>}
          {liveRecentTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                tx.status === "success" ? "bg-emerald-50" :
                tx.status === "blocked" ? "bg-red-50" :
                tx.status === "pending" ? "bg-amber-50" : "bg-gray-50"
              }`}>
                {tx.status === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                 tx.status === "blocked" ? <Ban className="w-5 h-5 text-red-500" /> :
                 tx.status === "pending" ? <Clock className="w-5 h-5 text-amber-500" /> :
                 <AlertTriangle className="w-5 h-5 text-gray-500" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-sm">{tx.user}</p>
                <p className="text-xs text-slate-400">{tx.id} • {tx.time}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-800">{new Intl.NumberFormat("vi-VN").format(tx.amount)} đ</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  tx.risk === "low" ? "bg-emerald-50 text-emerald-600" :
                  tx.risk === "medium" ? "bg-amber-50 text-amber-600" :
                  tx.risk === "high" ? "bg-orange-50 text-orange-600" :
                  "bg-red-50 text-red-600"
                }`}>
                  {tx.risk === "low" ? "An toàn" :
                   tx.risk === "medium" ? "Lưu ý" :
                   tx.risk === "high" ? "Rủi ro" : "Nguy hiểm"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </FalconCard>
    </div>
  );
}

// ===== TRANSACTIONS TAB =====
function TransactionsTab({ transactionsQuery, searchQuery, setSearchQuery }: { transactionsQuery: AdminTransactionsQuery; searchQuery: string; setSearchQuery: (s: string) => void }) {
  const [filter, setFilter] = useState("all");
  const transactions = (transactionsQuery.data ?? []).map((transaction) => ({
    id: transaction.id,
    user: `${transaction.user_name} → ${transaction.payee_name}`,
    amount: transaction.amount,
    status: transaction.transaction_status === "completed" ? "success" : transaction.transaction_status === "cancelled" || transaction.transaction_status === "failed" ? "failed" : transaction.transaction_status === "awaiting_decision" && transaction.risk_level === "high" ? "blocked" : "pending",
    risk: transaction.risk_level === "high" ? "high" : transaction.risk_level === "medium" ? "medium" : "low",
    time: new Date(transaction.created_at).toLocaleString("vi-VN"),
  }));

  const filtered = transactions.filter((tx) => {
    if (filter !== "all" && tx.status !== filter) return false;
    if (searchQuery && !tx.user.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const transactionError = transactionsQuery.error;
  const transactionErrorMessage = axios.isAxiosError(transactionError)
    ? typeof transactionError.response?.data?.detail === "string"
      ? transactionError.response.data.detail
      : `Không tải được giao dịch (HTTP ${transactionError.response?.status ?? "không xác định"}).`
    : "Không thể kết nối tới máy chủ.";

  const handleExport = () => {
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["ID", "Người dùng / Người nhận", "Số tiền", "Trạng thái", "Rủi ro", "Thời gian"],
      ...filtered.map((tx) => [tx.id, tx.user, tx.amount, tx.status, tx.risk, tx.time]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-giao-dich-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <FalconCard bodyClassName="p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm giao dịch..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-lg border border-transparent text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            <Filter className="w-4 h-4 text-slate-600" />
          </button>
          <button onClick={handleExport} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50" title="Xuất giao dịch đang hiển thị">
            <Download className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 pt-3">
          {[
            { key: "all", label: "Tất cả" },
            { key: "success", label: "Thành công" },
            { key: "blocked", label: "Đã chặn" },
            { key: "pending", label: "Đang xử lý" },
            { key: "failed", label: "Thất bại" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === item.key ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </FalconCard>

      <FalconCard title="Danh sách giao dịch" subtitle={`${filtered.length} kết quả`} bodyClassName="p-0">
        <div className="divide-y divide-slate-50">
          {transactionsQuery.isLoading && <p className="p-5 text-sm text-slate-500">Đang tải giao dịch...</p>}
          {transactionsQuery.isError && <p className="p-5 text-sm text-red-600">{transactionErrorMessage}</p>}
          {!transactionsQuery.isLoading && !transactionsQuery.isError && filtered.length === 0 && <p className="p-5 text-sm text-slate-500">Không có giao dịch phù hợp.</p>}
          {filtered.map((tx) => (
            <div key={tx.id} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    tx.status === "success" ? "bg-emerald-50" :
                    tx.status === "blocked" ? "bg-red-50" :
                    tx.status === "pending" ? "bg-amber-50" : "bg-gray-50"
                  }`}>
                    {tx.status === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                     tx.status === "blocked" ? <Ban className="w-4 h-4 text-red-500" /> :
                     tx.status === "pending" ? <Clock className="w-4 h-4 text-amber-500" /> :
                     <AlertTriangle className="w-4 h-4 text-gray-500" />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{tx.user}</p>
                    <p className="text-xs text-slate-400">{tx.id}</p>
                  </div>
                </div>
                <button className="p-1 hover:bg-slate-100 rounded-full">
                  <MoreVertical className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">{new Intl.NumberFormat("vi-VN").format(tx.amount)} đ</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    tx.risk === "low" ? "bg-emerald-50 text-emerald-600" :
                    tx.risk === "medium" ? "bg-amber-50 text-amber-600" :
                    tx.risk === "high" ? "bg-orange-50 text-orange-600" :
                    "bg-red-50 text-red-600"
                  }`}>
                    {tx.risk === "low" ? "An toàn" :
                     tx.risk === "medium" ? "Lưu ý" :
                     tx.risk === "high" ? "Rủi ro" : "Nguy hiểm"}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{tx.time}</span>
              </div>
            </div>
          ))}
        </div>
      </FalconCard>
    </div>
  );
}

// ===== BLACKLIST TAB =====
function BlacklistTab({ searchQuery, setSearchQuery }: { searchQuery: string; setSearchQuery: (s: string) => void }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [blacklistType, setBlacklistType] = useState<"all" | "account" | "phone" | "email" | "url">("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();
  const deleteBlacklist = useMutation({
    mutationFn: async ({ entryId, faceVerificationToken }: { entryId: string; faceVerificationToken: string }) =>
      axiosInstance.delete(`/v1/admin/blacklist/${entryId}`, {
        data: { face_verification_token: faceVerificationToken },
      }),
      onSuccess: async () => {
        setDeleteTarget(null);
        setShowDeleteConfirm(false);
        await queryClient.invalidateQueries({ queryKey: ["admin-blacklist"] });
      },
  });
  const blacklistQuery = useInfiniteQuery({
    queryKey: ["admin-blacklist", showAll, blacklistType, searchQuery],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => (
      await axiosInstance.get<BlacklistPage>("/v1/admin/blacklist", {
        params: {
          limit: searchQuery.trim() ? 50 : showAll ? 20 : 10,
          cursor: pageParam ?? undefined,
          search: searchQuery.trim() || undefined,
          ...(blacklistType !== "all" ? { entity_type: blacklistType } : {}),
        },
      })
    ).data,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const entries = (blacklistQuery.data?.pages.flatMap((page) => page.items) ?? []).map((entry) => ({
    id: entry.id,
    type: entry.entity_type,
    value: entry.entity_value,
    bank: entry.bank,
    reason: entry.source,
    addedAt: new Date(entry.created_at).toLocaleString("vi-VN"),
    reports: entry.evidence && typeof entry.evidence.reports === "number" ? entry.evidence.reports : 0,
  }));
  const urlKey = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
  const uniqueEntries = entries.filter((entry, index, all) =>
    entry.type !== "url" || all.findIndex((candidate) => candidate.type === "url" && urlKey(candidate.value) === urlKey(entry.value)) === index,
  );
  const filtered = uniqueEntries.filter((entry) => {
    if (blacklistType !== "all" && entry.type !== blacklistType) return false;
    if (searchQuery && !`${entry.value} ${entry.bank ?? ""} ${entry.reason}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const deleteEntry = filtered.find((entry) => entry.id === deleteTarget);
  const verifyAndDelete = async (imageData: string | string[]): Promise<FaceMatchResult> => {
    const match = await authApi.verifyFace(imageData);
    if (!match.matched || !match.verification_token) {
      throw new Error("Khuôn mặt admin chưa được xác thực.");
    }
    return match;
  };
  const completeVerifiedDelete = async (match: FaceMatchResult) => {
    if (!match.verification_token) {
      throw new Error("Thiếu dữ liệu xác nhận Face ID của admin.");
    }
    await deleteBlacklist.mutateAsync({
      entryId: deleteTarget!,
      faceVerificationToken: match.verification_token,
    });
  };

  return (
    <div className="space-y-4">
      <FalconCard bodyClassName="p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm trong blacklist..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-lg border border-transparent text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Thêm mới
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 pt-3">
          {[
            { value: "all" as const, label: "Tất cả" },
            { value: "account" as const, label: "Tài khoản / STK" },
            { value: "phone" as const, label: "Số điện thoại" },
            { value: "email" as const, label: "Email" },
            { value: "url" as const, label: "URL" },
          ].map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setBlacklistType(filter.value)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${blacklistType === filter.value ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </FalconCard>

      <FalconCard title="Danh sách blacklist" subtitle={`${filtered.length} bản ghi`} bodyClassName="p-0">
        <div className="divide-y divide-slate-50">
          {blacklistQuery.isLoading && <p className="p-5 text-sm text-slate-500">{showAll ? "Đang tải toàn bộ blacklist..." : "Đang tải blacklist mới nhất..."}</p>}
          {blacklistQuery.isError && <p className="p-5 text-sm text-red-600">Không tải được blacklist từ máy chủ.</p>}
          {!blacklistQuery.isLoading && !blacklistQuery.isError && filtered.length === 0 && <p className="p-5 text-sm text-slate-500">Không có bản ghi blacklist phù hợp.</p>}
          {filtered.map((entry) => (
            <div key={entry.id} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <IconBadge icon={Ban} tone="danger" />
                  <div>
                    <p className="max-w-[min(70vw,32rem)] break-all whitespace-normal font-semibold text-slate-800 text-sm">{entry.value}</p>
                    <p className="text-xs text-slate-400 capitalize">
                      {entry.type === "account" ? `Tài khoản / STK${entry.bank ? ` · ${entry.bank}` : ""}` : "URL"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-red-500 font-medium">{entry.reports} báo cáo</span>
              </div>
              <p className="break-words whitespace-pre-wrap text-sm text-slate-600 mb-1">{entry.reason}</p>
              <p className="text-xs text-slate-400">Thêm vào: {entry.addedAt}</p>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(entry.id);
                    setShowDeleteConfirm(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa blacklist
                </button>
              </div>
              {deleteTarget === "__inline_disabled__" && showDeleteConfirm && (
                <div className="mt-3 rounded-xl border border-red-100 bg-red-50/70 p-4">
                  <p className="text-sm font-semibold text-red-900">Xác nhận xóa blacklist?</p>
                  <p className="mt-1 text-xs leading-5 text-red-700">
                    Bản ghi này sẽ được xóa sau khi admin xác thực khuôn mặt.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(null);
                        setShowDeleteConfirm(false);
                      }}
                      className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Xác nhận khuôn mặt
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </FalconCard>
      {blacklistQuery.hasNextPage && !blacklistQuery.isError && (
        <button
          type="button"
          onClick={() => {
            if (!showAll) {
              setShowAll(true);
              return;
            }
            void blacklistQuery.fetchNextPage();
          }}
          disabled={blacklistQuery.isFetchingNextPage}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {blacklistQuery.isFetchingNextPage ? (
            <><RefreshCw className="h-4 w-4 animate-spin" />Đang tải thêm...</>
          ) : !showAll ? (
            "Xem toàn bộ blacklist"
          ) : (
            "Tải thêm bản ghi"
          )}
        </button>
      )}

      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[10000] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Thêm vào Blacklist</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Loại</label>
                <select className="w-full p-2.5 bg-gray-50 rounded-lg border-0 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="account">Tài khoản ngân hàng</option>
                  <option value="phone">Số điện thoại</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Giá trị</label>
                <input type="text" className="w-full p-2.5 bg-gray-50 rounded-lg border-0 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Nhập giá trị..." />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Lý do</label>
                <textarea className="w-full p-2.5 bg-gray-50 rounded-lg border-0 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={2} placeholder="Lý do thêm vào danh sách đen..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors">
                  Hủy
                </button>
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  Thêm
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {deleteTarget && showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[10000] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Xác nhận xóa blacklist</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Bạn có chắc chắn muốn xóa {deleteEntry?.type === "account" ? "STK" : deleteEntry?.type?.toUpperCase() || "bản ghi"}{" "}
              <strong className="break-all text-slate-900">{deleteEntry?.value || "đã chọn"}</strong>{" "}
              không? Hệ thống sẽ yêu cầu xác thực khuôn mặt admin.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700"
              >
                Xác nhận khuôn mặt
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {deleteTarget && !showDeleteConfirm && (
        <FaceVerificationModal
          mode="verification"
          onVerified={verifyAndDelete}
          onVerificationComplete={completeVerifiedDelete}
          onCancel={() => {
            setDeleteTarget(null);
            setShowDeleteConfirm(false);
          }}
          isLoading={deleteBlacklist.isPending}
        />
      )}
    </div>
  );
}

// ===== EMAIL TAB =====
function EmailTab() {
  const [broadcast, setBroadcast] = useState({
    subject: "",
    body: "",
  });
  const [updateForm, setUpdateForm] = useState({
    version: "",
    title: "",
    body: "",
    sendNow: true,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"ok" | "err">("ok");
  const [sending, setSending] = useState(false);

  const handleSendTest = async () => {
    if (!broadcast.subject.trim() || !broadcast.body.trim()) {
      setStatusTone("err");
      setStatusMsg("Vui lòng nhập tiêu đề và nội dung trước khi gửi thử.");
      return;
    }
    setSending(true);
    setStatusMsg(null);
    try {
      const { data } = await axiosInstance.post<{ message?: string; queued?: number }>(
        "/v1/admin/emails/broadcast",
        {
          subject: broadcast.subject,
          html: broadcast.body.replace(/\n/g, "<br/>"),
          dry_run: true,
        },
      );
      setStatusTone("ok");
      setStatusMsg(
        data?.message ||
          "Đã gửi thử tới email admin. Kiểm tra hộp thư (và Spam).",
      );
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : `Gửi thử thất bại (HTTP ${err.response?.status ?? "—"}).`
        : "Không gửi được email thử.";
      setStatusTone("err");
      setStatusMsg(msg);
    } finally {
      setSending(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcast.subject.trim() || !broadcast.body.trim()) {
      setStatusTone("err");
      setStatusMsg("Vui lòng nhập tiêu đề và nội dung.");
      return;
    }
    if (
      !window.confirm(
        `Gửi email tới TẤT CẢ user có email trong hệ thống?\n\nTiêu đề: ${broadcast.subject}`,
      )
    ) {
      return;
    }
    setSending(true);
    setStatusMsg(null);
    try {
      const { data } = await axiosInstance.post<{ message?: string; queued?: number }>(
        "/v1/admin/emails/broadcast",
        {
          subject: broadcast.subject,
          html: broadcast.body.replace(/\n/g, "<br/>"),
          dry_run: false,
        },
      );
      setStatusTone("ok");
      setStatusMsg(
        data?.message ||
          `Đã xếp hàng gửi${data?.queued != null ? ` ${data.queued}` : ""} email.`,
      );
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : `Gửi hàng loạt thất bại (HTTP ${err.response?.status ?? "—"}).`
        : "Không gửi được broadcast.";
      setStatusTone("err");
      setStatusMsg(msg);
    } finally {
      setSending(false);
    }
  };

  const handlePublishUpdate = async () => {
    if (!updateForm.title.trim() || !updateForm.body.trim()) {
      setStatusTone("err");
      setStatusMsg("Nhập tiêu đề và nội dung cập nhật.");
      return;
    }
    setSending(true);
    setStatusMsg(null);
    try {
      const { data } = await axiosInstance.post<{ message?: string; queued?: number }>(
        "/v1/admin/emails/product-update",
        {
          version: updateForm.version || undefined,
          title: updateForm.title,
          body: updateForm.body,
          send_now: updateForm.sendNow,
        },
      );
      setStatusTone("ok");
      setStatusMsg(
        data?.message ||
          (updateForm.sendNow
            ? "Đã công bố và gửi mail tới toàn bộ user."
            : "Đã lưu cập nhật (chưa gửi mail)."),
      );
      setUpdateForm({ version: "", title: "", body: "", sendNow: true });
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : `Công bố thất bại (HTTP ${err.response?.status ?? "—"}).`
        : "Không công bố được cập nhật.";
      setStatusTone("err");
      setStatusMsg(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            statusTone === "ok"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {statusMsg}
        </div>
      )}

      <FalconCard
        title="Gửi email hàng loạt"
        subtitle="Soạn thảo và gửi tới toàn bộ user có email trong hệ thống (SMTP)"
        action={
          <SoftBadge tone="info">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              Broadcast
            </span>
          </SoftBadge>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Người nhận: <span className="font-semibold text-slate-700">Tất cả user có email</span>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              Tiêu đề email
            </label>
            <input
              type="text"
              value={broadcast.subject}
              onChange={(e) =>
                setBroadcast((s) => ({ ...s, subject: e.target.value }))
              }
              placeholder="Ví dụ: Timi — Thông báo bảo trì hệ thống"
              className="w-full rounded-lg border border-transparent bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              Nội dung
            </label>
            <textarea
              value={broadcast.body}
              onChange={(e) =>
                setBroadcast((s) => ({ ...s, body: e.target.value }))
              }
              rows={8}
              placeholder={
                "Xin chào,\n\nTimi vừa cập nhật tính năng...\n\nTrân trọng,\nĐội ngũ Timi"
              }
              className="w-full resize-y rounded-lg border border-transparent bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              Xuống dòng sẽ được chuyển thành &lt;br/&gt; khi gửi HTML.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              disabled={!broadcast.subject && !broadcast.body}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Eye className="h-4 w-4" />
              Xem trước
            </button>
            <button
              type="button"
              onClick={() => void handleSendTest()}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Gửi thử (admin)
            </button>
            <button
              type="button"
              onClick={() => void handleBroadcast()}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Gửi toàn bộ user
            </button>
          </div>
        </div>
      </FalconCard>

      <FalconCard
        title="Cập nhật & cải tiến hệ thống"
        subtitle="Công bố phiên bản mới — gửi mail cho toàn bộ user (SMTP)"
        action={
          <SoftBadge tone="success">
            <span className="inline-flex items-center gap-1">
              <Megaphone className="h-3 w-3" />
              Release
            </span>
          </SoftBadge>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">
                Phiên bản (tuỳ chọn)
              </label>
              <input
                type="text"
                value={updateForm.version}
                onChange={(e) =>
                  setUpdateForm((s) => ({ ...s, version: e.target.value }))
                }
                placeholder="v1.2.0"
                className="w-full rounded-lg border border-transparent bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">
                Tiêu đề cập nhật
              </label>
              <input
                type="text"
                value={updateForm.title}
                onChange={(e) =>
                  setUpdateForm((s) => ({ ...s, title: e.target.value }))
                }
                placeholder="Cải thiện AI Risk & giao diện Transfer"
                className="w-full rounded-lg border border-transparent bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              Nội dung cải tiến
            </label>
            <textarea
              value={updateForm.body}
              onChange={(e) =>
                setUpdateForm((s) => ({ ...s, body: e.target.value }))
              }
              rows={5}
              placeholder={
                "- Thêm tab Email admin\n- Cải thiện agent cảnh báo scam\n- Sửa progress chuyển tiền"
              }
              className="w-full resize-y rounded-lg border border-transparent bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={updateForm.sendNow}
              onClick={() =>
                setUpdateForm((s) => ({ ...s, sendNow: !s.sendNow }))
              }
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                updateForm.sendNow ? "bg-blue-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-transform ${
                  updateForm.sendNow ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-slate-700">
              Gửi email ngay cho toàn bộ user có email
            </span>
          </label>

          <button
            type="button"
            onClick={() => void handlePublishUpdate()}
            disabled={sending}
            className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Megaphone className="h-4 w-4" />
            Công bố cập nhật
          </button>
        </div>
      </FalconCard>

      <FalconCard
        title="Lưu ý"
        subtitle="Gmail API"
        bodyClassName="p-4 text-sm text-slate-600 space-y-2"
      >
        <p>• Gửi qua Gmail API; không dùng Gmail App Password.</p>
        <p>• <b>Gửi thử</b> chỉ gửi về email tài khoản admin đang đăng nhập.</p>
        <p>• <b>Gửi toàn bộ user</b> / công bố cập nhật: mọi user có email trong DB.</p>
        <p>
          • API:{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">
            POST /v1/admin/emails/broadcast
          </code>{" "}
          và{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">
            POST /v1/admin/emails/product-update
          </code>
        </p>
      </FalconCard>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="my-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Xem trước email</h3>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Subject
            </p>
            <p className="mb-4 font-semibold text-slate-800">
              {broadcast.subject || "(Chưa có tiêu đề)"}
            </p>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Body
            </p>
            <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              {broadcast.body || "(Chưa có nội dung)"}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Gửi tới: Tất cả user có email
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const AGENT_CAPABILITY_LABELS: Record<string, string> = {
  product_chat: "Chat sản phẩm",
  call_transcription: "Chuyển audio → text",
  scam_risk_decision: "Đánh giá cuộc gọi",
  transfer_drafting: "Tạo bản nháp chuyển tiền",
  guardian_preference: "Thiết lập bảo vệ cuộc gọi",
  contextual_navigation: "Điều hướng theo ngữ cảnh",
  multi_step_intervention: "Can thiệp nhiều bước",
  human_in_the_loop: "Chờ người dùng quyết định",
};

function formatAgentPercent(value: number | null): string {
  return value == null ? "Chưa có dữ liệu" : `${(value * 100).toFixed(1)}%`;
}

function formatAgentLatency(value: number | null): string {
  return value == null ? "—" : `${Math.round(value)} ms`;
}

function formatAgentDate(value: string | null): string {
  if (!value) return "Chưa ghi nhận";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa ghi nhận";
  return date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function AgentMetricsTab() {
  const metricsQuery = useAdminAgentMetrics();
  const metrics = metricsQuery.data;
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ready" | "legacy">("all");

  const rows = metrics
    ? [
        {
          key: metrics.supervisor.id,
          name: metrics.supervisor.name,
          id: metrics.supervisor.id,
          project: "Multi-Agent Supervisor",
          source: "Neon PostgreSQL",
          type: `${metrics.supervisor.managed_agent_count} agent trực thuộc`,
          status: "active",
          successRate: metrics.supervisor.success_rate,
          calls: metrics.supervisor.dispatches,
          failures: metrics.supervisor.failures,
          events: metrics.managed_agents.reduce((total, agent) => total + agent.domain_events, 0),
          latency: metrics.supervisor.avg_latency_ms,
          lastActivity: metrics.supervisor.last_activity_at,
        },
        ...metrics.managed_agents.map((agent) => ({
          key: agent.agent_id,
          name: agent.name,
          id: agent.agent_id,
          project: "Multi-Agent Supervisor",
          source: agent.api_path,
          type: agent.capabilities.map((capability) => AGENT_CAPABILITY_LABELS[capability] ?? capability).join(" · "),
          status: agent.status,
          successRate: agent.success_rate,
          calls: agent.calls,
          failures: agent.failures,
          events: agent.domain_events,
          latency: agent.avg_latency_ms,
          lastActivity: agent.last_activity_at ?? agent.domain_last_activity_at,
        })),
        {
          key: metrics.intervention_agent.agent_id,
          name: metrics.intervention_agent.name,
          id: metrics.intervention_agent.agent_id,
          project: "Standalone agent",
          source: metrics.intervention_agent.api_path,
          type: metrics.intervention_agent.capabilities.map((capability) => AGENT_CAPABILITY_LABELS[capability] ?? capability).join(" · "),
          status: metrics.intervention_agent.status,
          successRate: metrics.intervention_agent.success_rate,
          calls: metrics.intervention_agent.calls,
          failures: metrics.intervention_agent.failures,
          events: metrics.intervention_agent.domain_events,
          latency: metrics.intervention_agent.avg_latency_ms,
          lastActivity: metrics.intervention_agent.last_activity_at ?? metrics.intervention_agent.domain_last_activity_at,
        },
      ]
    : [];
  const filteredRows = rows.filter((row) => statusFilter === "all" || row.status === statusFilter);
  const statusLabel = (status: string) => status === "active" ? "Đang hoạt động" : status === "legacy" ? "Độc lập / legacy" : "Sẵn sàng";
  const statusClass = (status: string) => status === "active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "legacy"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <FalconCard
      title="Metric Agents"
      subtitle="Theo dõi Multi-Agent Supervisor, 3 agent trực thuộc và InterventionAgent"
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Activity className="h-4 w-4 text-blue-500" />
          <span>Metric lưu trên Neon · cập nhật tự động mỗi 10 giây</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Lọc theo trạng thái agent"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="ready">Sẵn sàng</option>
            <option value="legacy">Độc lập / legacy</option>
          </select>
          <button
            type="button"
            onClick={() => void metricsQuery.refetch()}
            disabled={metricsQuery.isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${metricsQuery.isFetching ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </div>
      {metricsQuery.isLoading && (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-500" /> Đang tải metric agent...
        </div>
      )}
      {metricsQuery.isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Không tải được metric agent. Kiểm tra quyền admin hoặc thử làm mới.
        </div>
      )}
      {metrics && (
        <div>
          <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
            <div className="bg-white px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Agent trực thuộc</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{metrics.supervisor.managed_agent_count}</p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Dispatch đã lưu</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{metrics.supervisor.dispatches.toLocaleString("vi-VN")}</p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Tỉ lệ thành công</p>
              <p className="mt-1 text-lg font-bold text-emerald-600">{formatAgentPercent(metrics.supervisor.success_rate)}</p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Độ trễ trung bình</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{formatAgentLatency(metrics.supervisor.avg_latency_ms)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1140px] w-full text-left">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 font-semibold">Agent</th>
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Success</th>
                  <th className="px-4 py-3 font-semibold">Calls</th>
                  <th className="px-4 py-3 font-semibold">Failures</th>
                  <th className="px-4 py-3 font-semibold">Events</th>
                  <th className="px-4 py-3 font-semibold">Latency</th>
                  <th className="px-4 py-3 font-semibold">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.key} className="group transition-colors hover:bg-blue-50/40">
                    <td className="px-4 py-3">
                      <div className="flex min-w-[220px] items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${row.key === metrics.supervisor.id ? "bg-blue-50 text-blue-600" : row.status === "legacy" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"}`}>
                          {row.key === metrics.supervisor.id ? <Settings className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
                          <p className="truncate text-[10px] text-slate-400">{row.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="whitespace-nowrap text-xs font-semibold text-slate-700">{row.project}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{row.key === metrics.supervisor.id ? metrics.supervisor.routing_mode : "Bounded domain agent"}</p>
                    </td>
                    <td className="max-w-[190px] px-4 py-3 text-xs text-slate-500">
                      <span className="line-clamp-2">{row.source}</span>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-slate-500">
                      <span className="line-clamp-2">{row.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(row.status)}`}>
                        <span className="mr-1.5 mt-0.5 h-1.5 w-1.5 rounded-full bg-current" />
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{formatAgentPercent(row.successRate)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700">{row.calls.toLocaleString("vi-VN")}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-rose-600">{row.failures.toLocaleString("vi-VN")}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700">{row.events.toLocaleString("vi-VN")}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">{formatAgentLatency(row.latency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatAgentDate(row.lastActivity)}</td>
                  </tr>
                ))}
                {!filteredRows.length && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">Không có agent phù hợp với bộ lọc.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-3 text-[10px] leading-relaxed text-slate-400">
            “Calls”, “Success”, “Failures”, “Latency” và “Last activity” được tổng hợp từ bảng metric trên Neon. “Events” là số sự kiện nghiệp vụ đã lưu riêng. InterventionAgent được hiển thị độc lập vì không đăng ký trong Supervisor · cập nhật {formatAgentDate(metrics.generated_at)}.
          </div>
        </div>
      )}
    </FalconCard>
  );
}

// ===== SETTINGS TAB =====
function SettingsTab() {
  const [settings, setSettings] = useState({
    autoBlock: true,
    aiIntervention: true,
    notifyAdmin: true,
    riskThreshold: 0.7,
    dailyLimit: 50000000,
  });

  return (
    <div className="space-y-4">
      <FalconCard title="Cấu hình AI Anti-Scam" subtitle="Bật/tắt các cơ chế can thiệp tự động">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Tự động chặn giao dịch</p>
              <p className="text-xs text-slate-400">Chặn ngay khi phát hiện rủi ro cao</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, autoBlock: !settings.autoBlock })}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                settings.autoBlock ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                settings.autoBlock ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Can thiệp AI thông minh</p>
              <p className="text-xs text-slate-400">Hiển thị cảnh báo chi tiết cho người dùng</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, aiIntervention: !settings.aiIntervention })}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                settings.aiIntervention ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                settings.aiIntervention ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Thông báo admin</p>
              <p className="text-xs text-slate-400">Gửi alert khi có giao dịch bị chặn</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, notifyAdmin: !settings.notifyAdmin })}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                settings.notifyAdmin ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                settings.notifyAdmin ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
        </div>
      </FalconCard>

      <FalconCard title="Ngưỡng rủi ro" subtitle="Điều chỉnh giới hạn cảnh báo và giao dịch">
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Ngưỡng cảnh báo</span>
              <span className="font-bold text-blue-600">{(settings.riskThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.riskThreshold}
              onChange={(e) => setSettings({ ...settings, riskThreshold: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Giới hạn giao dịch/ngày</span>
              <span className="font-bold text-blue-600">{new Intl.NumberFormat("vi-VN").format(settings.dailyLimit)} đ</span>
            </div>
            <input
              type="range"
              min="1000000"
              max="500000000"
              step="1000000"
              value={settings.dailyLimit}
              onChange={(e) => setSettings({ ...settings, dailyLimit: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        </div>
      </FalconCard>

    </div>
  );
}
