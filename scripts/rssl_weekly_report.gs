/**
 * Reservoir Street Self Service Laundry — Weekly Customer Insights (Gmail).
 *
 * Runs under the owner's Google Account using Google Apps Script.
 * Reads anonymous survey rows from Supabase using a server-side secret stored
 * in Project Settings > Script Properties (never in website/public GitHub code).
 * Sends the report directly from that Google account with GmailApp.
 *
 * Setup: see survey/GMAIL_APPS_SCRIPT_SETUP.md in the RSSL-laundry GitHub repo.
 */
const RSSL_TIMEZONE = 'Australia/Sydney';
const RSSL_SUPABASE_URL = 'https://mfsdnfhoifahvlsjzzxf.supabase.co';
const RSSL_TABLE = 'rssl_customer_surveys';
const RSSL_FIELDS = 'submission_id,submitted_at,visit_type,discovery_source,google_today,experience,improvement';

const RSSL_LABELS = {
  google_maps:'Google Maps', google_search:'Google Search',
  walk_by:'Walking past', recommendation:'Friend / family',
  other:'Other', unsure:"Can't remember",
  machines:'Machine availability', cleanliness:'Cleanliness',
  prices:'Pricing', payment:'Card payment',
  instructions:'Instructions or signage', nothing:'Nothing',
};

/** Manual test: sends a real email for the current week to date. */
function sendTestReport() {
  const start = rsslMondayOfCurrentWeek_();
  const end = rsslAddDays_(rsslToday_(), 1);
  rsslDeliver_(start, end, true);
}

/** Installable Monday trigger: sends the PREVIOUS completed Monday–Sunday. */
function sendWeeklyReport() {
  const end = rsslMondayOfCurrentWeek_();
  const start = rsslAddDays_(end, -7);
  rsslDeliver_(start, end, false);
}

/** Run once to create exactly one Monday trigger in this Apps Script project. */
function installWeeklyTrigger() {
  // Prevent two overlapping schedules if the setup function is run twice.
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendWeeklyReport')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendWeeklyReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .nearMinute(15)
    .inTimezone(RSSL_TIMEZONE)
    .create();
  console.log('Weekly Gmail trigger installed for Monday morning Australia/Sydney.');
}

/** Optional: call to stop the Monday Gmail reports without deleting script. */
function removeWeeklyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendWeeklyReport')
    .forEach(t => ScriptApp.deleteTrigger(t));
  console.log('RSSL weekly trigger removed.');
}

function rsslDeliver_(start, endExclusive, isTest) {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('RSSL_SUPABASE_SECRET_KEY');
  const recipient = props.getProperty('RSSL_REPORT_TO');
  if (!secret || !secret.startsWith('sb_secret_')) {
    throw new Error('Missing RSSL_SUPABASE_SECRET_KEY in Apps Script Script Properties.');
  }
  if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    throw new Error('Missing or invalid RSSL_REPORT_TO in Script Properties.');
  }

  let olderStart, olderEnd;
  if (isTest) {
    olderEnd = start;
    olderStart = rsslAddDays_(start, -7);
  } else {
    olderStart = rsslAddDays_(start, -7);
    olderEnd = start;
  }

  const current = rsslReadWeek_(start, endExclusive, secret);
  const previous = rsslReadWeek_(olderStart, olderEnd, secret);
  const report = rsslCompose_(current, previous, start, endExclusive, isTest);
  const suffix = isTest ? ' [LIVE TEST]' : '';
  const subject = 'RSSL | Weekly Customer Insights — ' + report.period + suffix;

  GmailApp.sendEmail(recipient, subject, report.plain, {
    htmlBody: report.html,
    name: 'RSSL Customer Insights'
  });
  console.log('GmailApp sent report: ' + report.period
    + '; survey responses ' + current.length + '; previous ' + previous.length);
}

