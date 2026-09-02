import { api } from '@/services/api';

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  kind: string;
  version?: string | null;
  is_read: boolean;
  created_at: string;
};

export async function getNotifications(limit = 30) {
  const response = await api.get<AppNotification[]>('/v1/notifications', { params: { limit } });
  return response.data;
}

export async function getUnreadNotificationCount() {
  const response = await api.get<{ count: number }>('/v1/notifications/unread-count');
  return response.data.count;
}

export async function markNotificationRead(notificationId: string) {
  await api.post(`/v1/notifications/${notificationId}/read`);
}

export async function markAllNotificationsRead() {
  await api.post('/v1/notifications/read-all');
}
