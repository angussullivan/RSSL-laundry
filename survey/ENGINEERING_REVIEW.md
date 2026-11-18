# RSSL Customer Survey: engineering and QA review

**Review:** 18 November 2026  
**Repository:** `angussullivan/RSSL-laundry`  
**Live site:** https://www.reservoirlaundry.com.au/survey/  
**Test evidence:** GitHub Actions workflow `RSSL Survey Quality Checks`.

## Architecture and scope

- GitHub Pages hosts a self-contained static survey at `survey/index.html`.
- The kiosk has no build system, JavaScript framework or third-party
  browser packages. There is no server to maintain for the public web page.
- The page sends one anonymous, UUID-keyed response to Supabase through the
  publishable REST API key; the database schema and English choice codes are
  unchanged.
- A small service worker caches the survey shell (network first), enabling
  offline reopening after an initial online visit.
- Pending responses are preserved locally until the server confirms receipt,
  and are retried on reconnection and at a 30-second interval.
- A separate GitHub Actions workflow reads aggregated responses from Supabase
  using a private GitHub Secret and sends the report from the owner's Gmail
  address. It is configured for Mondays 09:17 Australia/Sydney.

## Changes made in this review

| Severity | Finding | Resolution |
| --- | --- | --- |
| High | Two copies of application logic (inline and external), creating a risk that edits would not reach the live page | Retained self-contained `index.html`; removed unused `app.js`, `styles.css`, and `config.js` |
| High | Old offline queue discarded all but the newest 250 unsent responses silently | Removed truncation; storage failure is now shown rather than discarding data |
| High | Any HTTP 409 was previously treated as a successful upload | Only actual duplicate-key conflicts are treated as idempotent receipts; other conflicts remain queued |
| Medium | The live survey only supported English | Added 11 language packs for every question, choice and customer-facing message |
| Medium | Changes of language could complicate state between customers | Changing language preserves the current question; completing or timing out resets to English |
| Medium | An entirely skipped questionnaire created an empty database row | No insert occurs if all answers are skipped |
| Medium | Earlier offline mode was disabled to avoid stale JavaScript | Replaced with a versioned, network-first cache of the single HTML page |
| Medium | Old cache deletion could affect other applications sharing the origin | Restrict cache cleanup to survey-owned cache names |
| Medium | 75 seconds could reset a survey too quickly for translation users | Extended inactivity reset to 120 seconds |
| Medium | GitHub Actions emitted Node 20 deprecation warnings | Updated to checkout v6 and setup-python v6 |
| Medium | No reproducible quality gate existed | Added dependency-free Node and Python regression tests and CI workflow |
| Low | Connectivity badge said Online, despite no active server health probe | Uses less assertive Ready status, with pending and retry indicators |

## Automated test matrix

**Kiosk logic** (`node survey/test_kiosk.js`):
- JavaScript compilation and completeness of 11 language packs.
- Localized welcome screen and question rendering.
- English-coded payload values independent of selected language.
- Successful insert acknowledgement and queue removal.
- Automatic reset to English for the next customer.
- Offline queue/reconnection upload.
- Distinguishes genuine duplicate-key HTTP 409 from a different conflict.
- All-skipped survey does not insert a row.

**Service worker** (`node survey/test_sw.js`):
- Install and cache of the kiosk entry document.
- Removal of old survey caches but not unrelated caches.
- Online navigation refreshes the cached document.
- Offline navigation recovers the cached document.
- Requests outside the survey scope are ignored.

**Weekly reporting** (`python -m unittest discover -s scripts -p 'test_rssl_weekly_report.py' -v`):
- Eight tests of Sydney daylight-saving offsets, response denominators,
  first-time versus returning Google discovery, improvement counts,
  generated email content, empty weeks, server-only API-key headers,
  and mocked Gmail SMTP message construction.

**Independent verification:** GitHub Actions `RSSL Survey Quality Checks` has
passed after the changes, and GitHub Pages deployments have been successful.

## Security and privacy assessment

- No names, email addresses, phone numbers or free-text fields are collected.
- The public website includes **only** the Supabase `sb_publishable_` key.
- The `sb_secret_` key and the Gmail App Password are not in the public source
  code; they are provided to the scheduled job from GitHub Actions Secrets.
- Source text is rendered through DOM `textContent`, not user-controlled HTML.
- **Not independently verified:** the live Supabase RLS/grants, because this
  particular new project is not accessible through the connected Supabase
  management account. The user previously confirmed a successful write.
- **Residual risk:** the public anonymous INSERT endpoint is inherently
  exposed to intentional fake submissions. We did not add CAPTCHA or an
  intermediary backend because that would complicate the low-friction kiosk.

## Operational acceptance items that are still outstanding

1. **Updated tablet UI / visual confirmation:** On the actual Samsung device,
   open the latest live URL, use the language selector and complete a
   non-English survey. Confirm the response appears in Supabase with the
   original English-coded values. Check both portrait and landscape if used.
2. **Live Gmail delivery:** The user's earlier green report workflow was a
   `dry_run=true` test, not an SMTP send. Trigger
   `RSSL Weekly Customer Insights Email` with `dry_run=false`, then
   verify the message was received. The automated Python tests mock Gmail,
   so cannot prove Google's login/delivery.
3. **Delete setup test data:** Remove the owner's earlier test response
   from the Supabase table before interpreting customer analytics.
4. **Confirm RLS:** Verify anonymous users have INSERT only, not
   SELECT/UPDATE/DELETE, and the server secret stays out of public source.
5. **GitHub scheduling risk:** GitHub's official documentation states that
   scheduled workflows in public repositories are automatically disabled
   after **60 days without repository activity**, and scheduled runs can
   be delayed by load. This is a genuine unattended-reliability limitation.
   For long-term guaranteed scheduling, use an independent trigger or
   a dedicated non-public scheduling repository; do not rely on this public
   repository's cron indefinitely without monitoring.
6. **Human translation review:** Translation sets are complete and tested for
   structure, but have not been proofread by native speakers of every language.
7. **Revenue attribution:** The email summarises survey answers, not actual
   paid-ad attribution, revenue, Google Ads spend or causal lift. Adding
   those sources would be a separate, validated data integration.

## Overall assessment

The kiosk's **codebase is simple, tested and materially more resilient**
than the prior version. Its functionality and automated regression suite
have passed, but **full production acceptance remains conditional** on
the non-English physical-tablet test, the live Gmail email send, and
management of GitHub's public-repository 60-day schedule limitation.
