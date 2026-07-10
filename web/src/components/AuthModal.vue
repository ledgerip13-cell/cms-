<template>
  <Teleport to="body">
    <Transition name="auth-fade">
      <div v-if="authDialog.open" class="auth-overlay" @mousedown.self="close">
        <div class="auth-wall" aria-hidden="true">
          <div v-for="(poster, i) in wallPosters" :key="i" class="auth-poster">
            <img v-if="poster" :src="poster" alt="" @error="onPosterError" />
          </div>
        </div>
        <div class="auth-shade"></div>

        <section class="auth-modal" role="dialog" aria-modal="true" :aria-label="dialogTitle">
          <button class="auth-close" type="button" aria-label="关闭" @click="close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>

          <div class="auth-tabs">
            <button type="button" :class="{on: authDialog.mode === 'login'}" @click="switchMode('login')">登录</button>
            <button type="button" :class="{on: authDialog.mode === 'register'}" :disabled="cfg && !cfg.allowRegister" @click="switchMode('register')">注册</button>
          </div>

          <div class="auth-title">{{ dialogTitle }}</div>
          <div class="auth-sub" v-if="authDialog.reason">{{ authDialog.reason }}</div>
          <div class="auth-sub muted" v-else-if="authDialog.mode === 'register' && cfg && !cfg.allowRegister">当前站点暂未开放注册</div>
          <div class="auth-sub muted" v-else>{{ authDialog.mode === 'login' ? '登录后继续观看、追剧和同步记录' : '创建账号后可保存偏好并获得推荐' }}</div>

          <form class="auth-form" novalidate @submit.prevent="submit">
            <label :class="{invalid: errors.username}">
              <span>账号</span>
              <input v-model.trim="form.username" autocomplete="username" placeholder="3-32位字母/数字/下划线" @input="clearField('username')" />
              <em v-if="errors.username">{{ errors.username }}</em>
            </label>
            <label v-if="authDialog.mode === 'register'" :class="{invalid: errors.nickname}">
              <span>昵称</span>
              <input v-model.trim="form.nickname" autocomplete="nickname" maxlength="32" placeholder="可选" @input="clearField('nickname')" />
              <em v-if="errors.nickname">{{ errors.nickname }}</em>
            </label>
            <label :class="{invalid: errors.password}">
              <span>密码</span>
              <input v-model="form.password" type="password" :autocomplete="authDialog.mode === 'login' ? 'current-password' : 'new-password'" placeholder="至少6位" @input="clearField('password')" />
              <em v-if="errors.password">{{ errors.password }}</em>
            </label>
            <label v-if="authDialog.mode === 'register' && cfg?.inviteRequired" :class="{invalid: errors.inviteCode}">
              <span>邀请码</span>
              <input v-model.trim="form.inviteCode" autocomplete="off" placeholder="请输入邀请码" @input="clearField('inviteCode')" />
              <em v-if="errors.inviteCode">{{ errors.inviteCode }}</em>
            </label>

            <div v-if="serverError" class="auth-server-error">{{ serverError }}</div>
            <button class="auth-submit" :disabled="loading || (authDialog.mode === 'register' && cfg && !cfg.allowRegister)">
              {{ loading ? '处理中...' : (authDialog.mode === 'login' ? '登录' : '注册并登录') }}
            </button>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { authDialog, closeAuthDialog, safeAuthRedirect } from '../authDialog'
import { apiErrorMessage, notifyError, notifySuccess, notifyWarning } from '../feedback'
import { setSession } from '../userStore'

const router = useRouter()
const cfg = ref(null)
const loading = ref(false)
const serverError = ref('')
const posters = ref([])
const form = reactive({ username: '', nickname: '', password: '', inviteCode: '' })
const errors = reactive({ username: '', nickname: '', password: '', inviteCode: '' })
const scrollLock = {
  active: false,
  scrollY: 0,
  body: {},
  html: {},
}
const WALL_POSTER_COUNT = 36
const MAX_SERIES_POSTERS = 4
const WALL_CACHE_KEY = 'vcms.auth.wall.posters.v3'
const WALL_CACHE_TTL_MS = 12 * 60 * 60 * 1000

