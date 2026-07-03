<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-brand">
        <div class="brand-mark"><el-icon :size="26"><VideoCamera /></el-icon></div>
        <div class="login-title">视频CMS</div>
        <div class="login-sub">采集聚合管理后台</div>
      </div>
      <el-form @submit.prevent="submit">
        <el-input v-model="username" placeholder="账号" size="large" :prefix-icon="User" class="fld" />
        <el-input v-model="password" type="password" placeholder="密码" size="large" :prefix-icon="Lock"
          show-password @keyup.enter="submit" class="fld" />
        <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="submit">登 录</el-button>
      </el-form>
      <div class="login-tip">默认账号 admin / admin888，登录后请及时修改密码</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'
const route = useRoute()
const router = useRouter()
const username = ref('admin'); const password = ref(''); const loading = ref(false)
async function submit() {
  if (!password.value) return ElMessage.warning('请输入密码')
  loading.value = true
  try {
    const r = await api.login({ username: username.value, password: password.value })
    localStorage.setItem('token', r.token)
    localStorage.setItem('user', JSON.stringify(r.user))
    ElMessage.success('登录成功')
    const next = typeof route.query.next === 'string' && route.query.next !== '/login'
      ? route.query.next
      : '/dashboard'
    await router.replace(next)
  } catch (e) { ElMessage.error(e.message || '登录失败') } finally { loading.value = false }
}
</script>

<style scoped>
.login-wrap { height: 100vh; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(1200px 600px at 20% 10%, #2a2f4a 0%, #171b26 60%, #10131c 100%); }
.login-card { width: 380px; background: #fff; border-radius: 18px; padding: 40px 36px 30px;
  box-shadow: 0 24px 70px rgba(0,0,0,.35); }
.login-brand { text-align: center; margin-bottom: 28px; }
.brand-mark { width: 56px; height: 56px; border-radius: 14px; margin: 0 auto 14px;
  background: linear-gradient(135deg, var(--brand-1), var(--brand-2));
  display: flex; align-items: center; justify-content: center; color: #fff; }
.login-title { font-size: 22px; font-weight: 750; color: var(--text-1); letter-spacing: 1px; }
.login-sub { color: var(--text-3); font-size: 13px; margin-top: 4px; }
.fld { margin-bottom: 18px; }
.login-btn { width: 100%; letter-spacing: 4px; margin-top: 4px; }
.login-tip { text-align: center; color: var(--text-3); font-size: 12px; margin-top: 20px; }
</style>
