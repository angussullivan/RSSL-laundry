# RSSL Acquisition Survey V2 — live launch record

**Date:** 18 November 2026  
**Public survey:** https://www.reservoirlaundry.com.au/survey/  
**Status:** LIVE; end-to-end database acceptance tests passed; owner update to
private Gmail Apps Script still required for new reporting sections.

## Customer-facing design now active

The RSSL Galaxy Tab A11+ landscape survey retains 11 language tiles, the
business logo, five short tap questions, the English-coded response table,
automatic reset and offline queue.

Everyone answers:
1. First-time or returning visit.
2. How they *originally* discovered RSSL, now including hotel/Airbnb host
   referrals and Apple Maps.
3. Whether they used Google Maps or Search for *today's* visit.

First-time customers (and those who do not specify a history) answer:
4. The principal reason they chose RSSL (location, opening hours, reviews,
   price, card payment, machine availability, recommendation, other).
5. Whether they live/work/study nearby or are staying/visiting in the area.

Returning customers instead answer:
4. How the visit has been.
5. Which operational improvement they would prioritise.

One response per answer, no typing, no name/email/phone/precise address.

## Data model: confirmed in production

An additive migration created five optional columns:
`choice_reason`, `customer_context`, `discovery_detail`,
`survey_language` and `survey_version`. All legacy columns and historical
responses remain intact. V1 queued responses still work.

The existing `discovery_source` code remains `other` for
`host_referral` and `apple_maps`; the new `discovery_detail` column
records the finer distinctions. Never interpret survey language as nationality.

The PostgREST anonymous database role initially lacked table INSERT
permission (HTTP 401 / 42501). The owner applied
[ACQUISITION_V2_ANON_INSERT_FIX.sql](ACQUISITION_V2_ANON_INSERT_FIX.sql),
which grants INSERT only while retaining RLS.

### Independent acceptance evidence

- The read-only schema preflight confirmed all five new columns are present.
- [GitHub live V2 smoke run](https://github.com/angussullivan/RSSL-laundry/actions/runs/44288382607):
  two synthetic branch records inserted using the public publishable key,
  server-read back with correct values, then deleted and confirmed absent.
- [Final privacy and legacy run](https://github.com/angussullivan/RSSL-laundry/actions/runs/44289327189):
  first-time V2, returning V2, and legacy V1 public INSERTs accepted; anonymous
  SELECT returned denied/empty; all three synthetic records deleted.
- [GitHub quality checks](https://github.com/angussullivan/RSSL-laundry/actions/workflows/rssl-quality-checks.yml):
  11 language packs, branching, old queued-client handling, offline retry,
  survey responsiveness and weekly reporting calculations passed.
- The GitHub Pages build for the V2 survey completed successfully.

The smoke tests prove REST insert/readback and security behaviour, not
human review of all translations or visual appearance on the physical tablet.

## One remaining operational task: update private Google Apps Script

**The currently installed Monday ~06:00 Sydney trigger continues to run**.
It was configured earlier by the owner and does not need reinstalling.
However, it runs the source saved in the owner's Google Apps Script editor,
which does **not** update when the GitHub code changes.

The complete enhanced reporting script is:
https://raw.githubusercontent.com/angussullivan/RSSL-laundry/main/scripts/RSSL_Weekly_Email_Apps_Script.gs

The updated source has `RSSL_ACQUISITION_V2_REPORT = true` and sends additional
breakdowns for:
- First-time acquisition channels, separating hotel/Airbnb and Apple Maps.
- Most important first-time purchase-decision reason.
- Nearby resident/worker versus accommodation guest or visitor.
- Survey language selected (not citizenship).
- Six-week benchmark with sample counts.
- Returning V2 customers' satisfaction, **not mixed with V1 all-customer
  satisfaction scores**.

**Owner action:** in https://script.google.com/home open the existing
`RSSL Weekly Customer Insights` project, replace `Code.gs` with the whole
updated source, save, run `sendTestReportNow`, and check the received message.
The original `RSSL_SUPABASE_SECRET_KEY` Script Property remains valid.
Do **not** rerun `installMondaySchedule`; doing so is unnecessary.

Until the owner updates this script, the already-authorised Gmail report
continues its prior metrics and approximately 06:00 Monday schedule.

## Rollback

- If the V2 customer survey malfunctions, change
  `ACQUISITION_V2_ENABLED` to false in `survey/index.html`,
  publish and bump the service worker cache. Do **not** drop migration
  columns or delete V2 responses.
- If enhanced Gmail report malfunctions, set
  `RSSL_ACQUISITION_V2_REPORT` to false in the *private* `Code.gs`
  and rerun `sendTestReportNow`. Leave the Monday trigger in place.
- Never expose `sb_secret_` to the public site.

## Interpret results carefully

- A survey respondent is not necessarily a unique paying machine customer.
- Direction requests are not paid customer conversions.
- Google discovery may be organic or paid; this survey cannot prove ad lift.
- Sample sizes must accompany breakdowns, especially during rollout.
- Six-week volume averages initially include weeks before launch.
- Delayed offline responses may fall in a later submitted-at reporting week;
  the client records `answered_at` for future audit.
