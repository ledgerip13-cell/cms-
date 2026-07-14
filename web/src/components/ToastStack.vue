<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite">
      <TransitionGroup name="toast">
        <button v-for="item in toasts" :key="item.id" class="toast-item" :class="item.type" @click="dismissToast(item.id)">
          <span class="toast-icon" aria-hidden="true">
            <svg v-if="item.type === 'success'" viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>
            <svg v-else-if="item.type === 'error'" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>
            <svg v-else-if="item.type === 'warning'" viewBox="0 0 24 24"><path d="M12 8v5M12 17h.01"/><path d="M10.3 4.3 2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.7 4.3a2 2 0 0 0-3.4 0z"/></svg>
            <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>
          </span>
          <span class="toast-text">{{ item.message }}</span>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { dismissToast, toasts } from '../feedback'
</script>

<style scoped>
.toast-stack { position: fixed; top: 18px; right: 18px; z-index: 240; display: flex; flex-direction: column; gap: 10px;
  width: min(360px, calc(100vw - 28px)); pointer-events: none; }
.toast-item { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: start; min-height: 44px;
  padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(18,20,27,.94);
  color: var(--text); box-shadow: 0 14px 42px rgba(0,0,0,.48); backdrop-filter: blur(14px); text-align: left;
  cursor: pointer; pointer-events: auto; }
.toast-icon { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; }
.toast-icon svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.toast-text { min-width: 0; font-size: 13px; line-height: 1.55; font-weight: var(--small-text-max-weight); overflow-wrap: anywhere; }
.toast-item.success .toast-icon { color: #5be0a5; }
.toast-item.error .toast-icon { color: #ff7a88; }
.toast-item.warning .toast-icon { color: #ffd166; }
.toast-item.info .toast-icon { color: var(--accent); }
.toast-enter-active, .toast-leave-active { transition: opacity .18s, transform .18s; will-change: transform, opacity; backface-visibility: hidden; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate3d(0, -8px, 0); }
@media (max-width: 640px) {
  .toast-stack { top: calc(10px + env(safe-area-inset-top)); right: 10px; left: 10px; width: auto; }
}
</style>
