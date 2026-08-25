import { useEffect, useState } from 'react';
import { blacklistApi } from '../../api/blacklistApi';
import LoadingSpinner from '../../components/Common/LoadingSpinner';

export default function BlacklistManager() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await blacklistApi.getStatistics();
      setStats(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-10"><LoadingSpinner /></div>;

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">🛡️ Quản lý Blacklist</h1>
      
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="text-3xl font-bold text-blue-600">{stats.total_accounts.toLocaleString()}</div>
            <div className="text-gray-500 text-sm mt-1">Tài khoản (STK) trong blacklist</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="text-3xl font-bold text-purple-600">{stats.total_phones.toLocaleString()}</div>
            <div className="text-gray-500 text-sm mt-1">Số điện thoại trong blacklist</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="text-3xl font-bold text-green-600">{stats.total_active.toLocaleString()}</div>
            <div className="text-gray-500 text-sm mt-1">Tổng entity đang active</div>
          </div>
        </div>
      )}

      {/* Top banks */}
      {stats?.top_banks && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-bold mb-4">🏦 Top ngân hàng bị tố cáo nhiều nhất</h2>
          <div className="space-y-3">
            {stats.top_banks.map((bank, idx) => (
              <div key={idx} className="flex items-center">
                <div className="w-8 text-gray-400 font-bold">#{idx + 1}</div>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{bank.bank}</span>
                    <span className="text-sm text-gray-500">{bank.count} cases</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${Math.min(100, (bank.count / stats.top_banks[0].count) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}