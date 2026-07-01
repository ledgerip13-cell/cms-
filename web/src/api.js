import axios from 'axios'
const http = axios.create({ baseURL: '/api', timeout: 30000 })
http.interceptors.response.use(r => r.data)
export const api = {
  vods: (params) => http.get('/vods', { params }),
  vod: (id) => http.get(`/vods/${id}`),
  types: () => http.get('/types'),
  categories: () => http.get('/categories'),
  subtypes: (type) => http.get('/subtypes', { params: { type } }),
  years: () => http.get('/years'),
  hot: (limit) => http.get('/hot', { params: { limit } }),
  resolve: (url) => http.get('/resolve', { params: { url } }),
  site: () => http.get('/site'),
}
