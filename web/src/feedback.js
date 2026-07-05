import { ref } from 'vue'

export const toasts = ref([])

let toastSeed = 1

export function apiErrorMessage(error, fallback = '操作失败') {
  return error?.response?.data?.error || error?.message || fallback
}

export function notify(message, type = 'info', duration = 3200) {
  const text = String(message || '').trim()
  if (!text) return 0
  const id = toastSeed++
  toasts.value = [...toasts.value, { id, type, message: text }]
  window.setTimeout(() => dismissToast(id), duration)
  return id
}

export function dismissToast(id) {
  toasts.value = toasts.value.filter(item => item.id !== id)
}

export const notifySuccess = (message, duration) => notify(message, 'success', duration)
export const notifyError = (message, duration) => notify(message, 'error', duration)
export const notifyWarning = (message, duration) => notify(message, 'warning', duration)
