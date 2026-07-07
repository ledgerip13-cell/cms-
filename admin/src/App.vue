<template>
  <router-view v-if="$route.meta.public" />
  <el-container v-else class="layout">
    <el-aside width="220px" class="side">
      <div class="brand">
        <div class="brand-mark"><el-icon :size="20"><VideoCamera /></el-icon></div>
        <div class="brand-text">
          <span class="brand-name">视频CMS</span>
          <span class="brand-sub">采集聚合后台</span>
        </div>
      </div>
      <el-menu
        :default-active="$route.path"
        :default-openeds="defaultOpeneds"
        router
        unique-opened
        class="menu"
        :collapse="false"
      >
        <template v-for="section in menuSections" :key="section.index">
          <el-sub-menu v-if="section.children" :index="section.index">
            <template #title>
              <el-icon><component :is="section.icon" /></el-icon>
              <span>{{ section.label }}</span>
            </template>
            <el-menu-item v-for="m in section.children" :key="m.path" :index="m.path">
              <el-icon><component :is="m.icon" /></el-icon>
              <span>{{ m.label }}</span>
              <el-badge v-if="m.path==='/tasks' && activeTasks" :value="activeTasks" class="menu-badge" />
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="section.path">
            <el-icon><component :is="section.icon" /></el-icon>
            <span>{{ section.label }}</span>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="crumb">
          <el-icon class="crumb-icon"><component :is="currentIcon" /></el-icon>
          <span>{{ $route.meta.title }}</span>
        </div>
        <el-dropdown @command="onCmd" trigger="click">
          <div class="user">
            <el-avatar :size="30" class="user-avatar"><el-icon><User /></el-icon></el-avatar>
            <span class="user-name">{{ user.username }}</span>
            <el-icon class="user-caret"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="pwd"><el-icon><Lock /></el-icon>修改密码</el-dropdown-item>
              <el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main"><router-view /></el-main>
    </el-container>
  </el-container>

  <el-dialog v-model="pwdDlg" title="修改密码" width="420">
    <el-form label-width="88px">
      <el-form-item label="原密码"><el-input v-model="pwd.oldPassword" type="password" show-password placeholder="请输入原密码" /></el-form-item>
      <el-form-item label="新密码"><el-input v-model="pwd.newPassword" type="password" show-password placeholder="至少 6 位" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="pwdDlg=false">取消</el-button>
      <el-button type="primary" @click="doPwd">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DataLine, Connection, List, Files, Film, Setting, MagicStick, UserFilled, StarFilled, Key, VideoPlay } from '@element-plus/icons-vue'
import { api } from './api'

const route = useRoute()
const router = useRouter()
const user = ref(JSON.parse(localStorage.getItem('user') || '{"username":"—"}'))
const pwdDlg = ref(false); const pwd = ref({ oldPassword:'', newPassword:'' })
let activeTimer = null

const menuSections = [
  { index: 'dashboard', path: '/dashboard', label: '运行概览', icon: DataLine },
  {
    index: 'collect',
    label: '采集引擎',
    icon: Connection,
    children: [
      { path: '/sources', label: '采集源管理', icon: Connection },
      { path: '/tasks', label: '采集任务进度', icon: List },
      { path: '/categories', label: '分类映射面板', icon: Files },
    ],
  },
  {
    index: 'content',
    label: '内容运营',
    icon: Film,
    children: [
      { path: '/vods', label: '影片库管理', icon: Film },
      { path: '/meta', label: '豆瓣元数据', icon: MagicStick },
      { path: '/hot', label: '热门推荐', icon: StarFilled },
    ],
  },
  { index: 'playback', path: '/hls-clean', label: '播放治理', icon: VideoPlay },
  {
    index: 'users-security',
    label: '用户与权限',
    icon: UserFilled,
    children: [
      { path: '/users', label: '用户管理', icon: UserFilled },
      { path: '/access', label: '权限访问', icon: Key },
    ],
  },
  { index: 'settings', path: '/site', label: '系统设置', icon: Setting },
]
const flatMenus = computed(() => menuSections.flatMap(s => s.children || [s]))
const currentIcon = computed(() => (flatMenus.value.find(m => m.path === route.path) || flatMenus.value[0]).icon)
const defaultOpeneds = computed(() => menuSections.filter(s => s.children?.some(m => m.path === route.path)).map(s => s.index))

