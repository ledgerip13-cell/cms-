<template>
  <div class="page auth-page">
    <div class="auth-panel">
      <div class="auth-tabs">
        <button :class="{on: mode==='login'}" @click="mode='login'">登录</button>
        <button :class="{on: mode==='register'}" @click="mode='register'" :disabled="cfg && !cfg.allowRegister">注册</button>
      </div>

      <div class="auth-title">{{ mode === 'login' ? '欢迎回来' : '创建账号' }}</div>
      <div class="auth-sub" v-if="mode==='register' && cfg && !cfg.allowRegister">当前站点暂未开放注册</div>
      <div class="auth-sub" v-else>{{ mode === 'login' ? '登录后可追剧、同步观看历史和获得推荐' : '注册后选择偏好类型，系统会自动推荐内容' }}</div>

      <form class="auth-form" @submit.prevent="submit">
        <label>
          <span>账号</span>
          <input v-model.trim="form.username" autocomplete="username" placeholder="3-32位字母/数字/下划线" />
        </label>
        <label v-if="mode==='register'">
          <span>昵称</span>
          <input v-model.trim="form.nickname" autocomplete="nickname" placeholder="可选" />
        </label>
        <label>
          <span>密码</span>
          <input v-model="form.password" type="password" autocomplete="current-password" placeholder="至少6位" />
        </label>
        <label v-if="mode==='register' && cfg?.inviteRequired">
          <span>邀请码</span>
          <input v-model.trim="form.inviteCode" placeholder="请输入注册邀请码" />
        </label>
        <div v-if="err" class="auth-err">{{ err }}</div>
        <div v-if="msg" class="auth-ok">{{ msg }}</div>
        <button class="auth-submit" :disabled="loading || (mode==='register' && cfg && !cfg.allowRegister)">
          {{ loading ? '处理中…' : (mode === 'login' ? '登录' : '注册并登录') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { setSession } from '../userStore'

const route = useRoute()
const router = useRouter()
const mode = ref(route.query.mode === 'register' ? 'register' : 'login')
const cfg = ref(null)
const loading = ref(false)
const err = ref('')
const msg = ref('')
const form = reactive({ username: '', nickname: '', password: '', inviteCode: '' })

function safeRedirect(target, fallback) {
  const raw = Array.isArray(target) ? target[0] : target
  if (!raw || typeof raw !== 'string') return fallback
  if (/^(https?:)?\/\//i.test(raw)) return fallback
  const path = raw.startsWith('/') ? raw : `/${raw}`
  if (path === '/auth' || path.startsWith('/auth?')) return fallback
  return path
}

function nextRoute() {
  if (mode.value === 'register') {
    const redirect = safeRedirect(route.query.redirect, '')
    return redirect
      ? { path: '/me', query: { new: '1', next: redirect } }
      : { path: '/me', query: { new: '1' } }
  }
  return safeRedirect(route.query.redirect, '/')
}

async function submit() {
  err.value = ''
  msg.value = ''
  if (!form.username || !form.password) { err.value = '请输入账号和密码'; return }
  loading.value = true
  try {
    const r = mode.value === 'login'
      ? await api.userLogin({ username: form.username, password: form.password })
      : await api.userRegister({ username: form.username, nickname: form.nickname, password: form.password, inviteCode: form.inviteCode })
    setSession(r.token, r.user)
    msg.value = mode.value === 'register' ? '注册成功，正在进入偏好设置…' : '登录成功，正在进入…'
    await router.replace(nextRoute())
  } catch (e) {
    err.value = e?.response?.data?.error || e?.message || '操作失败'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try { cfg.value = await api.registerConfig() } catch { cfg.value = { allowRegister: false, inviteRequired: false } }
})
</script>
