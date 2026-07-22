import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './theme.css'
import * as Icons from '@element-plus/icons-vue'
import App from './App.vue'
import Login from './views/Login.vue'
import Dashboard from './views/Dashboard.vue'
import Sources from './views/Sources.vue'
import Vods from './views/Vods.vue'
import Categories from './views/Categories.vue'
import Tasks from './views/Tasks.vue'
import Site from './views/Site.vue'
import Meta from './views/Meta.vue'
import Users from './views/Users.vue'
import Hot from './views/Hot.vue'
import Access from './views/Access.vue'
import HlsClean from './views/HlsClean.vue'
import Playback from './views/Playback.vue'
import Ops from './views/Ops.vue'
import Risk from './views/Risk.vue'
import Interactions from './views/Interactions.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login, meta: { public: true } },
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: Dashboard, meta: { title: '运行概览' } },
    { path: '/sources', component: Sources, meta: { title: '采集源管理' } },
    { path: '/tasks', component: Tasks, meta: { title: '采集任务进度' } },
    { path: '/categories', component: Categories, meta: { title: '分类映射面板' } },
    { path: '/vods', component: Vods, meta: { title: '影片库管理' } },
    { path: '/hot', component: Hot, meta: { title: '热门推荐' } },
    { path: '/hls-clean', component: HlsClean, meta: { title: 'HLS清洗' } },
    { path: '/playback', component: Playback, meta: { title: '播放策略' } },
    { path: '/ops', component: Ops, meta: { title: '质量监控' } },
    { path: '/users', component: Users, meta: { title: '用户管理' } },
    { path: '/risk', component: Risk, meta: { title: '风控中心' } },
    { path: '/interactions', component: Interactions, meta: { title: '互动管理' } },
    { path: '/access', component: Access, meta: { title: '权限访问' } },
    { path: '/meta', component: Meta, meta: { title: '元数据匹配' } },
    { path: '/site', component: Site, meta: { title: '系统设置' } },
  ]
})

// 路由守卫：未登录跳登录页
router.beforeEach((to) => {
  const hasToken = Boolean(localStorage.getItem('token'))
  if (to.meta.public) {
    if (hasToken && to.path === '/login') return to.query.next || '/dashboard'
    return true
  }
  if (!hasToken) return { path: '/login', query: { next: to.fullPath } }
  return true
})

const app = createApp(App)
for (const [k, v] of Object.entries(Icons)) app.component(k, v)
app.use(router).use(ElementPlus).mount('#app')
