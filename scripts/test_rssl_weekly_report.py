"""Local, dependency-free regression tests for the GitHub weekly reporting job."""
import contextlib
import io
import json
import os
import unittest
import urllib.parse
from pathlib import Path
from unittest import mock

import rssl_weekly_report as report


class WeeklyReportTests(unittest.TestCase):
    def setUp(self):
        self.survey = [
            dict(submission_id="a", submitted_at="2026-11-19T01:00:00Z",
                 visit_type="first", discovery_source="google_maps",
                 google_today="maps", experience="excellent", improvement="nothing"),
            dict(submission_id="b", submitted_at="2026-11-20T01:00:00Z",
                 visit_type="repeat", discovery_source="walk_by",
                 google_today="no", experience="good", improvement="cleanliness"),
            dict(submission_id="c", submitted_at="2026-11-20T02:00:00Z",
                 visit_type=None, discovery_source=None, google_today=None,
                 experience=None, improvement=None),
        ]

    def test_sydney_daylight_saving_boundaries(self):
        import datetime as dt
        self.assertEqual(
            report.as_utc_iso(dt.date(2026, 11, 16)),
            "2026-11-15T13:00:00Z"
        )
        self.assertEqual(
            report.as_utc_iso(dt.date(2026, 7, 20)),
            "2026-07-19T14:00:00Z"
        )

    def test_ignore_skips_in_denominators(self):
        self.assertEqual(report.measure(self.survey, "visit_type", {"first"}), (1,2))
        self.assertEqual(report.metric(self.survey, "experience", {"good","excellent"}),
                         "2 / 2 (100%)")
        self.assertEqual(report.metric(self.survey, "google_today", {"maps","search","both"}),
                         "1 / 2 (50%)")

    def test_new_vs_returning_google_discovery(self):
        self.assertEqual(report.new_google_metric(self.survey), "1 / 1 (100%)")
        self.assertEqual(report.returning_google_metric(self.survey), "0 / 1 (0%)")

    def test_improvement_summary(self):
        self.assertEqual(report.issue_summary(self.survey), [("Cleanliness", 1)])

    def test_message_contains_actual_values_and_limits(self):
        import datetime as dt
        label, plain, rich = report.make_message(
            self.survey, [], dt.date(2026,11,16), dt.date(2026,11,23))
        self.assertIn("16 Nov", label)
        self.assertIn("Surveys received | 3 | 0", plain)
        self.assertIn("First-time visits | 1 / 2 (50%)", plain)
        self.assertIn("Small sample", plain)
        self.assertIn("not all paying customers", rich)

    def test_zero_survey_week(self):
        import datetime as dt
        _label, plain, _rich = report.make_message(
            [], self.survey, dt.date(2026,11,16), dt.date(2026,11,23))
        self.assertIn("Surveys received | 0 | 3", plain)
        self.assertIn("No completed customer surveys", plain)

    def test_server_api_key_header_and_bounded_week(self):
        import datetime as dt
        seen = []
        class FakeResponse:
            def __enter__(self):
                return io.BytesIO(json.dumps(self.survey).encode())
            def __exit__(self, *args):
                return False
        def fake_urlopen(req, timeout=None):
            seen.append(req)
            return FakeResponse()
        with mock.patch.object(report.urllib.request, "urlopen", fake_urlopen):
            rows = report.read_week(dt.date(2026,11,16), dt.date(2026,11,23), "sb_secret_TEST")
        self.assertEqual(len(rows), 3)
        self.assertEqual(seen[0].get_header("Apikey"), "sb_secret_TEST")
        self.assertIsNone(seen[0].get_header("Authorization"))
        parameters = urllib.parse.parse_qs(urllib.parse.urlsplit(seen[0].full_url).query)
        self.assertEqual(parameters["submitted_at"],
                         ["gte.2026-11-15T13:00:00Z", "lt.2026-11-22T13:00:00Z"])

    def test_gmail_sender_constructs_message_without_network(self):
        sent = []
        class SMTPFake:
            def __init__(self, host, port, **kwargs):
                self.host, self.port = host, port
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def login(self, user, password):
                sent.append(("login",user,password))
            def send_message(self, msg):
                sent.append(("send",msg))
        with mock.patch.dict(os.environ, {
            "RSSL_REPORT_TO":"test@example.com",
            "RSSL_GMAIL_APP_PASSWORD":"test app password",
        }), mock.patch("smtplib.SMTP_SSL", SMTPFake):
            report.send_email("16 Nov – 22 Nov 2026", "Plain report", "<p>HTML report</p>")
        self.assertEqual(sent[0], ("login","test@example.com","testapppassword"))
        email = sent[1][1]
        self.assertEqual(email["To"], "test@example.com")
        self.assertIn("Weekly Customer Insights", email["Subject"])
        self.assertIn("Plain report", email.get_body(preferencelist=("plain",)).get_content())


if __name__ == "__main__":
    unittest.main()
