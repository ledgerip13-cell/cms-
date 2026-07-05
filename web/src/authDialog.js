import { reactive } from 'vue'

export const authDialog = reactive({
  open: false,
  mode: 'login',
  redirect: '',
  reason: '',
})

export function safeAuthRedirect(target, fallback = '') {
  const raw = Array.isArray(target) ? target[0] : target
  if (!raw || typeof raw !== 'string') return fallback
  if (/^(https?:)?\/\//i.test(raw)) return fallback
  const path = raw.startsWith('/') ? raw : `/${raw}`
  if (path === '/auth' || path.startsWith('/auth?')) return fallback
  return path
}

export function openAuthDialog(options = {}) {
  authDialog.mode = options.mode === 'register' ? 'register' : 'login'
  authDialog.redirect = safeAuthRedirect(options.redirect, '')
  authDialog.reason = String(options.reason || '')
  authDialog.open = true
}

export function closeAuthDialog() {
  authDialog.open = false
  authDialog.reason = ''
}
