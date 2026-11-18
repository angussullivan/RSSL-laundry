# RSSL Acquisition Survey V2 — activation checklist
**Prepared:** 18 November 2026  
**Current status:** code staged, GitHub automated tests passing, live V1 collecting responses.

## What is built
- Maintains the 11 native-language tiles and Galaxy Tab A11+ landscape touch UI.
- Keeps the same five-question, single-tap format.
- All customers: visit history, discovery channel (now includes accommodation hosts/hotels and Apple Maps), and Google navigation today.
- First-time customers (or unknown status): why they chose RSSL; whether local resident/worker or staying nearby/visiting.
- Returning customers: original satisfaction and improvement questions remain.
- Translates all new wording and choices across 11 languages with automated language completeness checks.
- Keeps existing `discovery_source` values. For accommodation or Apple Maps,
  `discovery_source='other'` AND `discovery_detail='host_referral'|'apple_maps'`.
  This avoids changing existing column constraints and preserves historical trends.
- New nullable fields only: `choice_reason`, `customer_context`, `discovery_detail`, `survey_language`, `survey_version`. Old responses and offline queue remain compatible.
- Adds first-time channel, choice-driver, local-versus-traveller, and language insights to the weekly Gmail report, with separate n and six-week comparison.
- No free-text, name, contact information, location tracking, advertising IDs, or new external tracking services.

## Verified live database facts
An authenticated, **read-only GitHub Actions** schema preflight on 18 November 2026 confirmed these production columns:
`answered_at, discovery_source, experience, google_today, improvement, submission_id, submitted_at, visit_type`.

**The five new V2 columns have now been added to the live Supabase database.**
The current blocker is missing anonymous INSERT privilege (HTTP 401 / 42501); this is why V2 remains off. The existing V1 customer survey remains live and functional. V2-preview submissions are never stored.

## Database access check after migration — 18 November 2026

The five V2 columns **were confirmed present** in a fresh, read-only Supabase
preflight. A subsequent live integration attempt (browser publishable key,
synthetic record, no personal data) returned:

`HTTP 401 / Postgres 42501: permission denied for table rssl_customer_surveys`

Supabase explicitly asked for `GRANT INSERT ON public.rssl_customer_surveys
TO anon;`. This is a database **table privilege**, separate from the RLS
row policy; the new columns were successfully created.

**Smallest safe fix (user SQL Editor action):**
Run [ACQUISITION_V2_ANON_INSERT_FIX.sql](ACQUISITION_V2_ANON_INSERT_FIX.sql)
in the RSSL Supabase project. It enforces RLS and gives anonymous browser
clients INSERT privilege **only**, never SELECT/UPDATE/DELETE. It also
displays the resulting grants and policies for inspection.

Then rerun the live acceptance test (via GitHub Actions) and verify the
two synthetic inserts, readbacks and deletion succeed. Keep V2 production
disabled until test success. If the next failure is RLS-policy-specific,
inspect the policies before adding or broadening any RLS rule.

**Do not publish the server secret or put it in the tablet.**

## SAFE PREVIEW NOW (no database writes)
https://www.reservoirlaundry.com.au/survey/?preview_v2=1

The first-time and returning flows can be inspected in all 11 languages.
Preview mode clearly says submissions are not saved. The production URL without
the query parameter continues to use the original questionnaire until migration.

## One unavoidable user action: additive Supabase migration
The RSSL project is **not** connected to the database management tools available
in ChatGPT. Only its other Supabase projects are connected, so the database SQL
cannot be executed from the current integration.

1. In your Supabase project open:
   https://supabase.com/dashboard/project/mfsdnfhoifahvlsjzzxf/sql/new
2. Open the migration SQL prepared in your GitHub repository:
   https://github.com/angussullivan/RSSL-laundry/blob/main/survey/ACQUISITION_V2_MIGRATION.sql
3. Copy the SQL, paste into the RSSL SQL Editor, and press Run.
4. Verify the final query returns five new rows for the new columns. Do not
   modify or delete existing records.
5. Tell ChatGPT: **"RSSL migration done"**, so it can verify the schema remotely
   through the read-only preflight and enable the production flag.
   Never paste the `sb_secret_` key here.

The migration is additive and idempotent. It intentionally leaves legacy RLS
policy and checks unchanged. Verify browser INSERTs after the migration
before relying on the new acquisition fields.

## After migration — controlled production activation
A. Change the `survey/index.html` feature gate to
   `const ACQUISITION_V2_ENABLED = true;` (ChatGPT can do this once the
   user confirms the migration; no need to edit this yourself).
B. Test a complete *first-time* survey in one non-English language and verify
   all five new columns are stored correctly in Supabase.
C. Test a complete *returning* survey and verify acquisition-only fields are null.
D. Verify a previously queued V1 response still inserts without the extra fields.
E. Update your **existing** private Google Apps Script editor from the GitHub
   source at:
   https://raw.githubusercontent.com/angussullivan/RSSL-laundry/main/scripts/RSSL_Weekly_Email_Apps_Script.gs
   with `const RSSL_ACQUISITION_V2_REPORT = true;` before copying.
   Your Apps Script does NOT automatically sync from GitHub.
   The `RSSL_SUPABASE_SECRET_KEY` Script Property remains unchanged.
F. Run `sendTestReportNow` and check the received Gmail report; it should now
   include acquisition source, decision reason and traveller breakdown.
G. The existing Monday near-6am trigger **continues working**; do not create
   duplicate triggers or change the schedule.

## Rollback
If the migrated database is healthy but V2 reports or website fail:
- Switch `ACQUISITION_V2_ENABLED` back to false; **do not drop new columns**.
- Switch `RSSL_ACQUISITION_V2_REPORT` back to false in the Apps Script.
- Keep V2 records already collected; they remain compatible with the old
  core fields. Old V1 queued records are still valid.
- Re-run existing GitHub QA before redeploying.

## Relevant tests
- `node survey/test_kiosk.js` — preexisting customer, offline and data integrity.
- `node survey/test_acquisition_v2.js` — 11 languages, conditional routing,
  channel mapping, correct columns, legacy compatibility, and preview no-write.
- `node survey/test_sw.js` — offline service worker and logo caching.
- `node scripts/test_apps_script.js` — Gmail reporting, six-week trend,
  Sydney time zones, 6am trigger, and V2 acquisition breakdowns.
- `python -m unittest discover -s scripts -p 'test_rssl_weekly_report.py'` —
  legacy reporting calculations.

## Careful interpretation
- A response is not a verified unique *paying* customer; voluntary sampling
  introduces selection bias.
- Google Ads directions are not proof of an incremental purchase. Compare
  surveys with actual Paymate transactions, energy use and ad spend.
- Google Maps may be organic or paid; the survey cannot reliably distinguish
  the two. Do not make paid-attribution claims from these answers.
- Language chosen is a preference, not ethnicity or nationality.
- Early six-week averages include weeks before the survey started.
- Weekly reports still group by server `submitted_at`; delayed offline uploads
  may fall into a later week's reporting window. The client also stores
  `answered_at` to permit future auditing of delayed responses.
