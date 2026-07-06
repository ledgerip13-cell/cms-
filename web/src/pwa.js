let waitingWorker = null

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
