// Dependency-free kiosk regression tests. Run: node survey/test_kiosk.js
// No real Supabase requests or real customer records are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const match = html.match(/<script>\n(\(\(\) => \{[\s\S]*?\}\)\(\);)\n<\/script>/);
assert.ok(match, 'Self-contained survey JavaScript exists in index.html');
const code = match[1];
assert.doesNotThrow(() => new Function(code), 'Survey JavaScript compiles');
const translated = code.match(/const LANGUAGE_PACKS = (\{[^\n]*\});/);
assert.ok(translated, 'Embedded language translations exist');
const packs = JSON.parse(translated[1]);
const questionSizes = [5, 8, 7, 6, 9];
assert.equal(Object.keys(packs).length, 11, '11 selectable languages including English');
for (const [language, data] of Object.entries(packs)) {
  assert.equal(data.ui.length, 21, language + ' has complete interface');
  assert.equal(data.q.length, 5, language + ' has five questions');
  data.q.forEach((q, i) => {
    assert.equal(q.length, questionSizes[i], language + ' Q' + (i + 1) + ' has complete choices');
    assert.ok(q.every(s => typeof s === 'string' && s.trim()), language + ' has no empty text');
  });
}
assert.ok(!html.includes('sb_secret_'), 'No server-side Supabase secret in public HTML');
assert.ok(!html.includes('RSSL_GMAIL_APP_PASSWORD'), 'No Gmail App Password in public HTML');

class Node {
  constructor(tag) {
    this.tag = tag; this.children = []; this.events = {};
    this.className = ''; this.textContent = ''; this.value = ''; this.hidden = false;
  }
  append(...x) { this.children.push(...x); }
  replaceChildren(...x) { this.children = x; }
  addEventListener(kind, fn) { this.events[kind] = fn; }
  setAttribute(key, value) { this[key] = value; }
  click() { assert.ok(this.events.click, 'Element has click handler'); this.events.click({type:'click'}); }
}
function descendants(root, fn) {
  const found = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (fn(node)) found.push(node);
    for (const child of node.children || []) walk(child);
  }
  walk(root);
  return found;
}
function browser(mode='success', offline=false) {
  const e = {};
  for (const id of ['view','connection','setup-banner','survey-language','footer-message']) e[id] = new Node('div');
  const document = {
    getElementById: id => e[id], createElement: tag => new Node(tag),
    addEventListener() {}, documentElement: {lang:'en'},
  };
  const window = {
    RSSL_CONFIG: {supabaseUrl:'https://example.supabase.co', publishableKey:'sb_publishable_TEST'},
    events: {},
    addEventListener(kind, handler) { this.events[kind] = handler; },
  };
  const navigator = {onLine:!offline};
  const localStorage = {
    map:new Map(), getItem(key) { return this.map.get(key) || null; },
    setItem(key, value) { this.map.set(key, value); },
  };
  let uuidCount = 0;
  const crypto = {randomUUID: () => '00000000-0000-4000-8000-' + String(++uuidCount).padStart(12,'0')};
  const calls = [];
  async function fetch(url, options) {
    calls.push({url, options});
    if (mode === 'conflict') {
      return {ok:false,status:409,text:async()=>JSON.stringify({code:'23514',message:'check constraint'})};
    }
    if (mode === 'duplicate') {
      return {ok:false,status:409,text:async()=>JSON.stringify({code:'23505',message:'duplicate key'})};
    }
    return {ok:true,status:201,text:async()=>''};
  }
  const run = new Function(
    'window','document','navigator','self','crypto','fetch','localStorage',
    'setTimeout','clearTimeout','setInterval','AbortController','console',code
  );
  run(window, document, navigator, {crypto}, crypto, fetch, localStorage,
    ()=>1, ()=>{}, ()=>{}, class { constructor() { this.signal = {}; } abort() {} },
    {error(){}}
  );
  return {
    e, window, navigator, localStorage, calls,
    elements: predicate => descendants(e.view, predicate),
    click(cls) {
      const found = descendants(e.view, x => x.className === cls);
      assert.ok(found.length, cls + ' button exists');
      found[0].click();
    },
    language(lang) {
      e['survey-language'].value = lang;
      e['survey-language'].events.change();
    },
    queued() { return JSON.parse(localStorage.getItem('rssl-survey-pending-v1') || '[]'); },
  };
}
const settle = async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
async function test() {
  const s=browser();
  assert.equal(s.elements(x=>x.tag==='h1')[0].textContent, packs.en.ui[1]);
  s.language('ja');
  assert.equal(s.elements(x=>x.tag==='h1')[0].textContent, packs.ja.ui[1]);
  s.click('big-button');
  assert.equal(s.elements(x=>x.tag==='h2')[0].textContent, packs.ja.q[0][0]);
  for(let i=0;i<5;i++)s.click('option');
  await settle();
  assert.equal(s.calls.length, 1, 'One response posted');
  const payload = JSON.parse(s.calls[0].options.body);
  assert.deepEqual(
    [payload.visit_type,payload.discovery_source,payload.google_today,payload.experience,payload.improvement],
    ['first','google_maps','maps','excellent','nothing'],
    'Translated responses stored in stable English-coded columns'
  );
  assert.equal(s.queued().length, 0, 'Successful response removed from queue');
  assert.equal(s.elements(x=>x.className.startsWith('note-box'))[0].textContent,packs.ja.ui[12]);
  s.click('big-button');
  assert.equal(s.e['survey-language'].value, 'en', 'Next customer starts in English');

  const off=browser('success',true);
  off.language('zh-CN');
  off.click('big-button');
  for(let i=0;i<5;i++)off.click('option');
  await settle();
  assert.equal(off.calls.length,0,'No attempt while offline');
  assert.equal(off.queued().length,1,'Response queued while offline');
  off.navigator.onLine=true; off.window.events.online(); await settle();
  assert.equal(off.calls.length,1,'Queued response retried');
  assert.equal(off.queued().length,0,'Queued response removed on acknowledgement');

  const conflict=browser('conflict');
  conflict.click('big-button');
  for(let i=0;i<5;i++)conflict.click('option');
  await settle();
  assert.equal(conflict.queued().length,1,'Non-duplicate 409 is not swallowed');

  const duplicate=browser('duplicate');
  duplicate.click('big-button');
  for(let i=0;i<5;i++)duplicate.click('option');
  await settle();
  assert.equal(duplicate.queued().length,0,'Real duplicate key is idempotent');

  const skipped=browser();
  skipped.click('big-button');
  for(let i=0;i<5;i++)skipped.click('link-button skip');
  await settle();
  assert.equal(skipped.calls.length,0,'All-skipped response not inserted');

  console.log('PASS: 11 language packs, native UI, saved English codes, reset, offline retry, HTTP errors, empty response');
}
test().catch(error => {console.error(error);process.exitCode=1;});
