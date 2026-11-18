# RSSL Weekly Customer Insights — operational setup

**Email status:** The survey data and report calculations have been verified.
GitHub's Gmail SMTP delivery failed with `SMTPServerDisconnected` on both
465 and 587, so the scheduled GitHub email workflow has been disabled.
The **replacement is Google Apps Script**, which emails from
**angussullivan@gmail.com** using Google's Mail service, without SMTP.

## Activate and test

Follow the maintained step-by-step guide:

[Set up Google Apps Script and send a test email](GMAIL_APPS_SCRIPT_SETUP.md).

Source file (public code, no secret):
[`scripts/RSSL_Weekly_Email_Apps_Script.gs`](../scripts/RSSL_Weekly_Email_Apps_Script.gs)

Until the owner creates and authorises the Apps Script project, **no weekly
automated email is active**. The user can still run the
`RSSL Customer Insights — Manual Database Preview` GitHub workflow for
a read-only dry-run report, but it will not send email.

## Summary of the report

- Total weekly survey responses, this week versus prior week.
- First-time customers and new visitors who originally discovered RSSL
  through Google Maps or Search.
- Returning visitors who originally discovered RSSL through Google.
- Walking past, personal recommendation and Google use today.
- Good/Excellent customer satisfaction and customer improvement requests.
- Clear caveats that self-reported Google discovery is **not** proof of a
  paid ad producing an incremental paying customer.

Reports use Sydney-local Monday–Sunday calendar boundaries. The installable
Google trigger runs Monday mornings, usually near **9:15am Sydney time**,
with Google's permitted time variance.

## Security

- The kiosk's browser contains only the public Supabase **publishable** key.
- Google Apps Script stores the private Supabase `sb_secret_...` key in
  **Script Properties**. Do not paste it into the script file or public GitHub.
- The MailApp authorisation permits outgoing email, not mailbox reading.
- Only the Gmail account owner should edit or authorise the Apps Script.
- After the test email succeeds, remove the redundant Gmail App Password
  previously created for the unsuccessful GitHub SMTP experiment.
