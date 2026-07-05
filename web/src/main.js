import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import Play from './views/Play.vue'
import Auth from './views/Auth.vue'
import Profile from './views/Profile.vue'
import Shorts from './views/Shorts.vue'
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
  ]
})
createApp(App).use(router).mount('#app')
