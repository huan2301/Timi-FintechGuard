export default function RiskBadge({ level, score }) {
  const configs = {
    low: { bg: 'bg-green-100', text: 'text-green-800', label: 'THẤP', icon: '✅' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'TRUNG BÌNH', icon: '⚠️' },
    high: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'CAO', icon: '🚨' },
    critical: { bg: 'bg-red-100', text: 'text-red-800', label: 'NGUY HIỂM', icon: '☠️' },
  };
  
  const c = configs[level] || configs.low;
  
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${c.bg} ${c.text}`}>
      {c.icon} {c.label} {score ? `(${(score * 100).toFixed(1)}%)` : ''}
    </span>
  );
}