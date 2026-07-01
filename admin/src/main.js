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

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login, meta: { public: true } },
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: Dashboard, meta: { title: '概览' } },
    { path: '/sources', component: Sources, meta: { title: '采集源管理' } },
    { path: '/tasks', component: Tasks, meta: { title: '采集任务' } },
    { path: '/categories', component: Categories, meta: { title: '分类映射' } },
    { path: '/vods', component: Vods, meta: { title: '影片库' } },
    { path: '/meta', component: Meta, meta: { title: '元数据' } },
    { path: '/site', component: Site, meta: { title: '站点设置' } },
  ]
})

// 路由守卫：未登录跳登录页
router.beforeEach((to) => {
  if (to.meta.public) return true
  if (!localStorage.getItem('token')) return '/login'
  return true
})

const app = createApp(App)
for (const [k, v] of Object.entries(Icons)) app.component(k, v)
app.use(router).use(ElementPlus).mount('#app')
