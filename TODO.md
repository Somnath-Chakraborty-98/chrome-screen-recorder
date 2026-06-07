# RecordEasy — Next Steps

Last updated: 2026-06-05

## Done

- [x] Supabase schema (`recordeasy_*` tables, plans, waitlist integration)
- [x] Supabase client + auth in extension (login, signup, forgot password)
- [x] Pricing page (plans from DB; checkout placeholder)
- [x] Entitlements service (`get_recordeasy_entitlements`)
- [x] Recording presets, format picker, duration limits, pause/resume
- [x] Meeting Cost Calculator (session save to DB)
- [x] Preview/download page (quality tiers, watermark, custom filename gating)
- [x] Dark/light theme (popup, login, pricing, preview)
- [x] Vercel API scaffold (`api/auth`, `api/billing` stubs)

---

## P0 — Required before launch

### Supabase
- [ ] Confirm `005_rls_and_auth_trigger.sql` has been run in production
- [ ] Verify auth trigger creates `recordeasy_users` on signup
- [ ] Test `apply_recordeasy_early_user_perk` with a real waitlist email
- [ ] Add RLS policy for service role writes to `recordeasy_subscriptions` (via Vercel webhooks only)

### Extension
- [ ] Run `npm run build` and load unpacked extension from `dist/`
- [ ] End-to-end test: guest record → preview → download (watermark)
- [ ] End-to-end test: signup → verify email → sign in → entitlements refresh
- [ ] Fix large recording storage (move from `chrome.storage` data URLs to IndexedDB if files exceed ~10 MB)

### Supabase Auth dashboard
- [ ] Set Site URL (future Vercel domain)
- [ ] Add redirect URLs for password reset / email verification
- [ ] Match email templates to waitlist branding

---

## P1 — Vercel backend + payments

### Deploy
- [ ] Create Vercel project (same repo or monorepo)
- [ ] Set env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_*`, `RAZORPAY_*`
- [ ] Deploy and test `POST /api/auth/complete-signup`
- [ ] Set `VITE_AUTH_REDIRECT_URL` in extension `.env` to Vercel auth callback page

### Stripe (USD)
- [ ] Create Plus / Pro products and prices in Stripe
- [ ] Implement `api/billing/checkout.js` — create Checkout Session
- [ ] Implement `api/billing/webhook.js` — `checkout.session.completed` → upsert `recordeasy_subscriptions`
- [ ] Handle subscription cancelled / expired webhooks

### Razorpay (INR)
- [ ] Create Plus (₹499) / Pro (₹999) plans in Razorpay
- [ ] Implement Razorpay order creation in checkout API
- [ ] Implement Razorpay webhook → update `recordeasy_subscriptions`
- [ ] Currency selector on pricing page (INR vs USD)

### Extension wiring
- [ ] Pricing page “Upgrade” opens Vercel checkout URL
- [ ] After payment, refresh entitlements on popup open
- [ ] Show billing status / renewal date in account bar (optional)

---

## P2 — Accessibility & lint cleanup

- [x] `login.html` — tablist ARIA (`role="tab"`, `aria-selected`, `tabpanel`)
- [x] `popup.html` — `lang="en"` on `<html>`
- [x] `popup.css` — `-webkit-user-select` for Safari
- [ ] `playsinline` on preview video (intentional for Chromium; Firefox warning is safe to ignore)

---

## P2 — Product features

### Settings sync (`recordeasy_settings`)
- [ ] Load user settings on login (theme, default format, preset, hourly rate)
- [ ] Save settings on change (upsert by `user_id` + `setting_key`)
- [ ] Guest fallback: `chrome.storage.local` only

### Meeting Cost Calculator v2
- [ ] Weekly summary view (aggregate `recordeasy_meeting_cost_sessions` by week)
- [ ] Previous sessions list in extension page or popup panel
- [ ] Persist hourly rate default in `recordeasy_settings`

### Download / export improvements
- [ ] True quality re-encode at download (evaluate ffmpeg.wasm vs record-time-only model)
- [ ] MP4 export when source is WebM (transcode or record-native MP4 only)
- [ ] Export progress UX for long watermark burns
- [ ] “Remember save location” via `chrome.downloads` API (Plus/Pro; browser-limited folder control)

### Recording UX
- [ ] Start modal with duration badge + preset summary (optional polish)
- [ ] Countdown warning at 5 min / 1 min before plan limit
- [ ] Auto-save partial recording if share ends unexpectedly

### Preview / polish
- [ ] Account bar on preview page
- [ ] Consistent popup.css with theme tokens (remove hardcoded colors)
- [ ] Error toasts instead of `alert()` for upgrade prompts

---

## P3 — Chrome Web Store + ops

- [ ] Update store listing (name, screenshots, privacy policy URL)
- [ ] Privacy policy covering Supabase auth, recordings (local-only), meeting cost data
- [ ] Extension version bump + changelog per release
- [ ] Error logging (Sentry or Supabase logs) for auth/entitlement failures
- [ ] Manual admin tool: grant Plus/Pro subscription by email (SQL or simple admin page)

---

## P4 — Nice to have

- [ ] Recording history in DB (optional `recordeasy_recordings` table)
- [ ] Cloud backup of recordings (Supabase Storage, Pro only)
- [ ] Team / org plans
- [ ] Localization (Hindi UI strings)
- [ ] Keyboard shortcuts for pause/stop

---

## Manual test matrix

| Scenario | Expected |
|----------|----------|
| Guest, Free | 30 min, WebM, low quality, watermark, auto filename |
| Early user (waitlist) | Free plan + no watermark |
| Plus | 60 min, MP4, medium, no watermark, custom filename, meeting cost |
| Pro | 120 min, high quality, all Plus features |
| MP4 not supported in Chrome | Fallback to WebM + user message |
| Pause / resume | Timer pauses; file is continuous |
| Duration limit | Auto-stop at plan max |
| Meeting cost | Session row in `recordeasy_meeting_cost_sessions` |

---

## Useful commands

```bash
npm run build          # Build extension → dist/
npm run dev            # Vite dev (HTML pages only)

# Load extension: chrome://extensions → Load unpacked → project ROOT folder
# (manifest.json points to dist/src/... built files)
```

## Key files

| Area | Path |
|------|------|
| Migrations | `supabase/migrations/` |
| Auth | `src/infrastructure/auth/` |
| Entitlements | `src/infrastructure/entitlements/` |
| Recording | `src/domain/recording/` |
| Vercel API | `api/` |
| Env template | `.env.example` |
