# RSSL weekly customer survey email reporting

This workflow generates a real report from the private Supabase table every
Monday at **9:17am Australia/Sydney** and emails it automatically. It is not
fully operational until the four repository secrets below have been configured.
The current project does not grant anonymous SELECT access; do not weaken its RLS.

## Setup

Go to GitHub repository **Settings > Secrets and variables > Actions >
New repository secret** and create:

- `RSSL_SUPABASE_SERVICE_ROLE_KEY` — the new **RSSL Customer Survey** project's
  Supabase server-side `service_role` key (or a Supabase secret key with adequate
  SELECT permission). Find it in that project's API Keys screen. This key must
  *never* be used in the public kiosk website or committed to source control.
- `RSSL_RESEND_API_KEY` — a Resend API key with sending permission. Create it
  in the Resend dashboard. Never commit it to source control.
- `RSSL_REPORT_TO` — intended recipient's email.
- `RSSL_REPORT_FROM` — e.g. `RSSL Customer Insights <reports@your-verified-domain>`.
  The domain must be verified in the sender's Resend account.

After setting secrets go to repository **Actions > RSSL Weekly Customer Insights
Email > Run workflow**. Leave `dry_run=true` to inspect the report in job logs
without sending, then run with `dry_run=false` for a live delivery test.
Scheduled reports use the last complete Monday–Sunday in Sydney time and
run every Monday at 9:17am local (including daylight-saving changes).

The job uses a server-only authenticated REST request to Supabase with RLS
unchanged, aggregates anonymous response counts and sends through Resend.
It never pushes raw responses to GitHub or to the public website.

**Note:** Delete the owner's setup/test record from the table before the first
report if it is not a genuine customer response. This report DOES NOT
automatically pull laundry machine revenue or Google Ads expenditure; those
require additional connected data sources.

Weekly metrics: response counts, first-time visits, discovery source, Google
usage on visit day, satisfaction, improvement types and previous-week comparisons.
The report also states sampling limitations and avoids treating Google discovery
as proof that an ad produced a paying customer.

GitHub Actions scheduled workflows can be delayed or skipped by GitHub service
load. Monitor the Actions page for delivery failures.