/** Read complete anonymous responses, in deterministic pages. */
function rsslReadWeek_(startDate, endDate, secret) {
  const result = [];
  const lower = rsslSydneyMidnightUtc_(startDate);
  const upper = rsslSydneyMidnightUtc_(endDate);
  const range = 'and=('
    + 'submitted_at.gte.' + lower + ','
    + 'submitted_at.lt.' + upper + ')';

  for (let page = 0; page < 50; page++) {
    const params = 'select=' + encodeURIComponent(RSSL_FIELDS)
      + '&and=' + encodeURIComponent(range.slice(4, -1))
      + '&order=submitted_at.asc,submission_id.asc'
      + '&limit=1000&offset=' + (page * 1000);
    const url = RSSL_SUPABASE_URL + '/rest/v1/' + RSSL_TABLE + '?' + params;
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {'apikey':secret, 'Accept':'application/json'},
      muteHttpExceptions: true,
      followRedirects: false,
      validateHttpsCertificates: true,
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Supabase response HTTP ' + response.getResponseCode()
        + '. Report not sent. Verify server-side key access.');
    }
    const batch = JSON.parse(response.getContentText());
    if (!Array.isArray(batch)) throw new Error('Unexpected Supabase data format.');
    result.push(...batch);
    if (batch.length < 1000) return result;
  }
  throw new Error('Survey has over 50,000 weekly entries. Increase pagination limit.');
}
function rsslValid_(rows, field) {
  return rows.map(r=>r[field]).filter(v=>v!==null && v!==undefined && v!=='');
}
function rsslPct_(n,d) {return d ? (100*n/d).toFixed(0)+'%' : '—';}
function rsslMetric_(rows, field, selected) {
  const values = rsslValid_(rows,field);
  const count = values.filter(v=>selected.indexOf(v)!==-1).length;
  return values.length ? count+' / '+values.length+' ('+rsslPct_(count,values.length)+')'
                       : 'No answers';
}
function rsslGoogleDiscovery_(rows,visitType) {
  const eligible=rows.filter(r=>r.visit_type===visitType &&
    r.discovery_source!==null && r.discovery_source!==undefined);
  const count=eligible.filter(r=>r.discovery_source==='google_maps' ||
                                   r.discovery_source==='google_search').length;
  return eligible.length ? count+' / '+eligible.length+' ('+rsslPct_(count,eligible.length)+')'
                         : 'No answers';
}
function rsslIssues_(rows) {
  const count = {};
  rows.forEach(r=>{
    const v=r.improvement;
    if(v && v!=='nothing') count[v]=(count[v]||0)+1;
  });
  return Object.keys(count).sort((a,b)=>count[b]-count[a])
    .slice(0,3).map(k=>(RSSL_LABELS[k]||k)+' ('+count[k]+')');
}
function rsslSources_(rows) {
  const values = rsslValid_(rows,'discovery_source');
  const order=['google_maps','google_search','walk_by','recommendation','other','unsure'];
  return order.map(k=>{
    const n=values.filter(v=>v===k).length;
    return n ? (RSSL_LABELS[k]||k)+' '+n+' ('+rsslPct_(n,values.length)+')' : null;
  }).filter(Boolean);
}
function rsslCompose_(rows,previous,start,endExclusive,isTest) {
  const last = rsslAddDays_(endExclusive,-1);
  const period = rsslDateDisplay_(start) + ' – ' + rsslDateDisplay_(last);
  const metrics = [
    ['Survey responses',String(rows.length),String(previous.length)],
    ['First-time visitors',rsslMetric_(rows,'visit_type',['first']),rsslMetric_(previous,'visit_type',['first'])],
    ['First-time visitors who found us via Google',
      rsslGoogleDiscovery_(rows,'first'),rsslGoogleDiscovery_(previous,'first')],
    ['Returning visitors originally from Google',
      rsslGoogleDiscovery_(rows,'repeat'),rsslGoogleDiscovery_(previous,'repeat')],
    ['Originally discovered via Google Maps',
      rsslMetric_(rows,'discovery_source',['google_maps']),
      rsslMetric_(previous,'discovery_source',['google_maps'])],
    ['Originally discovered via Google Search',
      rsslMetric_(rows,'discovery_source',['google_search']),
      rsslMetric_(previous,'discovery_source',['google_search'])],
    ['Originally discovered by walking past',
      rsslMetric_(rows,'discovery_source',['walk_by']),
      rsslMetric_(previous,'discovery_source',['walk_by'])],
    ['Originally discovered through recommendation',
      rsslMetric_(rows,'discovery_source',['recommendation']),
      rsslMetric_(previous,'discovery_source',['recommendation'])],
    ['Used Google today',
      rsslMetric_(rows,'google_today',['maps','search','both']),
      rsslMetric_(previous,'google_today',['maps','search','both'])],
    ['Rated Good or Excellent',
      rsslMetric_(rows,'experience',['good','excellent']),
      rsslMetric_(previous,'experience',['good','excellent'])],
  ];
  const issues = rsslIssues_(rows);
  const sources = rsslSources_(rows);
  const insight = rows.length===0
    ? 'No survey responses recorded in the reporting period. Check tablet operation.'
    : rows.length<15
    ? 'The sample is small. Keep collecting responses before changing advertising.'
    : issues.length
    ? 'Review the most commonly requested improvement: '+issues[0]+'.'
    : 'Continue measuring customer discovery and transaction trends.';
  const warning = 'Survey responses are voluntary and may not represent all paying customers. '
    + 'Google discovery does not establish paid-ad attribution or incremental revenue. '
    + 'Machine revenue and Google Ads spend are not integrated into this report.';
  const top = isTest
    ? 'LIVE TEST — current partial week; not a scheduled production report.'
    : 'Completed Monday–Sunday reporting period.';
  const plain=[
    'RESERVOIR STREET SELF SERVICE LAUNDRY',
    'Weekly Customer Insights — '+period,
    top,'',
    'Summary: '+insight,'',
    ...metrics.map(x=>x.join(' | ')),
    '', 'Discovery sources: '+(sources.join(', ')||'None'),
    'Requested improvements: '+(issues.join(', ')||'None'),
    '', 'Interpretation: '+warning
  ].join('\n');
  const esc=x=>String(x).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const tr=metrics.map(m=>'<tr>'+m.map(v=>'<td style="border-bottom:1px solid #ddd;padding:10px">'+esc(v)+'</td>').join('')+'</tr>').join('');
  const rich='<div style="font-family:Arial,sans-serif;max-width:800px;color:#173b36">'
    +'<h2>Reservoir Street Self Service Laundry</h2>'
    +'<h1>Weekly Customer Insights</h1>'
    +'<p><b>'+esc(period)+'</b> · '+esc(top)+'</p>'
    +'<p><strong>Executive summary:</strong> '+esc(insight)+'</p>'
    +'<table style="border-collapse:collapse;width:100%;font-size:14px">'
    +'<thead><tr style="background:#e5f4ed"><th align="left">Metric</th><th align="left">This period</th><th align="left">Previous period</th></tr></thead><tbody>'
    +tr+'</tbody></table>'
    +'<h3>Discovery sources</h3><p>'+esc(sources.join(', ')||'None')+'</p>'
    +'<h3>Requested improvements</h3><p>'+esc(issues.join(', ')||'None')+'</p>'
    +'<h3>Recommendations & caveats</h3><p>'+esc(insight)+'</p>'
    +'<p>'+esc(warning)+'</p>'
    +'</div>';
  return {period,plain,html:rich};
}