const activeTasks = ref(0)
async function pollActive() { try { activeTasks.value = (await api.taskActiveCount()).active } catch {} }
function refreshShell() {
  user.value = JSON.parse(localStorage.getItem('user') || '{"username":"—"}')
  if (localStorage.getItem('token') && !activeTimer) {
    pollActive()
    activeTimer = setInterval(pollActive, 3000)
  }
}
watch(() => route.path, refreshShell, { immediate: true })

function onCmd(c) {
  if (c === 'logout') {
    ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' }).then(() => {
      localStorage.removeItem('token'); localStorage.removeItem('user'); router.push('/login')
    }).catch(() => {})
  } else if (c === 'pwd') { pwd.value = { oldPassword:'', newPassword:'' }; pwdDlg.value = true }
}
async function doPwd() {
  try {
    await api.changePassword(pwd.value); ElMessage.success('密码已修改，请重新登录')
    localStorage.removeItem('token'); pwdDlg.value = false; router.push('/login')
  } catch (e) { ElMessage.error(e.message) }
}
</script>

<style scoped>
.layout { height: 100vh; }

/* 侧边栏 */
.side { background: var(--side-bg); display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 12px; padding: 20px 20px 18px; }
.brand-mark { width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--brand-1), var(--brand-2));
  display: flex; align-items: center; justify-content: center; color: #fff; }
.brand-text { display: flex; flex-direction: column; line-height: 1.25; }
.brand-name { color: #fff; font-size: 17px; font-weight: 700; letter-spacing: .5px; }
.brand-sub { color: #6b7688; font-size: 12px; }

.menu { border-right: none; background: transparent; padding: 6px 12px; }
.menu :deep(.el-menu-item) {
  color: var(--side-text); height: 44px; line-height: 44px; border-radius: 8px;
  margin-bottom: 4px; font-size: 14px;
}
.menu :deep(.el-sub-menu__title) {
  color: var(--side-text); height: 44px; line-height: 44px; border-radius: 8px;
  margin-bottom: 4px; font-size: 14px;
}
.menu :deep(.el-menu-item:hover) { background: var(--side-bg-hover); color: #fff; }
.menu :deep(.el-sub-menu__title:hover) { background: var(--side-bg-hover); color: #fff; }
.menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(135deg, var(--brand-1), var(--brand-2));
  color: #fff; font-weight: 600;
}
.menu :deep(.el-menu-item.is-active .el-icon) { color: #fff; }
.menu :deep(.el-sub-menu.is-active > .el-sub-menu__title) { color: #fff; font-weight: 600; }
.menu :deep(.el-sub-menu .el-menu) { background: transparent; }
.menu :deep(.el-sub-menu .el-menu-item) { height: 38px; line-height: 38px; margin-left: 10px; padding-left: 18px !important; font-size: 13px; }
.menu-badge { margin-left: auto; }

/* 顶栏 */
.header { display: flex; align-items: center; justify-content: space-between;
  background: #fff; border-bottom: 1px solid var(--border); height: 60px; padding: 0 24px; }
.crumb { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; color: var(--text-1); }
.crumb-icon { color: var(--brand-1); }
.user { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 8px; border-radius: 8px; }
.user:hover { background: var(--page-bg); }
.user-avatar { background: linear-gradient(135deg, var(--brand-1), var(--brand-2)); color: #fff; }
.user-name { font-size: 14px; color: var(--text-1); font-weight: 500; }
.user-caret { color: var(--text-3); font-size: 12px; }

.main { background: var(--page-bg); padding: 24px; }
:deep(.el-dropdown-menu__item .el-icon) { margin-right: 6px; }
</style>