const dialogTitle = computed(() => authDialog.mode === 'login' ? '欢迎回来' : '创建账号')
const wallPosters = computed(() => {
  return Array.from({ length: WALL_POSTER_COUNT }, (_, i) => posters.value[i] || '')
})

function resetForm() {
  form.username = ''
  form.nickname = ''
  form.password = ''
  form.inviteCode = ''
  clearErrors()
}

function clearErrors() {
  serverError.value = ''
  Object.keys(errors).forEach(key => { errors[key] = '' })
}

function clearField(field) {
  errors[field] = ''
  serverError.value = ''
}

function switchMode(mode) {
  if (mode === 'register' && cfg.value && !cfg.value.allowRegister) {
    notifyWarning('当前站点暂未开放注册')
    return
  }
  authDialog.mode = mode
  clearErrors()
}

function validateForm() {
  let first = ''
  const add = (field, message) => {
    if (field) errors[field] = message
    if (!first) first = message
  }
  if (authDialog.mode === 'register' && cfg.value && !cfg.value.allowRegister) return '当前站点暂未开放注册'
  if (!form.username) add('username', '请输入账号')
  if (authDialog.mode === 'register' && form.username && !/^[A-Za-z0-9_]{4,32}$/.test(form.username)) {
    add('username', '账号需为4-32位字母、数字或下划线')
  }
  if (authDialog.mode === 'register' && form.username && /^\d+$/.test(form.username)) {
    add('username', '账号不能为纯数字')
  }
  if (form.nickname.length > 32) add('nickname', '昵称最多32个字符')
  if (!form.password) add('password', '请输入密码')
  if (authDialog.mode === 'register' && form.password && form.password.length < 6) add('password', '密码至少6位')
  if (authDialog.mode === 'register' && cfg.value?.inviteRequired && !form.inviteCode) {
    add('inviteCode', '请输入邀请码')
  }
  return first
}

function nextRoute() {
  const redirect = safeAuthRedirect(authDialog.redirect, '')
  if (authDialog.mode === 'register') {
    return redirect ? { path: '/me', query: { new: '1', next: redirect } } : { path: '/me', query: { new: '1' } }
  }
  return redirect || ''
}

async function submit() {
  if (!cfg.value) await loadConfig()
  clearErrors()
  const invalid = validateForm()
  if (invalid) {
    notifyWarning(invalid)
    return
  }
  loading.value = true
  try {
    const payload = { username: form.username, password: form.password }
    const result = authDialog.mode === 'login'
      ? await api.userLogin(payload)
      : await api.userRegister({ ...payload, nickname: form.nickname, inviteCode: form.inviteCode })
    setSession(result.token, result.user)
    notifySuccess(authDialog.mode === 'register' ? '注册成功' : '登录成功')
    const route = nextRoute()
    closeAuthDialog()
    if (route) await router.replace(route)
  } catch (error) {
    const message = apiErrorMessage(error)
    serverError.value = message
    notifyError(message)
  } finally {
    loading.value = false
  }
}

function close() {
  if (!loading.value) closeAuthDialog()
}

