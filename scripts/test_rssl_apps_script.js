// Run with Node: node scripts/test_rssl_apps_script.js
// Verifies the real Google Apps Script source without Google credentials/network.
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'rssl_weekly_report.gs'),'utf8');
assert.ok(src.includes('MailApp.sendEmail'), "Google's send-only MailApp is used");
assert.ok(!src.includes('GmailApp.sendEmail'), 'Avoid full Gmail inbox access');
assert.ok(!src.includes('sb_secret_') || src.includes("startsWith('sb_secret_')"),
  'No real private server key committed to GitHub');
const requests=[],messages=[],createdTriggers=[],deletedTriggers=[];
const fakeRows=[
 {submission_id:'a',submitted_at:'2026-11-18T02:00:00Z',visit_type:'first',discovery_source:'google_maps',google_today:'maps',experience:'excellent',improvement:'nothing'},
 {submission_id:'b',submitted_at:'2026-11-18T03:00:00Z',visit_type:'repeat',discovery_source:'walk_by',google_today:'no',experience:'good',improvement:'cleanliness'},
 {submission_id:'c',submitted_at:'2026-11-18T04:00:00Z',visit_type:null,discovery_source:null,google_today:null,experience:null,improvement:null}
];
const FORMAT_CACHE={};
function parts(date,tz){
 const key=tz+'|d';
 const fmt=FORMAT_CACHE[key]||(FORMAT_CACHE[key]=new Intl.DateTimeFormat('en-GB',{
  timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'
 }));
 return Object.fromEntries(fmt.formatToParts(date).map(x=>[x.type,x.value]));
}
function formatDate(date,tz,format){
 const p=parts(date,tz);
 if(format==='yyyy-MM-dd')return p.year+'-'+p.month+'-'+p.day;
 if(format==='dd MMM yyyy'){
   const m=new Intl.DateTimeFormat('en-GB',{timeZone:tz,month:'short'}).format(date);
   return p.day+' '+m+' '+p.year;
 }
 if(format==='Z'){
   const v=new Intl.DateTimeFormat('en-GB',{timeZone:tz,timeZoneName:'shortOffset'})
     .formatToParts(date).find(x=>x.type==='timeZoneName').value;
   const mt=/GMT([+-])(\d{1,2})(?::(\d{1,2}))?/.exec(v);
   assert.ok(mt,'Found offset from Intl: '+v);
   return mt[1]+mt[2].padStart(2,'0')+(mt[3]||'00').padStart(2,'0');
 }
 throw Error('Unexpected format '+format);
}
const ctx={
 console:{log(){}},URL,Date,JSON,Number,String,Object,Math,Array,
 Utilities:{formatDate},
 PropertiesService:{getScriptProperties:()=>({
  getProperty:key=>({
   RSSL_SUPABASE_SECRET_KEY:'sb_secret_FAKE_VALUE',
   RSSL_REPORT_TO:'example@gmail.com'
  })[key]||null
 })},
 UrlFetchApp:{fetch:(url,options)=>{
  requests.push({url,options});
  const params=new URL(url).searchParams,range=params.get('and');
  const mt=/^\(submitted_at\.gte\.(.+),submitted_at\.lt\.(.+)\)$/.exec(range||'');
  assert.ok(mt,'Both date filters sent through PostgREST compound AND: '+range);
  assert.equal(options.headers.apikey,'sb_secret_FAKE_VALUE');
  assert.equal(options.headers.Authorization,undefined);
  const matching=fakeRows.filter(r=>r.submitted_at>=mt[1]&&r.submitted_at<mt[2]);
  const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||1000);
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(matching.slice(offset,offset+limit))};
 }},
 MailApp:{sendEmail:(recipient,subject,plain,opts)=>{
  messages.push({recipient,subject,plain,opts});
 }},
 ScriptApp:{
  WeekDay:{MONDAY:'MONDAY'},
  getProjectTriggers:()=>createdTriggers.filter(t=>!deletedTriggers.includes(t)),
  deleteTrigger:t=>deletedTriggers.push(t),
  newTrigger:handler=>{
   const record={handler,params:{}};
   const builder={
    timeBased(){return this;},
    onWeekDay(value){record.params.day=value;return this;},
    atHour(value){record.params.hour=value;return this;},
    nearMinute(value){record.params.minute=value;return this;},
    inTimezone(value){record.params.timezone=value;return this;},
    create(){createdTriggers.push({...record,getHandlerFunction(){return handler;}});return this;},
   };return builder;
  },
 }
};
vm.createContext(ctx);
vm.runInContext(src,ctx,{filename:'rssl_weekly_report.gs'});
assert.equal(ctx.rsslSydneyMidnightUtc_('2026-11-16'),'2026-11-15T13:00:00.000Z','AEDT midnight');
assert.equal(ctx.rsslSydneyMidnightUtc_('2026-07-20'),'2026-07-19T14:00:00.000Z','AEST midnight');
assert.equal(ctx.rsslSydneyMidnightUtc_('2026-10-04'),'2026-10-03T14:00:00.000Z','DST start midnight');
assert.equal(ctx.rsslSydneyMidnightUtc_('2026-04-05'),'2026-04-04T13:00:00.000Z','DST end midnight');
const rows=ctx.rsslReadWeek_('2026-11-16','2026-11-23','sb_secret_FAKE_VALUE');
assert.equal(rows.length,3,'Three fake survey records read');
assert.equal(ctx.rsslMetric_(rows,'visit_type',['first']),'1 / 2 (50%)','Skip-aware denominator');
assert.equal(ctx.rsslGoogleDiscovery_(rows,'first'),'1 / 1 (100%)','Google first-discovery');
assert.equal(ctx.rsslGoogleDiscovery_(rows,'repeat'),'0 / 1 (0%)','Repeat visitor discovery');
const report=ctx.rsslCompose_(rows,[],'2026-11-16','2026-11-23',true);
assert.ok(report.html.includes('Good or Excellent'),'Readable HTML summary');
assert.ok(report.plain.includes('Survey responses | 3 | 0'),'Accurate counts');
ctx.sendTestReport();
assert.equal(messages.length,1,'One simulated test email sent');
assert.equal(messages[0].recipient,'example@gmail.com');
assert.ok(messages[0].subject.includes('[LIVE TEST]'),'Test subject visibly marked');
assert.ok(messages[0].opts.htmlBody.includes('<table'),'HTML body included');
ctx.installWeeklyTrigger();
assert.equal(createdTriggers.length,1);
assert.equal(createdTriggers[0].params.day,'MONDAY');
assert.equal(createdTriggers[0].params.hour,9);
assert.equal(createdTriggers[0].params.minute,15);
assert.equal(createdTriggers[0].params.timezone,'Australia/Sydney');
ctx.installWeeklyTrigger();
assert.equal(createdTriggers.filter(t=>!deletedTriggers.includes(t)).length,1,
 'Re-installing does not create a duplicate active trigger');
console.log('PASS: Apps Script compiles, Supabase filters, server-key header, AEST/AEDT, report totals, MailApp and idempotent Monday trigger');
