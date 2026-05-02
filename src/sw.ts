/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import type { WorkboxPlugin } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Tag cache-served responses so Zip.tsx can show the staleness banner.
// This hook only fires when the network fails/times out and SW falls back to cache.
const cacheTagPlugin: WorkboxPlugin = {
  cachedResponseWillBeUsed: async ({ cachedResponse }) => {
    if (!cachedResponse) return cachedResponse
    const headers = new Headers(cachedResponse.headers)
    headers.set('X-Data-Source', 'cache')
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers,
    })
  },
}

registerRoute(
  ({ url }) => url.origin === 'https://api.weather.gov',
  new NetworkFirst({
    cacheName: 'nws-api-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      cacheTagPlugin,
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  }),
)
