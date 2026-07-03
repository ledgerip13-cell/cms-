import { ref } from 'vue'
import { api } from './api'

export const USER_TOKEN_KEY = 'vcms.user.token'
export const USER_INFO_KEY = 'vcms.user'
export const currentUser = ref(readUser())

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_INFO_KEY) || 'null')
  } catch {
    return null
  }
}

export function setSession(token, user) {
  localStorage.setItem(USER_TOKEN_KEY, token)
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(user))
  currentUser.value = user
}

export function clearSession() {
  localStorage.removeItem(USER_TOKEN_KEY)
  localStorage.removeItem(USER_INFO_KEY)
  currentUser.value = null
}

export async function refreshUser() {
  if (!localStorage.getItem(USER_TOKEN_KEY)) return null
  try {
    const user = await api.userMe()
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(user))
    currentUser.value = user
    return user
  } catch {
    clearSession()
    return null
  }
}
