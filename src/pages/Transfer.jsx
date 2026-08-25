import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactionApi } from '../api/transactionApi';
import RiskBadge from '../components/Risk/RiskBadge';
import LoadingSpinner from '../components/Common/LoadingSpinner';

export default function Transfer() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    recipient_name: '',
    recipient_account: '',
    recipient_bank: '',
    amount: '',
    currency: 'VND',
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const banks = [
    'MB BANK', 'Vietcombank', 'Techcombank', 'BIDV', 'Vietinbank',
    'ACB', 'VPBank', 'TPBank', 'Sacombank', 'HD Bank', 'OCB',
    'Ví Momo', 'Ví điện tử (ViettelPay, Zalopay, ShopeePay...)',
    'Ngân Hàng Á CHÂU', 'Ngân hàng khác...'
  ];

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await transactionApi.analyze({
        ...form,
        amount: parseFloat(form.amount),
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = () => {
    if (!result) return;
    
    // Nếu rủi ro thấp hoặc medium → cho phép quyết định ngay
    if (result.risk_level === 'low') {
      handleConfirm(result.id);
    } else {
      // Chuyển sang trang can thiệp HITL
      navigate(`/intervention/${result.id}`);
    }
  };

  const handleConfirm = async (txId) => {
    try {
      await transactionApi.decide(txId, { decision: 'confirmed' });
      alert('✅ Giao dịch đã được xác nhận và đang xử lý!');
      navigate('/history');
    } catch (err) {
      alert('❌ Lỗi: ' + (err.response?.data?.detail || 'Không thể xác nhận'));
    }
  };

  const handleCancel = async () => {
    if (!result) return;
    try {
      await transactionApi.decide(result.id, { decision: 'cancelled' });
      alert('🛡️ Giao dịch đã bị hủy để bảo vệ bạn.');
      setResult(null);
    } catch (err) {
      alert('❌ Lỗi: ' + (err.response?.data?.detail || 'Không thể hủy'));
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">💸 Chuyển tiền</h1>

      {/* Form chuyển tiền */}
      {!result && (
        <form onSubmit={handleAnalyze} className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên người nhận</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                value={form.recipient_name}
                onChange={e => setForm({...form, recipient_name: e.target.value})}
                placeholder="NGUYEN VAN A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                value={form.recipient_account}
                onChange={e => setForm({...form, recipient_account: e.target.value})}
                placeholder="999888777"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng / Ví</label>
              <select
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                value={form.recipient_bank}
                onChange={e => setForm({...form, recipient_bank: e.target.value})}
              >
                <option value="">-- Chọn --</option>
                {banks.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VND)</label>
              <input
                type="number"
                required
                min="1000"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                value={form.amount}
                onChange={e => setForm({...form, amount: e.target.value})}
                placeholder="100000"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung chuyển tiền</label>
            <textarea
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={2}
              value={form.description}
              onChange={e => setForm({...form, description: e.target.value})}
              placeholder="Chuyển tiền mua hàng..."
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <LoadingSpinner /> : '🔍 Kiểm tra & Phân tích rủi ro'}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Kết quả phân tích rủi ro */}
      {result && (
        <div className="mt-6 space-y-4">
          {/* Risk Summary Card */}
          <div className={`rounded-xl shadow-lg p-6 border-l-4 ${
            result.risk_level === 'low' ? 'bg-green-50 border-green-500' :
            result.risk_level === 'medium' ? 'bg-yellow-50 border-yellow-500' :
            result.risk_level === 'high' ? 'bg-orange-50 border-orange-500' :
            'bg-red-50 border-red-600'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">📊 Kết quả phân tích rủi ro</h2>
              <RiskBadge level={result.risk_level} score={result.risk_analysis?.final_risk_score} />
            </div>

            {/* Thông tin giao dịch */}
            <div className="bg-white rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">Người nhận:</span> <strong>{result.recipient_name}</strong></div>
                <div><span className="text-gray-500">STK:</span> <strong>{result.recipient_account}</strong></div>
                <div><span className="text-gray-500">Ngân hàng:</span> <strong>{result.recipient_bank || 'Không rõ'}</strong></div>
                <div><span className="text-gray-500">Số tiền:</span> <strong>{parseFloat(result.amount).toLocaleString('vi-VN')} {result.currency}</strong></div>
              </div>
            </div>

            {/* Chi tiết rủi ro */}
            {result.risk_analysis && (
              <div className="space-y-3">
                <div className="bg-white rounded-lg p-4">
                  <h3 className="font-semibold text-gray-700 mb-2">🛡️ Đánh giá chi tiết:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-gray-500">ML Score</div>
                      <div className="font-mono font-bold text-lg">
                        {result.risk_analysis.ml_risk_score ? (result.risk_analysis.ml_risk_score * 100).toFixed(1) : '--'}%
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-gray-500">Rule Score</div>
                      <div className="font-mono font-bold text-lg">
                        {result.risk_analysis.rule_risk_score ? (result.risk_analysis.rule_risk_score * 100).toFixed(1) : '--'}%
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-gray-500">Tổng hợp</div>
                      <div className="font-mono font-bold text-lg text-red-600">
                        {(result.risk_analysis.final_risk_score * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lý do cảnh báo */}
                {result.risk_analysis.warning_reason && (
                  <div className="bg-white rounded-lg p-4 border border-yellow-300">
                    <h3 className="font-semibold text-yellow-800 mb-1">⚠️ Lý do cảnh báo:</h3>
                    <p className="text-gray-700">{result.risk_analysis.warning_reason}</p>
                  </div>
                )}

                {/* Blacklist matches */}
                {result.risk_analysis.matched_blacklist?.length > 0 && (
                  <div className="bg-red-100 rounded-lg p-4 border border-red-300">
                    <h3 className="font-semibold text-red-800 mb-2">🚨 Phát hiện trong danh sách đen:</h3>
                    <div className="space-y-2">
                      {result.risk_analysis.matched_blacklist.map((match, idx) => (
                        <div key={idx} className="bg-white rounded p-3 text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">{match.entity}</span>
                            <span className="text-red-600 font-bold">{Math.round(match.risk * 100)}% rủi ro</span>
                          </div>
                          <div className="text-gray-500 text-xs mt-1">
                            Nguồn: {match.source} | {match.evidence?.ten || ''} | {match.evidence?.ngan_hang || ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pattern matches */}
                {result.risk_analysis.matched_patterns?.length > 0 && (
                  <div className="bg-orange-100 rounded-lg p-4 border border-orange-300">
                    <h3 className="font-semibold text-orange-800 mb-2">🕵️ Pattern lừa đảo phát hiện:</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.risk_analysis.matched_patterns.map((p, idx) => (
                        <span key={idx} className="px-3 py-1 bg-orange-200 text-orange-900 rounded-full text-sm font-medium">
                          {p.name} ({Math.round(p.weight * 100)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 mt-6">
              {result.risk_level === 'low' ? (
                <button
                  onClick={() => handleConfirm(result.id)}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700"
                >
                  ✅ Xác nhận chuyển tiền
                </button>
              ) : (
                <button
                  onClick={handleProceed}
                  className="flex-1 bg-yellow-600 text-white py-3 rounded-lg font-semibold hover:bg-yellow-700"
                >
                  ⚠️ Xem chi tiết rủi ro & Quyết định
                </button>
              )}
              <button
                onClick={handleCancel}
                className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300"
              >
                ❌ Hủy giao dịch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}