/**
 * Reservoir Street Self Service Laundry — weekly customer insights.
 * Runs under the owner's Google account, so MailApp sends FROM that account.
 * 1) Script Properties: RSSL_SUPABASE_SECRET_KEY = sb_secret_... (never in code)
 * 2) Run sendTestReportNow() to verify actual delivery
 * 3) Run installMondaySchedule() exactly once to activate weekly sends
 * No Gmail App Password or SMTP required.
 */
const RSSL = Object.freeze({
  projectUrl: 'https://mfsdnfhoifahvlsjzzxf.supabase.co',
  table: 'rssl_customer_surveys',
  recipient: 'angussullivan@gmail.com',
  timezone: 'Australia/Sydney',
  reportName: 'RSSL Customer Insights'
});

function requireRsslSecret_() {
  const key = PropertiesService.getScriptProperties()
    .getProperty('RSSL_SUPABASE_SECRET_KEY');
  if (!key || !key.startsWith('sb_secret_')) {
    throw new Error('Set RSSL_SUPABASE_SECRET_KEY in Apps Script > Project Settings > Script Properties.');
  }
  return key;
}

function addRsslDays_(dateString, days) {
  const date = new Date(dateString + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function currentRsslMonday_(now) {
  const today = Utilities.formatDate(now, RSSL.timezone, 'yyyy-MM-dd');
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay();
  return addRsslDays_(today, -((weekday + 6) % 7));
}
function sydneyMidnightUtc_(dateString) {
  // Approximate local midnight is 10–11h before UTC midnight.
  // Measure the actual Sydney UTC offset at that instant, including DST.
  const utcMidnight = Date.parse(dateString + 'T00:00:00Z');
  const nearLocalMidnight = new Date(utcMidnight - 11 * 3600000);
  const offset = Utilities.formatDate(nearLocalMidnight, RSSL.timezone, 'Z');
  if (!/^[+-]\d{4}$/.test(offset)) throw new Error('Invalid Sydney timezone offset');
  const sign = offset[0] === '-' ? -1 : 1;
  const minutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)));
  return new Date(utcMidnight - minutes * 60000).toISOString();
}

function rsslSurveyRows_(startUtc, endUtc) {
  const key = requireRsslSecret_();
  const fields = [
    'submission_id', 'submitted_at', 'visit_type', 'discovery_source',
    'google_today', 'experience', 'improvement'
  ].join(',');
  const rows = [];
  const limit = 1000;
  for (let offset = 0; offset < 200000; offset += limit) {
    const query = [
      'select=' + encodeURIComponent(fields),
      'submitted_at=gte.' + encodeURIComponent(startUtc),
      'submitted_at=lt.' + encodeURIComponent(endUtc),
      'order=submitted_at.asc',
      'limit=' + limit,
      'offset=' + offset
    ].join('&');
    const url = RSSL.projectUrl + '/rest/v1/' + RSSL.table + '?' + query;
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {apikey: key, Accept: 'application/json'},
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    if (status !== 200) {
      throw new Error('Supabase report request failed (HTTP ' + status + '). Check project key and table access.');
    }
    let batch;
    try { batch = JSON.parse(response.getContentText()); }
    catch (_) { throw new Error('Supabase returned invalid JSON'); }
    if (!Array.isArray(batch)) throw new Error('Supabase response was not an array');
    for (const record of batch) rows.push(record);
    if (batch.length < limit) return rows;
  }
  throw new Error('Unusually large response volume: reporting limit reached; refusing to send incomplete counts.');
}

function rsslRatio_(data, field, choices) {
  const present = data.filter(row => row[field] != null && row[field] !== '');
  const count = present.filter(row => choices.indexOf(row[field]) >= 0).length;
  return present.length ? count + ' / ' + present.length +
    ' (' + Math.round(100 * count / present.length) + '%)' : 'No answers';
}

function rsslGoogleFirst_(data, visitType) {
  const subset = data.filter(row => row.visit_type === visitType &&
    row.discovery_source != null && row.discovery_source !== '');
  const google = subset.filter(row => row.discovery_source === 'google_maps' ||
    row.discovery_source === 'google_search').length;
  return subset.length ? google + ' / ' + subset.length +
    ' (' + Math.round(100 * google / subset.length) + '%)' : 'No answers';
}

