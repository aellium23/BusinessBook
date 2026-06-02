const CACHE = 'bb-v3'

self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(
      ks.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  )
  self.clients.claim()
})

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BusinessBook - Offline</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center}
  .box{padding:2rem}
  h1{font-size:1.5rem;margin-bottom:.5rem;color:#60a5fa}
  p{color:#94a3b8}
</style></head>
<body><div class="box"><h1>You are offline</h1><p>Please check your internet connection and try again.</p></div></body>
</html>`

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return
  if (e.request.method !== 'GET') return

  // Supabase / API calls — network-only, no caching
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
    return
  }

  // Navigation requests (index.html / SPA routes) — NETWORK-FIRST.
  // This guarantees the freshly deployed HTML (pointing to the latest
  // hashed JS/CSS chunks) is always served, eliminating stale-bundle bugs.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return res
        })
        .catch(() =>
          caches.match(e.request).then(r => r || new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html' }
          }))
        )
    )
    return
  }

  // Hashed static assets (/assets/*-[hash].js|css) are immutable —
  // cache-first is safe because the filename changes on every build.
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.status === 200) {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
      }
      return res
    }))
  )
})
