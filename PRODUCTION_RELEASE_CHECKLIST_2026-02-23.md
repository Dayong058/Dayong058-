# Production Release Checklist (2026-02-23)

## Scope
- Main fixes included in `public/fangz.js`:
  - Used-items entry should not be redirected to housing.
  - Hotel fallback route should use `/hotel.html`.
- Cache busting:
  - `public/index.html` now references:
    - `/fangz.js?v=20260223-home-entry-fix-1`

## 1) Deploy Files
- Upload these files to production root:
  - `public/fangz.js`
  - `public/index.html`

## 2) Nginx CORS Fix (qq subdomain)
- Problem:
  - Frontend on `https://fangz9999.vip` calls `https://qq.fangz9999.vip/api/home/stores`.
  - Current response misses `Access-Control-Allow-Origin`.

- In `qq.fangz9999.vip` nginx server block, add:

```nginx
location = /api/home/stores {
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "https://fangz9999.vip" always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With" always;
        add_header Access-Control-Max-Age 86400 always;
        add_header Content-Length 0;
        add_header Content-Type text/plain;
        return 204;
    }

    add_header Access-Control-Allow-Origin "https://fangz9999.vip" always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With" always;
    add_header Vary "Origin" always;

    proxy_pass http://127.0.0.1:3000;
}
```

- If your qq site is static-only and does not proxy this API, route it to the real API upstream in `proxy_pass`.

## 3) Reload Nginx
- Validate and reload:

```bash
nginx -t
nginx -s reload
```

## 4) Verify (must pass)
- JS version check:

```bash
curl -s https://fangz9999.vip/ | grep -o "fangz.js?v=[^\"]*"
```

Expected:
- `fangz.js?v=20260223-home-entry-fix-1`

- CORS header check:

```bash
curl -I "https://qq.fangz9999.vip/api/home/stores" -H "Origin: https://fangz9999.vip"
```

Expected response headers include:
- `Access-Control-Allow-Origin: https://fangz9999.vip`

- Browser checks on `https://fangz9999.vip`:
  - Click `二手物品` -> should go to `.../apps/takeout/entry.html?tab=used` (or your intended used-market URL), not forced housing redirect.
  - Click `酒店预订` -> should enter hotel flow without `/public/hotel.html` fallback dependency.
  - DevTools console should no longer show CORS errors for `/api/home/stores`.

## 5) Rollback
- Roll back to previous static files:
  - `public/fangz.js`
  - `public/index.html`
- Revert nginx change for `qq.fangz9999.vip`, then:

```bash
nginx -t
nginx -s reload
```
