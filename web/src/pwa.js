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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (registration.waiting) {
        waitingWorker = registration.waiting
        onUpdate?.()
      }
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = worker
            onUpdate?.()
          }
        })
      })
    }).catch(() => {})
  })
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
}

export function applyPwaUpdate() {
  if (!waitingWorker) return false
  waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  return true
}
