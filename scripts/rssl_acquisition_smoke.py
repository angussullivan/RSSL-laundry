"""Live RSSL V2 integration test with synthetic rows, cleaned up after test.
Proves browser publishable-key INSERT, administrator READ, and test-row cleanup.
Never prints secrets or customer survey values.
"""
import datetime as dt
import json
import os
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid

URL = "https://mfsdnfhoifahvlsjzzxf.supabase.co/rest/v1/rssl_customer_surveys"
PUBLISHABLE = re.search(
    r"publishableKey:\s*'(sb_publishable_[^']+)'",
    pathlib.Path("survey/index.html").read_text(encoding="utf-8"),
)
if PUBLISHABLE is None:
    raise RuntimeError("Publishable key missing from kiosk source")
CLIENT_KEY = PUBLISHABLE.group(1)
SERVER_KEY = os.environ["SUPABASE_SECRET_KEY"]

now = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
test_rows = [
    {
        "submission_id": str(uuid.uuid4()), "answered_at": now,
        "visit_type": "first", "discovery_source": "other", "google_today": "maps",
        "experience": None, "improvement": None,
        "choice_reason": "location", "customer_context": "staying_nearby",
        "discovery_detail": "host_referral", "survey_language": "ja",
        "survey_version": 2,
    },
    {
        "submission_id": str(uuid.uuid4()), "answered_at": now,
        "visit_type": "repeat", "discovery_source": "google_maps", "google_today": "no",
        "experience": "good", "improvement": "nothing",
        "choice_reason": None, "customer_context": None,
        "discovery_detail": None, "survey_language": "de", "survey_version": 2,
    },
    {
        # Old V1 submission still has to work after the additive migration,
        # including an existing offline-queued response.
        "submission_id": str(uuid.uuid4()), "answered_at": now,
        "visit_type": "first", "discovery_source": "google_maps",
        "google_today": "search", "experience": "excellent",
        "improvement": "nothing",
    },
]

def verify_no_anonymous_read(submission_id):
    # An anonymous client must never be able to retrieve private survey data.
    req = urllib.request.Request(
        filtered(submission_id), method="GET",
        headers={"apikey": CLIENT_KEY, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            rows = json.loads(res.read().decode("utf-8"))
        if rows:
            raise RuntimeError("SECURITY: anonymous public key can read survey responses")
    except urllib.error.HTTPError as exc:
        if exc.code not in (401, 403):
            raise RuntimeError("Unexpected public read probe HTTP " + str(exc.code)) from None
    print("Anonymous SELECT: blocked/empty as expected")

def request(method, key, url, payload=None):
    headers = {"apikey": key, "Content-Type": "application/json",
               "Accept": "application/json", "Prefer": "return=minimal"}
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, res.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        msg = exc.read().decode("utf-8")[:250]
        raise RuntimeError(method + " failed HTTP " + str(exc.code) + " - " + msg) from None

def filtered(id_):
    return URL + "?submission_id=eq." + urllib.parse.quote(id_) + "&select=*"

# Only remove records whose INSERT actually succeeded.
# Do not claim an uninserted record was cleaned up.
created = []
try:
    for index, record in enumerate(test_rows):
        status, _ = request("POST", CLIENT_KEY, URL, record)
        if status not in (200, 201, 204):
            raise RuntimeError("Unexpected public insert HTTP " + str(status))
        created.append(record["submission_id"])
        print("Anonymous browser-style INSERT for case " + str(index + 1) + ": accepted")
        verify_no_anonymous_read(record["submission_id"])
        status, body = request("GET", SERVER_KEY, filtered(record["submission_id"]))
        found = json.loads(body)
        if status != 200 or len(found) != 1:
            raise RuntimeError("Cannot read test row back using server secret")
        stored = found[0]
        for key, expected in record.items():
            if key == "answered_at":
                continue
            if stored.get(key) != expected:
                raise RuntimeError("Inserted row does not match field: " + key)
        print("V2 database code and branch fields: verified")
finally:
    for submission_id in created:
        try:
            request("DELETE", SERVER_KEY, filtered(submission_id))
            status, body = request("GET", SERVER_KEY, filtered(submission_id))
            if status != 200 or json.loads(body):
                raise RuntimeError("Test record was not removed")
            print("Synthetic test row removed and verified")
        except Exception as err:
            # Never silently leave synthetic data in the customer analytics.
            print("WARNING: Test record cleanup could not be confirmed:", type(err).__name__)
            raise

print("PASS: public key INSERT (V2 first/return + V1 legacy), anonymous SELECT denied, readback, and test-row cleanup.")