function lockPageScroll() {
  if (typeof window === 'undefined' || scrollLock.active) return
  const body = document.body
  const html = document.documentElement
  scrollLock.scrollY = window.scrollY || html.scrollTop || 0
  scrollLock.body = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  }
  scrollLock.html = {
    overflow: html.style.overflow,
  }
  body.style.position = 'fixed'
  body.style.top = `-${scrollLock.scrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
  body.style.overflow = 'hidden'
  html.style.overflow = 'hidden'
  scrollLock.active = true
}

function unlockPageScroll() {
  if (typeof window === 'undefined' || !scrollLock.active) return
  const body = document.body
  const html = document.documentElement
  Object.assign(body.style, scrollLock.body)
  Object.assign(html.style, scrollLock.html)
  window.scrollTo(0, scrollLock.scrollY)
  scrollLock.active = false
}

function onPosterError(event) {
  event.target.closest('.auth-poster')?.classList.add('broken')
  event.target.remove()
}

async function loadConfig() {
  try { cfg.value = await api.registerConfig() } catch { cfg.value = { allowRegister: false, inviteRequired: false } }
  if (authDialog.mode === 'register' && cfg.value && !cfg.value.allowRegister) authDialog.mode = 'login'
}

async function loadPosters() {
  if (posters.value.length) return
  const cached = readPosterCache()
  if (cached.length) {
    posters.value = cached
    return
  }
  try {
    const rows = await fetchPosterCandidates()
    const selected = selectWallPosters(rows)
    posters.value = selected
    writePosterCache(selected)
  } catch {
    posters.value = readPosterCache(true)
  }
}

async function fetchPosterCandidates() {
  const tasks = [
    api.vods({ page: 1, size: 80, type: '动漫', sort: 'rating' }),
    api.vods({ page: 1, size: 80, type: '动漫', sort: 'hot' }),
    api.vods({ page: 1, size: 80, sort: 'rating' }),
    api.hot(80, 'anime'),
    api.hot(80),
  ]
  const results = await Promise.allSettled(tasks)
  const rows = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const value = result.value
    rows.push(...(Array.isArray(value) ? value : (value?.list || [])))
  }
  return dedupeRows(rows).sort((a, b) => posterScore(b) - posterScore(a))
}

function readPosterCache(allowExpired = false) {
  try {
    const cached = JSON.parse(localStorage.getItem(WALL_CACHE_KEY) || 'null')
    if (!cached || !Array.isArray(cached.urls)) return []
    if (!allowExpired && Date.now() - Number(cached.at || 0) > WALL_CACHE_TTL_MS) return []
    return cached.urls.filter(Boolean).slice(0, WALL_POSTER_COUNT)
  } catch {
    return []
  }
}

function writePosterCache(urls) {
  if (!urls.length) return
  localStorage.setItem(WALL_CACHE_KEY, JSON.stringify({ at: Date.now(), urls: urls.slice(0, WALL_POSTER_COUNT) }))
}

function dedupeRows(rows) {
  const seen = new Set()
  const list = []
  for (const row of rows || []) {
    const key = row?.id || `${row?.name || ''}:${row?.year || ''}:${posterUrl(row)}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    list.push(row)
  }
  return list
}

function selectWallPosters(rows) {
  const selected = []
  const seenImages = new Set()
  const seriesCounts = new Map()
  for (const row of rows || []) {
    const url = posterUrl(row)
    const imgKey = imageKey(url)
    if (!url || seenImages.has(imgKey)) continue
    const rawKey = seriesKey(row.name)
    const key = resolveSeriesKey(rawKey, seriesCounts)
    if ((seriesCounts.get(key) || 0) >= MAX_SERIES_POSTERS) continue
    selected.push(url)
    seenImages.add(imgKey)
    seriesCounts.set(key, (seriesCounts.get(key) || 0) + 1)
    if (selected.length >= WALL_POSTER_COUNT) break
  }
  return selected
}

function posterUrl(row) {
  const remoteUrls = [row?.officialPic, row?.pic, row?.heroPic].filter(Boolean)
  const urls = remoteUrls.length ? remoteUrls : [row?.localPic].filter(Boolean)
  urls.sort((a, b) => imageScore(b) - imageScore(a))
  return imgUrl(urls[0] || '')
}

function posterScore(row) {
  let score = 0
  if (isAnime(row)) score += 1000
  if (hasDouban(row)) score += 700
  score += imageScore(row?.officialPic) * 18
  score += imageScore(row?.pic) * 10
  score += Math.min(120, Number(row?.ratingCount || 0) / 1000)
  score += Math.min(100, Number(row?.rating || 0) * 8)
  return score
}

function hasDouban(row) {
  return Boolean(row?.doubanId || row?.officialPic || row?.officialIntro || String(row?.metaMatched || '').includes('douban'))
}

