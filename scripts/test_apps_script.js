// No credentials or live network traffic. Run: node scripts/test_apps_script.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'RSSL_Weekly_Email_Apps_Script.gs'),'utf8');
assert.doesNotThrow(()=>new Function(source),'Apps Script code compiles');
assert.ok(!/sb_secret_[A-Za-z0-9]{15,}/.test(source),'No real Supabase secret in source');
function formatDate(date, timezone, pattern) {
  assert.equal(timezone,'Australia/Sydney');
  if (pattern === 'yyyy-MM-dd') {
    const tokens = new Intl.DateTimeFormat('en-US',{
      timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(date);
    const o=Object.fromEntries(tokens.map(t=>[t.type,t.value]));
    return o.year+'-'+o.month+'-'+o.day;
  }
  if (pattern === 'Z') {
    const tokens = new Intl.DateTimeFormat('en-US',{
      timeZone:timezone,hour:'2-digit',timeZoneName:'shortOffset'
    }).formatToParts(date);
    const gmt=tokens.find(t=>t.type==='timeZoneName').value;
    const m=gmt.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    assert.ok(m,'Timezone offset returned');
    return m[1]+m[2].padStart(2,'0')+(m[3]||'00');
  }
  throw Error('Unexpected date format '+pattern);
}
const props=new Map([['RSSL_SUPABASE_SECRET_KEY','sb_secret_FAKE_FOR_UNIT_TEST']]);
const sent=[];
const triggers=[];
const requests=[];
const urlFetch={
  fetch(url,options){
    requests.push({url,options});
    // A single fake anonymous customer survey for each request.
    return {
      getResponseCode:()=>200,
      getContentText:()=>JSON.stringify([{
        submission_id:'fake-1',
        submitted_at:'2026-11-18T08:00:00Z',
        visit_type:'first',
        discovery_source:'google_maps',
        google_today:'maps',
        experience:'good',
        improvement:'nothing'
      }])
    };
  }
};
const PropertiesService={getScriptProperties:()=>({
  getProperty:k=>props.get(k)||null,
  setProperty:(k,v)=>{props.set(k,v);return null;}
})};
const Utilities={formatDate};
const MailApp={sendEmail:message=>{sent.push(message)}};
const Session={getEffectiveUser:()=>({getEmail:()=> 'angussullivan@gmail.com'})};
const LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
const ScriptApp={
  WeekDay:{MONDAY:'MONDAY'},
  getProjectTriggers:()=>triggers,
  deleteTrigger:trigger=>{const index=triggers.indexOf(trigger);if(index>=0)triggers.splice(index,1)},
  newTrigger:handler=>{
    const state={handler};
    const api={
      timeBased:()=>api,
      everyWeeks:n=>(state.everyWeeks=n,api),
      onWeekDay:x=>(state.onWeekDay=x,api),
      atHour:n=>(state.hour=n,api),
      nearMinute:n=>(state.minute=n,api),
      inTimezone:t=>(state.timezone=t,api),
      create:()=>{const trigger={...state,getHandlerFunction:()=>handler};triggers.push(trigger);return trigger}
    };
    return api;
  }
};
const functions=new Function('PropertiesService','Utilities','MailApp','UrlFetchApp',
  'Session','LockService','ScriptApp',source+
  '\nreturn {currentRsslMonday_,sydneyMidnightUtc_,rsslBuildReport_,sendTestReportNow,sendWeeklyRsslReport,installMondaySchedule};')
  (PropertiesService,Utilities,MailApp,urlFetch,Session,LockService,ScriptApp);

assert.equal(functions.currentRsslMonday_(new Date('2026-11-18T08:30:00Z')),'2026-11-16');
assert.equal(functions.sydneyMidnightUtc_('2026-11-16'),'2026-11-15T13:00:00.000Z');
assert.equal(functions.sydneyMidnightUtc_('2026-07-20'),'2026-07-19T14:00:00.000Z');
assert.equal(functions.sydneyMidnightUtc_('2026-10-04'),'2026-10-03T14:00:00.000Z');
const before=sent.length;
functions.sendTestReportNow();
assert.equal(sent.length,before+1);
assert.equal(sent.at(-1).to,'angussullivan@gmail.com');
assert.ok(sent.at(-1).subject.startsWith('[TEST · Current week to date]'));
assert.ok(sent.at(-1).htmlBody.includes('Google Maps'));
assert.equal(requests.length,2);
for(const call of requests){
  assert.ok(call.url.includes('/rest/v1/rssl_customer_surveys?'));
  assert.ok(call.url.includes('submitted_at=gte.'));
  assert.ok(call.url.includes('submitted_at=lt.'));
  assert.equal(call.options.headers.apikey,'sb_secret_FAKE_FOR_UNIT_TEST');
  assert.ok(!('Authorization' in call.options.headers));
}
functions.installMondaySchedule();
functions.installMondaySchedule();
assert.equal(triggers.length,1,'Installing twice creates only one weekly trigger');
assert.equal(triggers[0].handler,'sendWeeklyRsslReport');
assert.equal(triggers[0].everyWeeks,1);
assert.equal(triggers[0].onWeekDay,'MONDAY');
assert.equal(triggers[0].hour,9);
assert.equal(triggers[0].minute,15);
assert.equal(triggers[0].timezone,'Australia/Sydney');

functions.sendWeeklyRsslReport();
const after=sent.length;
functions.sendWeeklyRsslReport();
assert.equal(sent.length,after,'Duplicate weekly send suppressed');
assert.ok(props.get('RSSL_LAST_SENT_WEEK'));
console.log('PASS: Apps Script Australian DST, private Supabase key, counts, Google MailApp send, live-test mode, Monday trigger, no duplicate sends');
