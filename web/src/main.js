import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import Play from './views/Play.vue'
import Auth from './views/Auth.vue'
import Profile from './views/Profile.vue'
import Shorts from './views/Shorts.vue'
import MobileShell from './mobile/MobileShell.vue'
import MobileHome from './mobile/MobileHome.vue'
import MobileTheater from './mobile/MobileTheater.vue'
import MobileShorts from './mobile/MobileShorts.vue'
import MobileSearch from './mobile/MobileSearch.vue'
import MobileMe from './mobile/MobileMe.vue'
import MobileDetail from './mobile/MobileDetail.vue'
import MobilePerson from './mobile/MobilePerson.vue'
import MobilePlay from './mobile/MobilePlay.vue'
import X8Home from './x8/X8Home.vue'
import './style.css'

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: (to, from, savedPosition) => savedPosition || { top: 0 },
  routes: [
    { path: '/', component: Home },
    { path: '/play/:id', component: Play },
    { path: '/shorts', component: Shorts },
    { path: '/x8', component: X8Home },
    { path: '/x8/rank', component: X8Home },
    { path: '/x8/show/:type', component: X8Home },
    { path: '/x8/detail/:id', component: X8Home },
    { path: '/x8/play/:id', component: X8Home },
    { path: '/x8/me', component: X8Home },
    { path: '/x8/login', component: X8Home },
    { path: '/auth', component: Auth },
    { path: '/me', component: Profile },
    {
      path: '/m',
      component: MobileShell,
      children: [
        { path: '', component: MobileHome },
        { path: 'theater', component: MobileTheater },
        { path: 'shorts', component: MobileShorts },
        { path: 'search', component: MobileSearch },
        { path: 'me', component: MobileMe },
        { path: 'detail/:id', component: MobileDetail },
        { path: 'person/:id', component: MobilePerson },
        { path: 'play/:id', component: MobilePlay },
      ],
    },
  ]
})

Promise.resolve(window.__VCMS_MOBILE_GATE__)
  .catch(() => {})
  .finally(() => {
    createApp(App).use(router).mount('#app')
  })
