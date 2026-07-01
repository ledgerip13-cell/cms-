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
  related: (params) => http.get('/related', { params }),
  resolve: (url) => http.get('/resolve', { params: { url } }),
  site: () => http.get('/site'),
}

// 防盗链图床走服务端代理（豆瓣无 Referer 返回 418）
export function imgUrl(url) {
  if (!url) return ''
  if (/doubanio\.com|douban\.com/.test(url)) return '/api/img?u=' + encodeURIComponent(url)
  return url
}
