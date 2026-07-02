import axios from 'axios'
import { ElMessage } from 'element-plus'

const http = axios.create({ baseURL: '/api', timeout: 1200000 }) // 20分钟，容纳大批量采集

// 注入 token
http.interceptors.request.use(cfg => {
  const t = localStorage.getItem('token')
  if (t) cfg.headers.Authorization = 'Bearer ' + t
  return cfg
})
http.interceptors.response.use(
  r => r.data,
  e => {
    if (e.response?.status === 401) {
      localStorage.removeItem('token')
      if (location.hash !== '#/login') { location.hash = '#/login'; ElMessage.error('请先登录') }
    }
    return Promise.reject(e.response?.data?.error ? new Error(e.response.data.error) : e)
  }
)

export const api = {
  // auth
  login: (d) => http.post('/auth/login', d),
  me: () => http.get('/auth/me'),
  changePassword: (d) => http.post('/auth/password', d),
  // sources
  sources: () => http.get('/sources'),
  addSource: (d) => http.post('/sources', d),
  updateSource: (id, d) => http.put(`/sources/${id}`, d),
  delSource: (id) => http.delete(`/sources/${id}`),
  pingSource: (id) => http.post(`/sources/${id}/ping`),
  syncSource: (id, d) => http.post(`/sources/${id}/sync`, d),
  sourceLogs: (id) => http.get(`/sources/${id}/logs`),
  sourceTypes: (id) => http.get(`/sources/${id}/types`),
  sourceClasses: (id) => http.get(`/sources/${id}/classes`),
  sourceTypeCount: (id, t, hours) => http.get(`/sources/${id}/typecount`, { params: { t, hours } }),
  collectByKeyword: (keyword) => http.post('/collect/keyword', { keyword }),
  previewKeyword: (kw) => http.get('/collect/keyword/preview', { params: { kw } }),
  confirmKeyword: (keyword, candidates) => http.post('/collect/keyword/confirm', { keyword, candidates }),
  probe: (d) => http.post('/probe', d),
  // vods
  vods: (params) => http.get('/vods', { params }),
  adminVods: (params) => http.get('/admin/vods', { params }),
  batchVods: (ids, action) => http.post('/admin/vods/batch', { ids, action }),
  vod: (id) => http.get(`/admin/vods/${id}`),
  patchVod: (id, d) => http.patch(`/vods/${id}`, d),
  editVod: (id, d) => http.put(`/vods/${id}`, d),
  refreshVod: (id) => http.post(`/vods/${id}/refresh`),
  types: () => http.get('/types'),
  stats: () => http.get('/stats'),
  // categories & mapping
  categories: () => http.get('/categories'),
  adminCategories: () => http.get('/admin/categories'),
  unifyCategories: () => http.post('/admin/categories/unify'),
  backfillSubtypes: () => http.post('/tasks/backfill-subtypes'),
  addCategory: (d) => http.post('/admin/categories', d),
  updateCategory: (id, d) => http.put(`/admin/categories/${id}`, d),
  delCategory: (id) => http.delete(`/admin/categories/${id}`),
  typemaps: (sourceId) => http.get('/admin/typemaps', { params: { sourceId } }),
  setTypemap: (id, categoryId) => http.post(`/admin/typemaps/${id}`, { categoryId }),
  unmappedCount: () => http.get('/admin/typemaps/unmapped'),
  // tasks
  tasks: (params) => http.get('/tasks', { params }),
  taskActiveCount: () => http.get('/tasks/active/count'),
  cleanupTasks: () => http.delete('/tasks/cleanup'),
  cancelTask: (id) => http.post(`/tasks/${id}/cancel`),
  retryTask: (id) => http.post(`/tasks/${id}/retry`),
  // metadata
  metaBatch: (d) => http.post('/meta/batch', d),
  metaMatch: (id) => http.post(`/meta/match/${id}`),
  metaSuggest: (kw) => http.get('/meta/suggest', { params: { kw } }),
  metaSet: (id, doubanId) => http.post(`/meta/set/${id}`, { doubanId }),
  metaStats: () => http.get('/meta/stats'),
  metaConfig: () => http.get('/meta/config'),
  updateMetaConfig: (d) => http.put('/meta/config', d),
  metaBatchRedo: () => http.post('/meta/batch', { redo: true }),
  // site
  site: () => http.get('/site'),
  updateSite: (d) => http.put('/site', d),
}
