# RSSL Customer Survey — production notes

**Live site:** https://www.reservoirlaundry.com.au/survey/

## Design
- A single self-contained file, `survey/index.html`, contains the customer-facing
  HTML, CSS, JavaScript, public Supabase URL and **publishable** key.
- Do not edit `survey/app.js`, `survey/config.js` or `survey/styles.css`:
  they were retired and removed to avoid having conflicting versions.
- The small `sw.js` service worker enables offline re-opening of the survey after
  the first online visit. The cache is network-first and specific to `/survey/`, plus the shared logo asset.
- `survey/manifest.webmanifest` and `icon.svg` provide installable-app metadata.

## Customer flow
1. Each customer sees the circular business logo and **11 large language tiles**.
   The logo reuses the existing main-site asset `../IMG_7178.jpeg`.
2. Tap a tile to immediately start question 1 in that language:
   English, 简体中文, 繁體中文, 日本語, 한국어, हिन्दी, Bahasa Indonesia,
   Español, Français, Português, Deutsch. No small dropdown is required.
3. Five anonymous questions follow; every question can be skipped.
   A small **Languages** control on question screens returns to language selection,
   clearing unfinished answers rather than mixing responses between customers.
4. The form sends **only English-coded choice values** (e.g. `google_maps`) and
   timestamps to the Supabase `public.rssl_customer_surveys` table.
   Translations never alter the database schema or reporting calculations.
5. A confirmation screen distinguishes server receipt from locally queued data.
6. The next customer starts in English after Finish, or on automatic reset.
   An in-progress form resets after **120 seconds** without interaction;
   the confirmation screen resets after **9 seconds**.

## Galaxy Tab A11+ installation (landscape)

The survey is tuned for the **Samsung Galaxy Tab A11+ Wi-Fi 128GB** in
**landscape** (wide-screen) orientation:
- Four columns of language-selection tiles (11 languages across three rows).
- Three columns of large answer buttons in landscape so even the longest
  question remains compact without tiny tap targets.
- Compressed but readable header/logo and spacing at typical 16:10 tablet
  viewport sizes, including shorter browser viewports.
- Portrait styles remain as a graceful fallback, not the intended kiosk use.
- The web-app manifest now asks for `landscape` when launched as an
  installed standalone web app. Regular browser tabs may ignore this hint.

For a fixed wall-mounted kiosk, rotate the Galaxy tablet to **landscape** and
turn **Auto rotate off** in Android Quick Settings to keep that orientation.
Open https://www.reservoirlaundry.com.au/survey/ in Chrome, or install the
site to the home screen as a standalone web app. If a kiosk app is used,
configure it to open this exact URL, show the page in immersive/full-screen,
and prevent untrusted users from exiting.

Screen readability can vary with Android display zoom, font scaling and
browser toolbar visibility. Test the shortest/longest translated question
on the actual hardware before leaving the kiosk unattended.

## Acquisition Survey V2 — safely staged (not yet active)

On 18 November 2026, we added the complete 11-language acquisition upgrade behind
`const ACQUISITION_V2_ENABLED = false` in `index.html`.

- **Live survey** remains the original five questions and original Supabase payload.
- **Non-saving V2 preview:** https://www.reservoirlaundry.com.au/survey/?preview_v2=1
- **V2 first-timer flow:** initial discovery, Google navigation, decision driver,
  local resident/worker versus traveller.
- **V2 returning-customer flow:** initial discovery, Google navigation,
  original experience and improvement questions.
- **Prepared additive schema migration:** [ACQUISITION_V2_MIGRATION.sql](ACQUISITION_V2_MIGRATION.sql).
- **Deployment steps:** [ACQUISITION_V2_ROLLOUT.md](ACQUISITION_V2_ROLLOUT.md).
- **11-language V2 tests:** `node survey/test_acquisition_v2.js`.
- **Gmail reporting:** New acquisition metrics are staged in
  `scripts/RSSL_Weekly_Email_Apps_Script.gs` behind
  `RSSL_ACQUISITION_V2_REPORT=false`. The private Apps Script does not sync
  automatically from GitHub.

A read-only schema preflight confirmed that the live RSSL database does **not**
yet contain V2 fields. Do not enable either V2 flag until SQL migration, real
insertion test and the updated Apps Script are ready.

## When the internet is down
- A previously loaded survey can reopen via the service-worker cache.
- Finished responses are saved to this tablet's local storage and retried every
  30 seconds while online, or when internet access returns.
- **Do not clear the tablet's browser site data/cache while submissions are pending.**
  Pending entries would be lost.
- The top-right status indicates pending submissions, not a live Supabase health check.
- If a response says *Upload not yet confirmed*, check the tablet internet access.
  No old unsent entries are silently discarded.

## Security
- The public page intentionally contains a `sb_publishable_` key; it does not
  contain a server/admin key or password.
- Supabase Row Level Security should remain INSERT-only for anonymous visitors.
  Confirm the `anon` role cannot SELECT/UPDATE/DELETE customer responses.
- The private `sb_secret_` key and Gmail App Password are stored only as GitHub
  Actions repository secrets, never in the website or code.
- There is no free-text input, analytics tracker, account creation, or request for
  names/contact details. However, this is a public write endpoint, so anonymous
  spamming is theoretically possible; interpret sample sizes with that in mind.

## Continuous testing
The GitHub workflow `RSSL Survey Quality Checks` runs when survey/report code
changes. It uses only built-in Node and Python libraries:
- `node survey/test_kiosk.js` — 11 translation sets; kiosk flow; English data
  codes; offline retries; duplicate and error handling; reset
- `node survey/test_sw.js` — offline boot/cache migration/homepage isolation
- `python -m unittest discover -s scripts -p 'test_rssl_weekly_report.py' -v`
  — 8 tests for reporting calculations, Sydney time boundaries, Supabase auth
  request and mocked Gmail SMTP composition

These tests do **not** prove the live tablet's screen sizing, the actual Supabase
security policies, or Gmail SMTP deliverability. Do a real-device walkthrough
and one live weekly-report send test before relying on the kiosk unattended.

## Weekly email
See [WEEKLY_REPORT_SETUP.md](WEEKLY_REPORT_SETUP.md).
The report is generated by GitHub Actions every Monday at 9:17am Sydney time.
A successful dry run only proves data retrieval and report generation. A
`dry_run=false` workflow_dispatch is needed to verify actual Gmail delivery.

**Long-term GitHub limitation:** scheduled workflows in public GitHub repositories
are automatically disabled after 60 days without repository activity. This
repository is public. Monitor the weekly workflow, or move report scheduling
to an alternative scheduler for durable unattended operation. GitHub also
warns that scheduled jobs can occasionally be delayed/skipped under high load.
