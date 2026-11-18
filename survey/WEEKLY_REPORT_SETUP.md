# RSSL weekly customer survey email reporting

This workflow runs **Mondays at 9:17am Australia/Sydney** and sends the report
**from the Gmail account of the recipient**, currently angussullivan@gmail.com,
using Gmail SMTP. GitHub hosts the RSSL website, while the automation reads
survey responses from the separate Supabase database. The automated email
is NOT active until the necessary private credentials are saved in GitHub
Actions Secrets and a live workflow test succeeds.

## Set up the two remaining GitHub Actions Secrets

In the existing repository go to **Settings > Secrets and variables > Actions
> New repository secret**.

1. **`RSSL_REPORT_TO`** — the sender and recipient Gmail address.
   This has already been configured.
2. **`RSSL_GMAIL_APP_PASSWORD`** — create at
   <https://myaccount.google.com/apppasswords> while logged in to the
   `RSSL_REPORT_TO` Gmail account. The account must have 2-Step
   Verification enabled and be eligible for app passwords. Give the password
   a name such as "RSSL Weekly Survey". Copy the generated 16-character
   app password and paste it **only into the GitHub secret value**.
   Do **not** enter the ordinary Google password. Do not paste the
   app password into ChatGPT or any publicly hosted code.
3. **`RSSL_SUPABASE_SERVICE_ROLE_KEY`** — obtain the new RSSL Customer Survey
   project's `service_role` key in Supabase Settings > API Keys
   (or an equivalent server-side key with SELECT permissions).
   Store it only as the GitHub Actions secret, never in this public repository
   or the survey website. The browser's publishable key cannot read data
   because customer data is protected by RLS.

**No Resend API key, Resend email address, or `RSSL_REPORT_FROM` secret
is required**. Gmail SMTP sends the report as
`RSSL Customer Insights <angussullivan@gmail.com>`.

## Test before trusting the weekly schedule

Go to **Actions > RSSL Weekly Customer Insights Email > Run workflow**.
Leave `dry_run=true` for a report preview (no email).
Then rerun with `dry_run=false` and check Gmail inbox/Sent to verify delivery.

Weekly reports compare previous complete Monday–Sunday (Sydney dates)
against the week before. Metrics include total responses; first-time versus
returning customer shares; first discovery via Google Maps, Google Search,
walking past, recommendations; Google use on visit day; satisfaction; and
top requested improvements. It distinguishes new visitors' Google discovery
from repeat visitors' Google discovery.

The script logs only aggregated values, not individual survey responses.
No raw customer records are committed to GitHub.

Customer survey participation is voluntary and may not represent all paying
customers; self-reported Google discovery is not proof that advertising
caused a purchase. This report does not currently include verified machine
revenue or Google Ads expenditure.

## Security and reliability

Google says app passwords are less secure than Google's OAuth sign-in and
are not available on all accounts. Keep GitHub repository access limited to
trusted administrators. You can revoke the app password at any time in
Google Account security settings. If the regular Google account password
changes, the app password may be revoked, and you must update the
GitHub secret.

GitHub scheduled workflows can occasionally be delayed or skipped during
GitHub service load. Check the Actions page for failures. This setup is a
GitHub scheduled workflow, not a ChatGPT automation.
