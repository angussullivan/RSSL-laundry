"""Read-only schema preflight for the RSSL Customer Survey Supabase project.

Only column names and status codes are printed, never customer responses or secrets.
The GitHub workflow supplies the secret through Actions Secrets.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

ROOT = "https://mfsdnfhoifahvlsjzzxf.supabase.co/rest/v1/rssl_customer_surveys"
KEY = os.environ["SUPABASE_SECRET_KEY"]
HEADERS = {"apikey": KEY, "Accept": "application/json"}


def fetch_columns():
    req = urllib.request.Request(ROOT + "?select=*&limit=1", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as response:
        data = json.load(response)
    if not isinstance(data, list):
        raise RuntimeError("Supabase schema probe returned unexpected JSON")
    return sorted(data[0]) if data else []


def has_columns(cols):
    query = urllib.parse.urlencode({"select": ",".join(cols), "limit": "0"})
    req = urllib.request.Request(ROOT + "?" + query, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status == 200
    except urllib.error.HTTPError as exc:
        if exc.code == 400:
            return False
        raise RuntimeError("Supabase schema probe failed HTTP " + str(exc.code))


columns = fetch_columns()
print("Legacy survey columns:", ",".join(columns) if columns else "No data in table")
original = ["submission_id", "submitted_at", "visit_type", "discovery_source",
            "google_today", "experience", "improvement"]
new = ["choice_reason", "customer_context", "discovery_detail",
       "survey_language", "survey_version"]
print("Original columns query successful:", has_columns(original))
ready = has_columns(new)
print("Acquisition V2 additive migration applied:", ready)
print("Read-only preflight completed; no rows changed.")
