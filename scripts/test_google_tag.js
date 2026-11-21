// Placeholder Google tag must not call Google. Run: node scripts/test_google_tag.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'google-tag-config.js'), 'utf8');
const home = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const survey = fs.readFileSync(path.join(__dirname, '..', 'survey', 'index.html'), 'utf8');

function run(src, online) {
  const scripts = [];
  const listeners = [];
  const window = {
    listeners: [],
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      this.listeners = this.listeners.filter(item => item.fn !== fn || item.type !== type);
    }
  };
  const document = {
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
    createElement() { return { async: false, src: '', onerror: null }; },
    head: { appendChild(node) { scripts.push(node); } },
    documentElement: { appendChild(node) { scripts.push(node); } }
  };
  const navigator = { onLine: online };
  new Function('window', 'document', 'navigator', src)(window, document, navigator);
  return { window, document, scripts, listeners };
}

function eventsOf(windowObj) {
  return (windowObj.dataLayer || []).map(item => Array.from(item));
}

function click(listeners, link) {
  const handler = listeners.find(item => item.type === 'click');
  assert.ok(handler, 'click listener registered');
  handler.fn({ target: { closest: sel => (sel === 'a' ? link : null) } });
}

const link = (href, text, track) => ({
  href,
  textContent: text,
  getAttribute(name) {
    if (name === 'href') return href;
    if (name === 'data-track') return track || null;
    return null;
  }
});

const off = run(source, true);
assert.equal(off.scripts.length, 0, 'Placeholder IDs do not insert gtag.js');
assert.equal(off.window.gtag, undefined, 'Placeholder IDs do not define gtag');
assert.equal(off.window.RSSL_GOOGLE_TAG.ga4MeasurementId, 'G-XXXXXXX');
assert.equal(off.window.RSSL_GOOGLE_TAG.googleAdsId, 'AW-XXXXXXXXX');
click(off.listeners, link('https://maps.app.goo.gl/example', 'Get Directions', 'get_directions'));
click(off.listeners, link('sms:+61447488879', 'Text us'));
assert.equal(off.window.dataLayer, undefined, 'Taps do nothing until IDs are real');

const offline = run(
  source.replace("'G-XXXXXXX'", "'G-AB12CD34EF'").replace("'AW-XXXXXXXXX'", "'AW-1234567890'"),
  false
);
assert.equal(offline.scripts.length, 0, 'Offline browser does not request gtag.js');
assert.equal(offline.window.listeners.some(item => item.type === 'online'), true, 'Tag waits until online');

const liveSrc = source
  .replace("'G-XXXXXXX'", "'G-AB12CD34EF'")
  .replace("'AW-XXXXXXXXX'", "'AW-1234567890'")
  .replace("get_directions: ''", "get_directions: 'DirLabel01'")
  .replace("text_us: ''", "text_us: 'TextLabel1'")
  .replace("contact: ''", "contact: 'ContactLab1'");
const live = run(liveSrc, true);
assert.equal(live.scripts.length, 1, 'Real IDs insert one gtag.js script');
assert.match(live.scripts[0].src, /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-AB12CD34EF$/);
const configured = eventsOf(live.window).map(item => item[1]);
assert.ok(configured.includes('G-AB12CD34EF'), 'GA4 property configured');
assert.ok(configured.includes('AW-1234567890'), 'Ads tag configured');

click(live.listeners, link('https://maps.app.goo.gl/hxygq5tBSLVebkU29?g_st=com.google.maps.preview.copy', 'Open in Google Maps'));
click(live.listeners, link('sms:+61447488879', '0447 488 879'));
click(live.listeners, link('#about', 'Learn more'));
const names = eventsOf(live.window).map(item => item[1]);
assert.equal(names.filter(name => name === 'get_directions').length, 1);
assert.equal(names.filter(name => name === 'text_us').length, 1);
assert.equal(names.filter(name => name === 'contact').length, 0, 'contact is a label slot, not a second Analytics event');
const conversions = eventsOf(live.window).filter(item => item[1] === 'conversion').map(item => item[2].send_to);
assert.deepEqual(conversions.sort(), [
  'AW-1234567890/ContactLab1',
  'AW-1234567890/DirLabel01',
  'AW-1234567890/TextLabel1'
]);

const blankLabels = run(source.replace("'G-XXXXXXX'", "'G-AB12CD34EF'"), true);
click(blankLabels.listeners, link('sms:+61477314754', 'Text', 'text_us'));
assert.equal(eventsOf(blankLabels.window).some(item => item[1] === 'text_us'), true);
assert.equal(eventsOf(blankLabels.window).some(item => item[1] === 'conversion'), false, 'Blank labels do not send Ads conversions');

assert.match(home, /src="\/google-tag-config\.js"/);
assert.match(home, /data-track="get_directions"/);
assert.match(home, /data-track="text_us"/);
assert.match(home, /sms:\+61447488879/);
assert.doesNotMatch(home, /href="tel:/i);
assert.match(home, /id="live-view"[^>]*hidden/);
assert.match(home, /https:\/\/www\.reservoirlaundry\.com\.au\//);
assert.doesNotMatch(home, /https?:\/\/reservoirlaundry\.com\.au/i);
assert.doesNotMatch(survey, /googletagmanager\.com/, 'Survey shell does not reference Google');
assert.match(survey, /google-tag-config\.js/);
assert.match(survey, /navigator\.onLine === false/, 'Survey does not load the tag while offline');

console.log('PASS: placeholder tag stays off, offline skips gtag.js, directions and SMS events carry Ads labels');
