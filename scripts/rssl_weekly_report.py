#!/usr/bin/env python3
"""Weekly anonymous RSSL customer survey report.

Server-side GitHub Actions only. Requires secrets set in repository Actions.
No customer records are written to GitHub, logs, or public Pages.
"""
import collections
import datetime as dt
import html
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

SYDNEY = ZoneInfo("Australia/Sydney")
URL = "https://mfsdnfhoifahvlsjzzxf.supabase.co"
TABLE = "rssl_customer_surveys"
TO_KEY = "RSSL_REPORT_TO"
FROM_KEY = "RSSL_REPORT_FROM"
API_KEY = "SUPABASE_SERVICE_ROLE_KEY"
MAIL_KEY = "RESEND_API_KEY"
DISPLAY = {
    "google_maps": "Google Maps",
    "google_search": "Google Search",
    "walk_by": "Walking past",
    "recommendation": "Friend / family",
    "other": "Other",
    "unsure": "Can't remember",
    "maps": "Google Maps",
    "search": "Google Search",
    "both": "Both",
    "no": "No",
    "first": "First visit",
    "repeat": "Returning",
    "excellent": "Excellent",
    "good": "Good",
    "needs_work": "Could be better",
    "not_finished": "Not finished",
    "nothing": "Nothing",
    "machines": "Machine availability",
    "cleanliness": "Cleanliness",
    "prices": "Pricing",
    "payment": "Card payment",
    "instructions": "Instructions/signage",
}
SOURCE = ["google_maps", "google_search", "walk_by", "recommendation", "other", "unsure"]
IMPROVEMENT = ["machines", "cleanliness", "prices", "payment", "instructions", "other", "nothing"]


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError("Missing GitHub Actions secret: " + name)
    return value


def week_windows():
    today = dt.datetime.now(SYDNEY).date()
    current_monday = today - dt.timedelta(days=today.weekday())
    recent_start = current_monday - dt.timedelta(days=7)
    older_start = recent_start - dt.timedelta(days=7)
    return (recent_start, current_monday), (older_start, recent_start)


