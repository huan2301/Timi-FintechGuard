import { isAxiosError } from 'axios';

export function formatCurrency(value: number) {
  return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (error.response?.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : '')
        .filter(Boolean);
      if (messages.length) return messages.join('. ');
    }
    if (error.code === 'ECONNABORTED') return 'Máy chủ phản hồi quá lâu. Hãy kiểm tra mạng và thử lại.';
    if (!error.response) return 'Không kết nối được máy chủ. Hãy kiểm tra URL API và mạng.';
    if (error.response.status >= 500) return 'Máy chủ đang gặp sự cố. Hãy thử lại sau ít phút.';
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function initials(name?: string | null) {
  const parts = (name || 'Timi').trim().split(/\s+/);
  return parts.slice(-2).map((part) => part[0]?.toUpperCase()).join('');
}
