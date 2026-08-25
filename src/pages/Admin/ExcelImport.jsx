import { useState } from 'react';
import { blacklistApi } from '../../api/blacklistApi';
import LoadingSpinner from '../../components/Common/LoadingSpinner';

export default function ExcelImport() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePreview = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setError('');
    
    // Tạo preview từ file local (đơn giản)
    setPreview({
      name: f.name,
      size: (f.size / 1024).toFixed(1) + ' KB',
      type: f.name.endsWith('.xlsx') ? 'Excel Modern' : 'Excel Legacy'
    });
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const res = await blacklistApi.importExcel(file);
      setResult(res.data);
      setFile(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Import thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">📁 Import Blacklist từ Excel</h1>
      
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Chọn file Excel (scams-done.xlsx)
          </label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handlePreview}
            className="w-full px-4 py-2 border rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="text-xs text-gray-500 mt-1">
            Yêu cầu các cột: Người bị tố cáo, Tên tài khoản, Số tiền, SDT, STK, Ngân hàng, Lượt xem
          </p>
        </div>

        {preview && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">📋 Thông tin file:</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p>Tên: {preview.name}</p>
              <p>Kích thước: {preview.size}</p>
              <p>Định dạng: {preview.type}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="font-semibold text-green-900 mb-2">✅ Import thành công!</h3>
            <div className="text-sm text-green-800 space-y-1">
              <p>Tổng dòng xử lý: {result.import_result.total_rows_processed}</p>
              <p>STK đã import: <strong>{result.import_result.imported_accounts}</strong></p>
              <p>SDT đã import: <strong>{result.import_result.imported_phones}</strong></p>
              <p>Bỏ qua (trùng lặp): {result.import_result.skipped}</p>
            </div>
            {result.preview_sample && (
              <div className="mt-3">
                <p className="font-medium text-green-900">Mẫu dữ liệu:</p>
                <div className="overflow-x-auto mt-2">
                  <table className="min-w-full text-xs">
                    <thead className="bg-green-100">
                      <tr>
                        <th className="px-2 py-1 text-left">Tên</th>
                        <th className="px-2 py-1 text-left">STK</th>
                        <th className="px-2 py-1 text-left">Ngân hàng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.preview_sample.map((row, i) => (
                        <tr key={i} className="border-b border-green-100">
                          <td className="px-2 py-1">{row.ten}</td>
                          <td className="px-2 py-1 font-mono">{row.stk}</td>
                          <td className="px-2 py-1">{row.ngan_hang}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <LoadingSpinner /> : '🚀 Bắt đầu Import'}
        </button>
      </div>
    </div>
  );
}