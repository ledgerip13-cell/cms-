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
  vodSuggest: (kw, limit = 10) => http.get('/vods/suggest', { params: { kw, limit } }),
  searchCorrections: (kw, limit = 3) => http.get('/search-corrections', { params: { kw, limit } }),
  vod: (id) => http.get(`/vods/${id}`),
  person: (id) => http.get(`/people/${id}`),
  types: () => http.get('/types'),
  categories: () => http.get('/categories'),
  subtypes: (type) => http.get('/subtypes', { params: { type } }),
  years: (params) => http.get('/years', { params }),
  trailers: (limit = 8) => http.get('/trailers', { params: { limit } }),
  hot: (limit, cat) => http.get('/hot', { params: { limit, cat } }),
  searchHotTerms: (limit = 10) => http.get('/search-hot-terms', { params: { limit } }),
  logSearch: (d) => http.post('/search-logs', d).catch(() => null),
  interactionConfig: () => http.get('/interactions/config'),
  vodComments: (vodId, limit = 30) => http.get(`/vods/${vodId}/comments`, { params: { limit } }),
  postVodComment: (vodId, d) => http.post(`/vods/${vodId}/comments`, d),
  vodRating: (vodId) => http.get(`/vods/${vodId}/rating`),
  rateVod: (vodId, d) => http.post(`/vods/${vodId}/rating`, d),
  requestVod: (d) => http.post('/vod-requests', d),
  reportContent: (d) => http.post('/reports', d),
  userMessages: () => http.get('/user/messages'),
  readUserMessage: (id) => http.post(`/user/messages/${id}/read`),
  danmaku: (vodId, params) => http.get(`/vods/${vodId}/danmaku`, { params }),
  sendDanmaku: (vodId, d) => http.post(`/vods/${vodId}/danmaku`, d),
  shortFeed: (params) => http.get('/short-feed', { params }),
  shortFeedOptions: () => http.get('/short-feed/options'),
  related: (params) => http.get('/related', { params }),
  weekly: () => http.get('/weekly'),
  resolvePlay: (d) => http.get('/resolve', { params: d }),
  reportPlaybackError: (d) => http.post('/playback-errors', d).catch(() => null),
  site: () => http.get('/site'),
  registerConfig: () => http.get('/user/register-config'),
  userRegister: (d) => http.post('/user/register', d),
  userLogin: (d) => http.post('/user/login', d),
  userMe: () => http.get('/user/me'),
  updateUserProfile: (d) => http.put('/user/profile', d),
  changeUserPassword: (d) => http.post('/user/password', d),
  userVodState: (id) => http.get(`/user/vods/${id}/state`),
  saveVodSkipPreference: (id, d) => http.put(`/user/vods/${id}/skip`, d),
  resetVodSkipPreference: (id) => http.delete(`/user/vods/${id}/skip`),
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
