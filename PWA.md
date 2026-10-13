# PWA Configuration (Serwist)

ClosetAI is configured as a Progressive Web App (PWA) using **Serwist** - optimized for Next.js 16 with Turbopack.

## Installation

Install the required dependencies:

```bash
npm install -D @serwist/turbopack esbuild serwist
```

Then build the project:

```bash
npm run build
npm start
```

## Why Serwist?

Serwist is the recommended solution for Next.js 16 with Turbopack support. Unlike `next-pwa` which was designed for Webpack, Serwist is built specifically for modern Next.js with Turbopack.

## Features

### ✅ Installable
Users can install ClosetAI to their home screen on mobile devices and desktops.

### ✅ Offline Support
The service worker caches:
- Static assets (JS, CSS)
- Images (wardrobe photos)
- API responses (with short TTL)
- Pages (network-first strategy)

### ✅ Automatic Updates
- Service worker checks for updates every 60 minutes
- Shows a banner when new version is available
- Users can update immediately or dismiss and update later
- Updates use `skipWaiting` for fast activation

### ✅ Optimized Caching Strategies

Serwist uses `defaultCache` which includes:

**CacheFirst** (Static Assets)
- JavaScript bundles
- CSS stylesheets
- Fonts and icons
- Best for immutable assets with cache-busting hashes

**NetworkFirst** (Dynamic Content)
- HTML pages
- API responses
- User-specific data
- Falls back to cache if offline

**Offline Fallback**
- Custom offline page at `/~offline`
- Shown when user is offline and page not cached
- Provides helpful message and retry options

## Project Structure

```
src/app/
├── sw.ts                      # Service worker source
├── serwist/[path]/route.ts    # Serwist build handler
└── ~offline/page.tsx          # Offline fallback page

public/
├── sw.js                      # Generated service worker (gitignored)
└── swe-worker-*.js           # Generated worker files (gitignored)
```

## Configuration

### next.config.ts

The PWA is configured with the Serwist wrapper:

```typescript
import { withSerwist } from "@serwist/turbopack";

export default withSerwist({
  // Your Next.js config
});
```

### Service Worker Source (src/app/sw.ts)

The service worker uses Serwist's `defaultCache` and adds an offline fallback:

```typescript
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,              // Activate new SW immediately
  clientsClaim: true,             // Take control of all clients
  navigationPreload: true,        // Speed up navigation requests
  runtimeCaching: defaultCache,   // Smart caching strategies
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});
```

### Serwist Route Handler (src/app/serwist/[path]/route.ts)

This route handler builds the service worker after Next.js generates the pages:

```typescript
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = 
  createSerwistRoute({
    additionalPrecacheEntries: [
      { url: "/~offline", revision },
      { url: "/manifest.json", revision },
    ],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
```

### Cache Storage

Serwist's `defaultCache` handles:
- Static assets with content hashing
- Images with appropriate expiration
- Navigation requests with network priority
- API calls with network-first strategy

## Generated Files

When you build the project, these files are created in `/public`:

```
public/
├── sw.js                 # Main service worker
├── swe-worker-*.js       # Serwist worker files
└── *.js.map              # Source maps
```

⚠️ **These files are gitignored** - they're generated on each build.

## Development Mode

Service worker is **disabled in development mode** by default to avoid caching issues.

To suppress the Turbopack warning in development, add to `.env.local`:

```bash
SERWIST_SUPPRESS_TURBOPACK_WARNING=1
```

To test PWA features during development:
```bash
npm run build
npm start
```

## Update Flow

```
1. User opens PWA
2. Service worker checks for updates
3. If new version found → downloads in background
4. Update banner appears
5. User clicks "Update now"
6. Page refreshes with new version
```

## Testing

### Test Installation

1. Build the project: `npm run build`
2. Start production server: `npm start`
3. Open in browser (must be HTTPS or localhost)
4. Look for install prompt or banner
5. Install to home screen

### Test Updates

1. Make a code change
2. Build again: `npm run build`
3. Restart server: `npm start`
4. Open the PWA (don't refresh yet)
5. Wait ~5 seconds for update check
6. Update banner should appear

### Test Offline Mode

1. Open DevTools → Network tab
2. Check "Offline" checkbox
3. Navigate around the app
4. Cached pages should still work
5. New API calls will show cached data or errors

### Test in DevTools

**Chrome DevTools → Application → Service Workers**
- View service worker status
- Manually unregister
- Update on reload
- Skip waiting
- Simulate offline

**Chrome DevTools → Application → Cache Storage**
- View cached resources
- Clear individual caches
- See cache sizes

## Development

Service worker requires production build. For local testing:

```bash
# Build the project
npm run build

# Start production server
npm start

# Open http://localhost:3000
```

The service worker will be registered and you can test:
- Offline mode
- Update notifications
- Cache behavior
- Install prompts

## Troubleshooting

### Service worker not updating

**Solution:**
1. Chrome DevTools → Application → Service Workers
2. Click "Unregister"
3. Hard refresh (Cmd/Ctrl + Shift + R)
4. Close all tabs
5. Reopen the app

### Old content showing after update

**Cause:** Browser cache separate from service worker cache

**Solution:**
1. Clear browser cache
2. Clear service worker caches
3. Unregister service worker
4. Hard refresh

### Update banner not showing

**Check:**
1. Service worker is registered (DevTools → Application)
2. New version deployed (check sw.js timestamp)
3. Wait 60 seconds (update check interval)
4. Check console for errors

### Offline mode not working

**Check:**
1. Service worker is active (DevTools → Application)
2. Resources are cached (DevTools → Cache Storage)
3. Network patterns match your routes
4. Auth tokens are still valid

## Best Practices

### ✅ DO

- Keep service worker updated with code changes
- Test offline mode before deploying
- Monitor cache sizes
- Clear old caches on version updates
- Use network-first for auth-required pages
- Show update notifications to users

### ❌ DON'T

- Cache auth endpoints (`/api/auth/*`)
- Cache user-specific pages aggressively
- Force reload without user consent
- Cache large files indefinitely
- Rely on offline for critical auth flows

## Security Considerations

### Content Security Policy

Service workers respect CSP headers. Our CSP allows:
- `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (for Next.js)
- `connect-src 'self' https:` (for API calls)

### Authentication

- Auth tokens stored in HTTP-only cookies (not cached)
- Session validation happens server-side
- Offline mode serves cached UI only
- New auth requests require network connection

### Private Content

- Wardrobe photos use signed URLs (short-lived)
- User data cached with short TTL (5-10 minutes)
- Cache cleared on sign out
- No sensitive data persisted indefinitely

## Monitoring

### Metrics to Track

- Install rate (how many users install PWA)
- Update acceptance rate (how many click "Update now")
- Offline usage (analytics events while offline)
- Cache hit rate (how often cache is used)
- Service worker errors (console/logging)

### Analytics Events

Consider tracking:
```typescript
// PWA installed
analytics.track('pwa_installed');

// Update available
analytics.track('pwa_update_available');

// Update accepted
analytics.track('pwa_update_accepted');

// Offline mode detected
analytics.track('pwa_offline_mode');
```

## Resources

- [Serwist documentation](https://serwist.pages.dev/)
- [Serwist Turbopack guide](https://serwist.pages.dev/docs/next/turbopack)
- [PWA best practices](https://web.dev/pwa-checklist/)
- [Service Worker lifecycle](https://web.dev/service-worker-lifecycle/)

## Support

For issues with PWA functionality:
1. Check browser DevTools console for errors
2. Verify service worker is registered and active
3. Check cache storage in DevTools
4. Test in incognito mode (clean state)
5. Review server logs for service worker requests
