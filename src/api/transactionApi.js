import api from './axiosConfig';

export const transactionApi = {
  analyze: (data) => api.post('/transactions/analyze', data),
  decide: (txId, data) => api.post(`/transactions/${txId}/decide`, data),
  intervene: (txId, data) => api.post(`/transactions/${txId}/intervene`, data || {}),
  getHistory: () => api.get('/transactions/history'),
  getById: (id) => api.get(`/transactions/${id}`),
};