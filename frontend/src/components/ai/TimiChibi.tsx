import { Sparkles, Shield } from "lucide-react";

type TimiChibiProps = {
  compact?: boolean;
  warning?: boolean;
  walking?: boolean;
};

/** AI Energy Core — A professional glowing orb inspired by quantum vortex aesthetics */
export default function TimiChibi({ compact = false, warning = false, walking = false }: TimiChibiProps) {
  const sizeClass = compact ? "h-14 w-14" : "h-24 w-24";
  const glowColor = warning ? "#f59e0b" : "#6366f1";
  const coreColor = warning ? "from-amber-400 via-orange-500 to-amber-600" : "from-blue-400 via-indigo-500 to-violet-600";

  return (
    <div className={`relative shrink-0 grid place-items-center ${sizeClass} ${walking ? "animate-float-core" : ""}`} aria-hidden="true">
      {/* Outer glow rings */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-violet-500/20 blur-xl animate-pulse-slow" />
      <div className="absolute inset-1 rounded-full bg-gradient-to-r from-cyan-400/10 via-blue-500/10 to-indigo-500/10 blur-lg" />

      {/* Rotating vortex ring */}
      <svg className="absolute inset-0 w-full h-full animate-spin-vortex" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="vortexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.8" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="50" cy="50" r="42" fill="none" stroke="url(#vortexGrad)" strokeWidth="1.5" strokeDasharray="8 6" filter="url(#glow)" opacity="0.7" />
        <circle cx="50" cy="50" r="36" fill="none" stroke="url(#vortexGrad)" strokeWidth="1" strokeDasharray="4 10" opacity="0.5" className="animate-spin-reverse" />
      </svg>

      {/* Lightning arcs */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
        <path d="M20 30 Q35 20 50 35 T80 25" fill="none" stroke={glowColor} strokeWidth="0.8" opacity="0.4" className="animate-pulse">
          <animate attributeName="d" values="M20 30 Q35 20 50 35 T80 25;M25 28 Q40 22 52 32 T78 28;M20 30 Q35 20 50 35 T80 25" dur="3s" repeatCount="indefinite" />
        </path>
        <path d="M25 70 Q40 80 50 65 T75 75" fill="none" stroke={glowColor} strokeWidth="0.8" opacity="0.3" className="animate-pulse" style={{ animationDelay: "1s" }}>
          <animate attributeName="d" values="M25 70 Q40 80 50 65 T75 75;M22 68 Q38 78 52 63 T78 72;M25 70 Q40 80 50 65 T75 75" dur="2.5s" repeatCount="indefinite" />
        </path>
      </svg>

      {/* Core orb */}
      <div className={`relative z-10 rounded-full bg-gradient-to-br ${coreColor} p-[2px] shadow-lg shadow-indigo-500/30`}>
        <div className="rounded-full bg-slate-950 flex items-center justify-center" style={{ width: compact ? 36 : 60, height: compact ? 36 : 60 }}>
          <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${coreColor} opacity-20 blur-md animate-pulse`} />
          {warning ? (
            <Shield className={`${compact ? "w-5 h-5" : "w-8 h-8"} text-amber-400 animate-pulse`} />
          ) : (
            <Sparkles className={`${compact ? "w-5 h-5" : "w-8 h-8"} text-blue-300`} />
          )}
        </div>
      </div>

      {/* Orbiting particles */}
      <div className="absolute inset-0 animate-spin-slow pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
      </div>
      <div className="absolute inset-0 animate-spin-slow-reverse pointer-events-none" style={{ animationDelay: "1.5s" }}>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-violet-400 shadow-[0_0_4px_rgba(167,139,250,0.8)]" />
      </div>

      {/* Status dot */}
      <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400 shadow-sm z-20" />

      <style>{`
        @keyframes spin-vortex { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spin-reverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes float-core { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes pulse-slow { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } }
        .animate-spin-vortex { animation: spin-vortex 8s linear infinite; }
        .animate-spin-reverse { animation: spin-reverse 12s linear infinite; }
        .animate-spin-slow { animation: spin-vortex 6s linear infinite; }
        .animate-spin-slow-reverse { animation: spin-reverse 8s linear infinite; }
        .animate-float-core { animation: float-core 3s ease-in-out infinite; }
        .animate-pulse-slow { animation: pulse-slow 4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
