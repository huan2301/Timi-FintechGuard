import api from './axiosConfig';

export const blacklistApi = {
  importExcel: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/blacklist/import-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getStatistics: () => api.get('/blacklist/statistics'),
  getAll: (params) => api.get('/blacklist', { params }),
  add: (data) => api.post('/blacklist', data),
};