/** Sydney-local calendar date helpers; correctly handle AEST and AEDT boundaries. */
function rsslToday_() {
  return Utilities.formatDate(new Date(),RSSL_TIMEZONE,'yyyy-MM-dd');
}
function rsslMondayOfCurrentWeek_() {
  const today = rsslToday_();
  const parts = today.split('-').map(Number);
  const w = new Date(Date.UTC(parts[0],parts[1]-1,parts[2])).getUTCDay();
  return rsslAddDays_(today,-((w+6)%7));
}
function rsslAddDays_(ymd,days) {
  const parts=ymd.split('-').map(Number);
  return new Date(Date.UTC(parts[0],parts[1]-1,parts[2]+days))
    .toISOString().slice(0,10);
}
function rsslSydneyMidnightUtc_(ymd) {
  const p=ymd.split('-').map(Number);
  // Offset on prior evening equals offset at the local midnight;
  // avoids DST switchovers that occur after local midnight.
  const before = new Date(Date.UTC(p[0],p[1]-1,p[2]-1,12));
  const zone = Utilities.formatDate(before,RSSL_TIMEZONE,'Z');
  const sign = zone[0]==='-'?-1:1;
  const minutes=sign*(Number(zone.slice(1,3))*60+Number(zone.slice(3,5)));
  return new Date(Date.UTC(p[0],p[1]-1,p[2])-minutes*60000).toISOString();
}
function rsslDateDisplay_(ymd) {
  return Utilities.formatDate(new Date(ymd+'T12:00:00Z'),RSSL_TIMEZONE,'dd MMM yyyy');
}
