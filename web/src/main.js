import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import Play from './views/Play.vue'
import './style.css'

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: Home },
    { path: '/play/:id', component: Play },
  ]
})
createApp(App).use(router).mount('#app')