function isAnime(row) {
  return /动漫|动画|番剧|国漫|日漫|漫画|漫剧/.test(`${row?.typeName || ''} ${row?.subType || ''} ${row?.genres || ''}`)
}

function imageScore(url) {
  const text = String(url || '')
  if (!text) return 0
  if (/doubanio\.com|douban\.com/i.test(text)) return 8
  if (/^https:\/\//i.test(text)) return 3
  if (/^http:\/\//i.test(text)) return 1
  return 0
}

function imageKey(url) {
  let text = String(url || '')
  const match = text.match(/[?&]u=([^&]+)/)
  if (match) {
    try { text = decodeURIComponent(match[1]) } catch {}
  }
  return text
    .replace(/\/[slm]_ratio_poster\//g, '/ratio_poster/')
    .replace(/\/[slm]\//g, '/')
    .replace(/[?&].*$/, '')
}

function seriesKey(name) {
  let key = String(name || '').trim()
    .replace(/\s+/g, '')
    .replace(/[（(【\[].*?[）)】\]]/g, '')
  const head = key.split(/[：:：\-—_]/)[0]
  if (head.length >= 4) key = head
  key = key
    .replace(/第[一二三四五六七八九十百千万\d]+季.*$/g, '')
    .replace(/第[一二三四五六七八九十百千万\d]+部.*$/g, '')
    .replace(/(续篇|重制版|剧场版|特别篇|番外篇|外传|前传|后传)$/g, '')
    .replace(/[·•・,，.。!！?？]/g, '')
  return key || String(name || '').trim() || 'unknown'
}

function resolveSeriesKey(key, counts) {
  for (const existing of counts.keys()) {
    if (sameSeries(existing, key)) return existing
  }
  return key
}

function sameSeries(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const min = Math.min(a.length, b.length)
  if (min < 4) return false
  let shared = 0
  while (shared < min && a[shared] === b[shared]) shared++
  return shared >= Math.min(5, min)
}

watch(() => authDialog.open, async (open) => {
  if (!open) {
    unlockPageScroll()
    return
  }
  lockPageScroll()
  resetForm()
  await Promise.all([loadConfig(), loadPosters()])
})

onBeforeUnmount(unlockPageScroll)
</script>

<style scoped>
.auth-overlay { position: fixed; inset: 0; z-index: 220; display: flex; align-items: center; justify-content: center;
  padding: 24px; overflow: hidden; background: #07080c; }
.auth-wall { position: absolute; inset: -12vh -12vw; display: grid; grid-template-columns: repeat(9, minmax(112px, 1fr));
  grid-auto-rows: clamp(158px, 23vh, 248px); align-content: center; justify-content: center;
  gap: 14px; transform: rotate(-6deg) scale(1.1); transform-origin: center; opacity: .62; filter: saturate(.98) brightness(.78); }
.auth-poster { height: 100%; min-height: 0; border-radius: 12px; overflow: hidden; background: rgba(21,24,33,.78);
  border: 1px solid rgba(255,255,255,.07); box-shadow: 0 12px 34px rgba(0,0,0,.34); }
.auth-poster:nth-child(-n+9) { transform: translateX(-34px); }
.auth-poster:nth-child(n+10):nth-child(-n+18) { transform: translateX(14px); }
.auth-poster:nth-child(n+19):nth-child(-n+27) { transform: translateX(-16px); }
.auth-poster:nth-child(n+28) { transform: translateX(30px); }
.auth-poster img { width: 100%; height: 100%; object-fit: cover; }
.auth-poster.broken { opacity: .18; }
.auth-shade { position: absolute; inset: 0; background:
  radial-gradient(circle at 50% 45%, rgba(10,11,15,.2), rgba(10,11,15,.58) 60%, rgba(8,9,13,.84) 100%),
  linear-gradient(90deg, rgba(7,8,12,.76), rgba(7,8,12,.28), rgba(7,8,12,.76)); }
.auth-modal { position: relative; width: min(430px, 100%); padding: 24px; border-radius: 16px;
  background: rgba(18,20,27,.62); border: 1px solid rgba(255,255,255,.075);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.045), 0 22px 70px rgba(0,0,0,.56);
  backdrop-filter: blur(28px) saturate(1.24); -webkit-backdrop-filter: blur(28px) saturate(1.24); }
.auth-close { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border: 0; border-radius: 50%;
  background: rgba(255,255,255,.06); color: var(--muted2); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.auth-close:hover { color: var(--text); background: rgba(255,255,255,.1); }
.auth-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
.auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 42px 22px 0; }
.auth-tabs button { height: 44px; border-radius: 11px; border: 0; box-shadow: inset 0 0 0 1px rgba(255,255,255,.085);
  background: rgba(255,255,255,.06); color: var(--muted2); cursor: pointer; font-size: 16px; font-weight: 900;
  backdrop-filter: blur(10px); }
.auth-tabs button.on { background: var(--btn-primary-bg); background-clip: border-box; box-shadow: none; color: var(--btn-primary-text); }
.auth-tabs button:disabled { opacity: .42; cursor: not-allowed; }
.auth-title { font-size: 25px; font-weight: 900; letter-spacing: 0; margin-bottom: 8px; color: var(--text); }
.auth-sub { min-height: 22px; color: #d3d8e3; font-size: 13px; line-height: 1.7; margin-bottom: 20px; }
.auth-sub.muted { color: var(--muted); }
.auth-form { display: flex; flex-direction: column; gap: 13px; }
.auth-form label span { display: block; margin-bottom: 7px; color: var(--muted2); font-size: 12px; font-weight: 700; }
.auth-form input { width: 100%; height: 43px; border-radius: 10px; border: 1px solid rgba(255,255,255,.09);
  background: rgba(9,10,15,.58); color: var(--text); outline: none; padding: 0 13px; font-size: 16px;
  backdrop-filter: blur(10px); }
.auth-form input:focus { border-color: var(--search-focus-border); box-shadow: 0 0 0 3px var(--search-focus-shadow); }
.auth-form label.invalid input { border-color: rgba(255,94,108,.72); }
.auth-form label em { display: block; margin-top: 6px; color: #ff8995; font-style: normal; font-size: 12px; line-height: 1.35; }
.auth-server-error { border: 1px solid rgba(255,94,108,.25); background: rgba(255,94,108,.1); color: #ffd5da;
  border-radius: 10px; padding: 9px 11px; font-size: 13px; line-height: 1.45; }
.auth-submit { height: 44px; margin-top: 2px; border: 0; border-radius: 11px; background: var(--btn-primary-bg);
  background-clip: border-box; box-shadow: none; color: var(--btn-primary-text); cursor: pointer; font-size: 15px; font-weight: 900; }
.auth-submit:disabled { opacity: .58; cursor: not-allowed; }
.auth-fade-enter-active, .auth-fade-leave-active { transition: opacity .18s; }
.auth-fade-enter-from, .auth-fade-leave-to { opacity: 0; }
@media (max-width: 640px) {
  .auth-overlay { padding: 14px; align-items: flex-end; }
  .auth-wall { grid-template-columns: repeat(6, minmax(70px, 1fr)); grid-auto-rows: 118px; gap: 8px; inset: -6vh -24vw;
    transform: rotate(-6deg) scale(1.08); opacity: .58; }
  .auth-poster { border-radius: 9px; }
  .auth-poster:nth-child(-n+6) { transform: translateX(-22px); }
  .auth-poster:nth-child(n+7):nth-child(-n+12) { transform: translateX(12px); }
  .auth-poster:nth-child(n+13):nth-child(-n+18) { transform: translateX(-16px); }
  .auth-poster:nth-child(n+19):nth-child(-n+24) { transform: translateX(16px); }
  .auth-poster:nth-child(n+25):nth-child(-n+30) { transform: translateX(-12px); }
  .auth-poster:nth-child(n+31) { transform: translateX(20px); }
  .auth-modal { padding: 22px 18px calc(20px + env(safe-area-inset-bottom)); border-radius: 18px; }
}
</style>
