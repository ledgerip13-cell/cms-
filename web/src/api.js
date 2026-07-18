import axios from 'axios'
const http = axios.create({ baseURL: '/api', timeout: 30000 })
http.interceptors.request.use(cfg => {
  const token = localStorage.getItem('vcms.user.token')
  if (token) cfg.headers.Authorization = 'Bearer ' + token
  return cfg
})
http.interceptors.response.use(r => r.data)
export const api = {
  vods: (params) => http.get('/vods', { params }),
  vod: (id) => http.get(`/vods/${id}`),
  types: () => http.get('/types'),
  categories: () => http.get('/categories'),
  subtypes: (type) => http.get('/subtypes', { params: { type } }),
  years: (params) => http.get('/years', { params }),
  trailers: (limit = 8) => http.get('/trailers', { params: { limit } }),
  hot: (limit, cat) => http.get('/hot', { params: { limit, cat } }),
  shortFeed: (params) => http.get('/short-feed', { params }),
  shortFeedOptions: () => http.get('/short-feed/options'),
  related: (params) => http.get('/related', { params }),
  weekly: () => http.get('/weekly'),
  resolvePlay: (d) => http.get('/resolve', { params: d }),
  site: () => http.get('/site'),
  registerConfig: () => http.get('/user/register-config'),
  userRegister: (d) => http.post('/user/register', d),
  userLogin: (d) => http.post('/user/login', d),
  userMe: () => http.get('/user/me'),
  updateUserProfile: (d) => http.put('/user/profile', d),
  changeUserPassword: (d) => http.post('/user/password', d),
  userVodState: (id) => http.get(`/user/vods/${id}/state`),
  followVod: (id) => http.post(`/user/follows/${id}`),
  unfollowVod: (id) => http.delete(`/user/follows/${id}`),
  follows: (limit = 50) => http.get('/user/follows', { params: { limit } }),
  history: (limit = 50) => http.get('/user/history', { params: { limit } }),
  saveHistory: (d) => http.post('/user/history', d),
  userRecommendations: (limit = 24) => http.get('/user/recommendations', { params: { limit } }),
}

// 防盗链图床走服务端代理（豆瓣无 Referer 返回 418）
export function imgUrl(url) {
  if (!url) return ''
  if (/doubanio\.com|douban\.com/.test(url)) return '/api/img?u=' + encodeURIComponent(url)
  return url
}
