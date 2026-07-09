<template>
  <section class="mp">
    <div class="mp-icon">
      <svg viewBox="0 0 24 24" v-html="icon(iconName)"></svg>
    </div>
    <h1>{{ title }}</h1>
    <p>{{ desc }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { icon } from './icons'

const route = useRoute()
const meta = computed(() => {
  if (route.path.includes('/theater')) return { title: '剧场', desc: '下一步完善全站找片、榜单和筛选。', iconName: 'theater' }
  if (route.path.includes('/shorts')) return { title: '刷剧', desc: '下一步接入原刷短剧播放核心，只换移动端 UI。', iconName: 'shorts' }
  return { title: '我的', desc: '个人中心先占位，后续再做历史、追剧和设置。', iconName: 'user' }
})
const title = computed(() => meta.value.title)
const desc = computed(() => meta.value.desc)
const iconName = computed(() => meta.value.iconName)
</script>

<style scoped>
.mp {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 72px) 24px calc(96px + env(safe-area-inset-bottom));
  background: #f7f7f8;
  color: #191a20;
}
.mp-icon {
  width: 58px;
  height: 58px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: #f04438;
  background: #fff;
  box-shadow: 0 10px 28px rgba(17, 24, 39, .08);
}
.mp svg {
  width: 28px;
  height: 28px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mp h1 {
  margin: 22px 0 8px;
  font-size: 24px;
}
.mp p {
  margin: 0;
  color: #737781;
  line-height: 1.7;
}
</style>