def as_utc_iso(date):
    local = dt.datetime.combine(date, dt.time.min, SYDNEY)
    return local.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def read_week(start, end, key):
    params = urllib.parse.urlencode({
        "select": "submission_id,submitted_at,visit_type,discovery_source,google_today,experience,improvement",
        "submitted_at": "gte." + as_utc_iso(start),
        "order": "submitted_at.asc",
        "limit": "1000",
    })
    # Add the upper bound as a second filter for the same column.
    upper = urllib.parse.urlencode({"submitted_at": "lt." + as_utc_iso(end)})
    endpoint = URL + "/rest/v1/" + TABLE + "?" + params + "&" + upper
    req = urllib.request.Request(endpoint, headers={
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            rows = json.load(res)
    except urllib.error.HTTPError as e:
        raise RuntimeError("Supabase query failed with HTTP " + str(e.code)) from e
    if not isinstance(rows, list):
        raise RuntimeError("Unexpected Supabase response shape")
    if len(rows) >= 1000:
        raise RuntimeError("1000-response limit reached; update the report to paginate rather than omit data")
    return rows


def valid(rows, field):
    return [row[field] for row in rows if row.get(field) not in (None, "")]


def percent(n, d):
    return "—" if d == 0 else "{:.0f}%".format(100 * n / d)


def measure(rows, field, values):
    answered = valid(rows, field)
    return sum(value in values for value in answered), len(answered)


def metric(rows, field, values):
    n, d = measure(rows, field, values)
    return (str(n) + " / " + str(d) + " (" + percent(n, d) + ")") if d else "No answers"


def source_stats(rows):
    answered = valid(rows, "discovery_source")
    c = collections.Counter(answered)
    return [(DISPLAY[v], c[v], percent(c[v], len(answered))) for v in SOURCE if c[v]]


def issue_summary(rows):
    answered = [v for v in valid(rows, "improvement") if v != "nothing"]
    counter = collections.Counter(answered)
    return [(DISPLAY[k], v) for k, v in counter.most_common(3)]


def conclusion(rows):
    n = len(rows)
    if n == 0:
        return "No completed customer surveys were recorded in this period. Check that the tablet is powered and the survey is accessible."
    issues = issue_summary(rows)
    if n < 15:
        return "Collect more responses before changing advertising or operations: this week's sample is too small for strong conclusions."
    if issues and issues[0][1] >= max(3, int(n * 0.15)):
        return "Review " + issues[0][0].lower() + ": it was the most frequently selected improvement this week."
    return "Maintain current settings and continue measuring new-customer discovery and actual transaction revenue."


def make_message(recent, older, start, end):
    label = start.strftime("%d %b") + " – " + (end - dt.timedelta(days=1)).strftime("%d %b %Y")
    rows = [
        ("Surveys received", str(len(recent)), str(len(older))),
        ("First-time visits", metric(recent, "visit_type", {"first"}), metric(older, "visit_type", {"first"})),
        ("First heard via Google Maps", metric(recent, "discovery_source", {"google_maps"}), metric(older, "discovery_source", {"google_maps"})),
        ("First heard via Google Search", metric(recent, "discovery_source", {"google_search"}), metric(older, "discovery_source", {"google_search"})),
        ("First heard by walking past", metric(recent, "discovery_source", {"walk_by"}), metric(older, "discovery_source", {"walk_by"})),
        ("First heard by recommendation", metric(recent, "discovery_source", {"recommendation"}), metric(older, "discovery_source", {"recommendation"})),
        ("Used Google today (Maps/Search/both)", metric(recent, "google_today", {"maps", "search", "both"}), metric(older, "google_today", {"maps", "search", "both"})),
        ("Good or Excellent experience", metric(recent, "experience", {"good", "excellent"}), metric(older, "experience", {"good", "excellent"})),
    ]
    issues = issue_summary(recent)
    issues_text = (", ".join(name + " (" + str(count) + ")" for name, count in issues) if issues else "No improvement issues selected")
    source_text = (", ".join(name + " " + str(count) + " (" + share + ")" for name, count, share in source_stats(recent))
                   if source_stats(recent) else "No discovery sources recorded")
    insight = conclusion(recent)
    caution = ("These figures are from voluntary in-store survey respondents, not all paying customers. "
               "Google Maps/Search discovery does not prove a paid ad caused a visit. "
               "No revenue or Google Ads spend figures are available to this reporting job.")
    if len(recent) < 20:
        caution = "Small sample (" + str(len(recent)) + " responses); treat movements cautiously. " + caution
    esc = html.escape
    trs = "".join("<tr><td style='padding:9px;border-bottom:1px solid #ddd'>" + esc(a) +
                  "</td><td style='padding:9px;border-bottom:1px solid #ddd'>" + esc(b) +
                  "</td><td style='padding:9px;border-bottom:1px solid #ddd'>" + esc(c) + "</td></tr>"
                  for a, b, c in rows)
    html_body = ("<div style='font-family:Arial,sans-serif;max-width:720px;color:#193332'>"
                 "<h2 style='color:#0b3939'>Reservoir Street Laundry</h2>"
                 "<h1>Weekly Customer Insights</h1><p><b>" + esc(label) + "</b></p>"
                 "<p><b>Executive summary:</b> " + esc(insight) + "</p>"
                 "<table style='border-collapse:collapse;width:100%;font-size:14px'>"
                 "<tr style='background:#e8f0ec'><th align='left' style='padding:9px'>Metric</th>"
                 "<th align='left'>This week</th><th align='left'>Prior week</th></tr>" + trs + "</table>"
                 "<h3>Where customers discovered us</h3><p>" + esc(source_text) + "</p>"
                 "<h3>Most requested improvements</h3><p>" + esc(issues_text) + "</p>"
                 "<h3>Recommended action</h3><p>" + esc(insight) + "</p>"
                 "<h3>Interpretation and limitations</h3><p>" + esc(caution) + "</p>"
                 "<p style='font-size:12px;color:#666'>Survey responses are anonymous. Counts are per answered question. "
                 "If a self-administered test response remains in Supabase, remove it before evaluating customer results.</p>"
                 "</div>")
    lines = ["RSSL WEEKLY CUSTOMER INSIGHTS — " + label, "", "Executive summary: " + insight,
             "", "Metric | This week | Previous week"]
    lines += [a + " | " + b + " | " + c for a, b, c in rows]
    lines += ["", "Discovery: " + source_text, "Improvements: " + issues_text,
              "Recommended action: " + insight, "", "Limitations: " + caution]
    return label, "\n".join(lines), html_body


def send_email(label, text, html_body):
    mail_key = required(MAIL_KEY)
    target = required(TO_KEY)
    sender = required(FROM_KEY)
    payload = json.dumps({
        "from": sender, "to": [target],
        "subject": "RSSL | Weekly Customer Insights — " + label,
        "text": text, "html": html_body,
    }).encode("utf-8")
    req = urllib.request.Request("https://api.resend.com/emails", data=payload, method="POST",
       headers={"Authorization": "Bearer " + mail_key, "Content-Type": "application/json",
                "Idempotency-Key": "rssl-weekly-" + label.encode("ascii", "ignore").decode("ascii").replace(" ", "-")})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            result = json.load(res)
    except urllib.error.HTTPError as e:
        raise RuntimeError("Resend email send failed: HTTP " + str(e.code)) from e
    print("Resend accepted weekly email, message id:", result.get("id", "[not returned]"))


def main():
    dry_run = "--dry-run" in sys.argv
    key = required(API_KEY)
    (start, end), (older_start, older_end) = week_windows()
    recent = read_week(start, end, key)
    older = read_week(older_start, older_end, key)
    label, plain, rich = make_message(recent, older, start, end)
    print("Report:", label, "responses:", len(recent), "previous:", len(older))
    if dry_run:
        print(plain)
    else:
        send_email(label, plain, rich)


if __name__ == "__main__":
    main()