function rsslCounts_(data, field, map, includeNothing) {
  const entries = Object.entries(map).map(([code, label]) => ({
    name: label,
    count: data.filter(row => row[field] === code).length
  })).filter(item => item.count && (includeNothing || item.name !== 'Nothing'));
  entries.sort((a, b) => b.count - a.count);
  return entries.length ? entries.map(x => x.name + ': ' + x.count).join(' · ') : 'None recorded';
}
function rsslEscape_(v) {
  return String(v).replace(/[&<>"']/g, c =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])
  );
}

function rsslBuildReport_(recent, older, periodLabel, isTest) {
  const metrics = [
    ['Survey responses', String(recent.length), String(older.length)],
    ['First-time visitors', rsslRatio_(recent,'visit_type',['first']), rsslRatio_(older,'visit_type',['first'])],
    ['New visitors originally from Google', rsslGoogleFirst_(recent,'first'), rsslGoogleFirst_(older,'first')],
    ['Returning visitors originally from Google', rsslGoogleFirst_(recent,'repeat'), rsslGoogleFirst_(older,'repeat')],
    ['Originally discovered via Google Maps', rsslRatio_(recent,'discovery_source',['google_maps']), rsslRatio_(older,'discovery_source',['google_maps'])],
    ['Originally discovered via Google Search', rsslRatio_(recent,'discovery_source',['google_search']), rsslRatio_(older,'discovery_source',['google_search'])],
    ['Originally discovered by walking past', rsslRatio_(recent,'discovery_source',['walk_by']), rsslRatio_(older,'discovery_source',['walk_by'])],
    ['Originally discovered by recommendation', rsslRatio_(recent,'discovery_source',['recommendation']), rsslRatio_(older,'discovery_source',['recommendation'])],
    ['Used Google on visit day', rsslRatio_(recent,'google_today',['maps','search','both']), rsslRatio_(older,'google_today',['maps','search','both'])],
    ['Good or Excellent rating', rsslRatio_(recent,'experience',['excellent','good']), rsslRatio_(older,'experience',['excellent','good'])]
  ];
  const sourceLabels = {
    google_maps:'Google Maps',google_search:'Google Search',walk_by:'Walking past',
    recommendation:'Recommendation',other:'Other',unsure:'Unsure'
  };
  const issueLabels = {
    machines:'Machine availability',cleanliness:'Cleanliness',prices:'Pricing',
    payment:'Card payment',instructions:'Instructions/signage',other:'Other',nothing:'Nothing'
  };
  const sources = rsslCounts_(recent,'discovery_source',sourceLabels,true);
  const issues = rsslCounts_(recent,'improvement',issueLabels,false);
  const recommendation = recent.length === 0
    ? 'No surveys in this period. Check tablet uptime and survey visibility.'
    : recent.length < 15
    ? 'Small sample: gather more responses before changing advertising or operations.'
    : issues !== 'None recorded'
    ? 'Review the most commonly selected improvement and track whether it persists.'
    : 'Keep collecting responses and compare actual transaction revenue and advertising spend.';
  const limitations = 'Voluntary survey responses are not the full paying-customer population. ' +
    'Google Maps/Search discovery is not proof that a paid ad caused a visit. ' +
    'Revenue and Google Ads spending are not connected to this report.';
  const prefix = isTest ? '[TEST · Current week to date] ' : '';
  const subject = prefix + 'RSSL | Weekly Customer Insights — ' + periodLabel;
  const tableHead = '<tr><th align="left">Metric</th><th align="left">Period</th><th align="left">Previous week</th></tr>';
  const tableRows = metrics.map(cols => '<tr>' + cols.map(c =>
    '<td style="border-bottom:1px solid #e2e7e5;padding:9px">' + rsslEscape_(c) + '</td>'
  ).join('') + '</tr>').join('');
  const htmlBody = '<div style="font-family:Arial,sans-serif;color:#173c37;max-width:760px">' +
    '<h2>Reservoir Street Self Service Laundry</h2>' +
    '<h1>Weekly Customer Insights</h1><p><b>' + rsslEscape_(periodLabel) + '</b></p>' +
    (isTest ? '<p><b>TEST EMAIL — partial current week, not the scheduled weekly report.</b></p>' : '') +
    '<p><b>Executive summary:</b> ' + rsslEscape_(recommendation) + '</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:13px"><thead style="background:#e8f0ec">' +
    tableHead + '</thead><tbody>' + tableRows + '</tbody></table>' +
    '<h3>Where visitors first discovered us</h3><p>' + rsslEscape_(sources) + '</p>' +
    '<h3>Most requested improvements</h3><p>' + rsslEscape_(issues) + '</p>' +
    '<h3>Recommendation</h3><p>' + rsslEscape_(recommendation) + '</p>' +
    '<h3>Important limitations</h3><p>' + rsslEscape_(limitations) + '</p>' +
    '<p style="font-size:12px;color:#777">Anonymous in-store survey · Percentages exclude skipped answers ' +
    'per question. Remove initial setup test responses before using the results for decisions.</p></div>';
  const plain = [subject, '', recommendation, '', 'Metric | Period | Previous week',
    ...metrics.map(row => row.join(' | ')), '',
    'First discovery: ' + sources,
    'Improvements: ' + issues,
    'Limitations: ' + limitations
  ].join('\n');
  return {subject: subject, body: plain, htmlBody: htmlBody};
}

function rsslMail_(report) {
  // Sender is the Google account that owns/authorises this Apps Script.
  const effective = Session.getEffectiveUser().getEmail();
  if (effective && effective.toLowerCase() !== RSSL.recipient.toLowerCase()) {
    throw new Error('Wrong Google account. Sign into ' + RSSL.recipient + ' and run this script from that account.');
  }
  MailApp.sendEmail({
    to: RSSL.recipient, name: RSSL.reportName,
    subject: report.subject, body: report.body, htmlBody: report.htmlBody
  });
  console.log('Report sent to ' + RSSL.recipient);
}

/** Run this first. Tests LIVE Supabase access and sends a real email NOW. */
function sendTestReportNow() {
  const now = new Date();
  const currentMonday = currentRsslMonday_(now);
  const previousMonday = addRsslDays_(currentMonday,-7);
  const recent = rsslSurveyRows_(sydneyMidnightUtc_(currentMonday),now.toISOString());
  const older = rsslSurveyRows_(sydneyMidnightUtc_(previousMonday),sydneyMidnightUtc_(currentMonday));
  const label = currentMonday + ' to ' + Utilities.formatDate(now,RSSL.timezone,'yyyy-MM-dd') + ' (week to date)';
  rsslMail_(rsslBuildReport_(recent,older,label,true));
  console.log('Test: ' + recent.length + ' survey responses from this week; ' + older.length + ' last week.');
}

/** Called every Monday by the installable trigger. Previous complete Mon–Sun. */
function sendWeeklyRsslReport() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const thisMonday = currentRsslMonday_(new Date());
    const lastMonday = addRsslDays_(thisMonday,-7);
    const earlierMonday = addRsslDays_(thisMonday,-14);
    const properties = PropertiesService.getScriptProperties();
    const key = 'RSSL_LAST_SENT_WEEK';
    if (properties.getProperty(key) === lastMonday) {
      console.log('Already sent report for ' + lastMonday + '; skipping duplicate.');
      return;
    }
    const recent = rsslSurveyRows_(sydneyMidnightUtc_(lastMonday),sydneyMidnightUtc_(thisMonday));
    const older = rsslSurveyRows_(sydneyMidnightUtc_(earlierMonday),sydneyMidnightUtc_(lastMonday));
    const label = lastMonday + ' to ' + addRsslDays_(thisMonday,-1);
    rsslMail_(rsslBuildReport_(recent,older,label,false));
    properties.setProperty(key,lastMonday);
    console.log('Weekly report sent for ' + label + ' with ' + recent.length + ' responses.');
  } finally {
    lock.releaseLock();
  }
}

/** Run once AFTER sendTestReportNow succeeds. Re-running is safe (no duplicates). */
function installMondaySchedule() {
  requireRsslSecret_();
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sendWeeklyRsslReport') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('sendWeeklyRsslReport')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .nearMinute(15)
    .inTimezone(RSSL.timezone)
    .create();
  console.log('Weekly Monday Sydney-time trigger installed. Google runs near 09:15 (roughly ±15 minutes).');
}
