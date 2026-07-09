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
import './style.css'

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: Home },
    { path: '/play/:id', component: Play },
    { path: '/shorts', component: Shorts },
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
      ],
    },
  ]
})
createApp(App).use(router).mount('#app')
