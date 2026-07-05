<template>
  <div class="page auth-redirect"></div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { openAuthDialog, safeAuthRedirect } from '../authDialog'

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  openAuthDialog({
    mode: route.query.mode === 'register' ? 'register' : 'login',
    redirect: safeAuthRedirect(route.query.redirect, ''),
  })
  await router.replace('/')
})
</script>
