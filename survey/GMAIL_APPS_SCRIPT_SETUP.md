# RSSL Weekly Customer Insights: Gmail-based automation

## Current status
The Supabase database read and report calculations passed in a real GitHub
Actions run. However, the GitHub runner's direct Gmail SMTP connections were
disconnected on both ports 465 and 587. The old GitHub email schedule is
therefore being retired. The replacement below runs in **Google Apps Script**
using **Google MailApp**; it requires a one-time authorisation by the Gmail
account owner.

**No Gmail App Password or SMTP port is used in this replacement.**

## Install the replacement (once)

1. While signed into **angussullivan@gmail.com**, open
   <https://script.google.com/home/projects/create>. Create a project named
   `RSSL Weekly Customer Insights`.
2. Replace everything in `Code.gs` with the complete source from:
   <https://raw.githubusercontent.com/angussullivan/RSSL-laundry/main/scripts/rssl_weekly_report.gs>
   Save (Ctrl+S or the Save icon). The public source contains no secret keys.
3. Click the **gear icon (Project Settings)** on the left. Under **Script
   properties** select **Add script property**. Add:
   - `RSSL_REPORT_TO` = `angussullivan@gmail.com`
   - `RSSL_SUPABASE_SECRET_KEY` = the modern `sb_secret_...` value copied from
     the **RSSL Customer Survey** Supabase project's Settings > API Keys >
     Secret keys. **Never** paste this key in GitHub public source or a chat.
   Save the script properties.
4. Return to the **Editor**. In the function selector at the top,
   choose `sendTestReport`, then click **Run**. Google will request
   authorisation for the script to send emails and access the Supabase API.
   Review the permissions and approve only if you trust the copied source.
   This run should produce an email with **[LIVE TEST]** in the subject,
   for the **current Monday-to-today reporting period**. That avoids
   receiving a misleading empty report from before the survey was launched.
5. Check the Gmail Inbox and **Sent** folder for:
   `RSSL | Weekly Customer Insights — ... [LIVE TEST]`.
   If there is an error, open **Executions** in Apps Script to review it.
6. After confirming the test email, choose the function
   `installWeeklyTrigger` and click **Run** once. This safely replaces any
   pre-existing trigger for `sendWeeklyReport`.
   It creates an installable Monday morning trigger in the
   `Australia/Sydney` time zone, nominally **9:15am**.
   Google Apps Script schedules `nearMinute(15)` within a ±15-minute window;
   it **does not guarantee an exact delivery minute**.
7. Optionally, verify the trigger under the clock icon **Triggers** on the
   left; it should show `sendWeeklyReport`, Time-driven, Weekly, Monday.

## How the scheduled email works

- `sendTestReport`: partial **current week**, clearly marked LIVE TEST.
- `sendWeeklyReport`: full **previous Monday–Sunday** (Sydney local dates).
- Reads Supabase server-side via HTTPS using `RSSL_SUPABASE_SECRET_KEY` in
  **Apps Script Properties**, not the kiosk's browser key.
- Sends aggregate first-time/returning customer, Google Maps/Search discovery,
  Google usage today, satisfaction and improvement metrics.
- Differences in customer language selection never affect stored codes;
  the database is still interpreted in English.
- Send permission uses **MailApp**, which can send mail as the signed-in
  account but **cannot read your Gmail inbox**. This is narrower access
  than GmailApp and more resilient than SMTP.
- Customer responses are anonymous. There is no verified paid-ad attribution,
  laundromat revenue or Google Ads spend in this report.

## Security and maintenance

- Keep the Apps Script project private, with no external editor collaborators.
- **Script Properties are accessible to people who can edit the script.** Limit
  project access accordingly.
- The `sb_secret_` key bypasses Supabase row-level security, so treat it as
  a powerful private server credential.
- Do not deploy Apps Script as a public web app. Only the built-in time-driven
  trigger and owner-initiated runs are required.
- Once the new setup works, **delete** the now-unused
  `RSSL_GMAIL_APP_PASSWORD` from GitHub Actions Secrets and revoke that
  Google App Password at <https://myaccount.google.com/apppasswords>.
  The reporting script's Supabase secret can also be removed from GitHub
  if GitHub reporting previews are no longer needed.
- To stop the schedule, run `removeWeeklyTrigger` or delete it from Triggers.

## Troubleshooting

- `Missing RSSL_SUPABASE_SECRET_KEY`: check Project Settings > Script properties
  for exact spelling and ensure you pasted the RSSL project's **Secret key**,
  not a publishable key.
- HTTP 401/403: Supabase key is incorrect or access was revoked; replace the
  Apps Script property with a new server-side key.
- Gmail authorisation warning: only authorise from the Gmail account that
  should send the report; this is a private, owner-controlled script.
- If the test shows no customer records, verify the reporting date and the
  table in Supabase. Historical weeks predating installation may be empty.
- If no Monday email appears, check Apps Script > **Executions** and **Triggers**;
  Google can delay a time-driven trigger.
