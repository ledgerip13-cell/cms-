let waitingWorker = null
const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'

export function enforcePwaViewportLock() {
  let tag = document.querySelector('meta[name="viewport"]')
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = 'viewport'
    document.head.appendChild(tag)
  }
  if (tag.getAttribute('content') !== LOCKED_VIEWPORT) tag.setAttribute('content', LOCKED_VIEWPORT)
}

function preventBrowserZoom(event) {
  event.preventDefault()
}

function preventMultiTouchZoom(event) {
  if (event.touches?.length > 1) event.preventDefault()
}

function activateWaitingWorker(worker) {
  if (!worker) return false
  waitingWorker = worker
  worker.postMessage({ type: 'SKIP_WAITING' })
  return true
}

function markUpdateReady(worker, onUpdate) {
  if (!worker) return false
  waitingWorker = worker
  onUpdate?.()
  return true
}

export function setupPwaViewportLock() {
  enforcePwaViewportLock()
  window.addEventListener('pageshow', enforcePwaViewportLock)
  window.addEventListener('focus', enforcePwaViewportLock)
  window.addEventListener('resize', enforcePwaViewportLock)
  window.addEventListener('orientationchange', enforcePwaViewportLock)
  document.addEventListener('visibilitychange', enforcePwaViewportLock)
  document.addEventListener('gesturestart', preventBrowserZoom, { passive: false })
  document.addEventListener('gesturechange', preventBrowserZoom, { passive: false })
  document.addEventListener('gestureend', preventBrowserZoom, { passive: false })
  document.addEventListener('touchmove', preventMultiTouchZoom, { passive: false })
}

export function setupPwaUpdates(onUpdate) {
  if (!('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      const checkForUpdate = () => registration.update().catch(() => {})
      if (registration.waiting) markUpdateReady(registration.waiting, onUpdate)
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            markUpdateReady(worker, onUpdate)
          }
        })
      })
      checkForUpdate()
      window.addEventListener('focus', checkForUpdate)
      window.addEventListener('pageshow', checkForUpdate)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
    }).catch(() => {})
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
}

export function applyPwaUpdate() {
  return activateWaitingWorker(waitingWorker)
}
