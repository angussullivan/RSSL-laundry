// Self-contained service-worker cache tests. Run: node survey/test_sw.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const code = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  const events = {};
  const deleted = [];
  const stored = new Map();
  const oldKeys = ['rssl-survey-app-v1','rssl-kiosk-v2','unrelated-site-cache'];
  let online = true, hits=0;
  const cache = {
    async addAll(paths){for(const p of paths)stored.set(p, {ok:true,text:'cached '+p});},
    async match(req){const key=typeof req==='string'?req:req.url;return stored.get(key)||null;},
    async put(req,response){stored.set(typeof req==='string'?req:req.url,response);},
  };
  const caches = {
    async open(key){assert.equal(key,'rssl-kiosk-v3');return cache;},
    async keys(){return [...oldKeys];},
    async delete(key){deleted.push(key);return true;},
  };
  const self = {
    registration:{scope:'https://example.com/survey/'},
    location:{origin:'https://example.com'},
    clients:{claim:async()=>{}},
    skipWaiting:async()=>{},
    addEventListener(kind,fn){events[kind]=fn;},
  };
  async function fetch(request){
    hits++;
    if(!online) throw new Error('No internet');
    return {ok:true,marker:'network',clone(){return this;}};
  }
  new Function('self','caches','fetch','URL',code)(self,caches,fetch,URL);
  assert.deepEqual(Object.keys(events).sort(),['activate','fetch','install']);

  let promise;
  events.install({waitUntil(p){promise=p;}});
  await promise;
  assert.ok(stored.has('./index.html'),'Kiosk entry point cached');

  events.activate({waitUntil(p){promise=p;}});
  await promise;
  assert.deepEqual(deleted.sort(),['rssl-kiosk-v2','rssl-survey-app-v1'],
    'Only survey-owned old caches are deleted');

  function navigation(url){
    let responsePromise;
    events.fetch({request:{url,mode:'navigate',method:'GET'},
                  respondWith(p){responsePromise=p;}});
    return responsePromise;
  }
  const live=await navigation('https://example.com/survey/?v=5');
  assert.equal(live.marker,'network','Online request uses newest page');
  assert.equal(stored.get('./index.html').marker,'network','Canonical entry refreshed');

  online=false;
  const cached=await navigation('https://example.com/survey/?v=6');
  assert.equal(cached.marker,'network','Offline navigation falls back to latest cached page');

  let outsideHandled=false;
  events.fetch({
    request:{url:'https://example.com/',mode:'navigate',method:'GET'},
    respondWith(){outsideHandled=true;},
  });
  assert.equal(outsideHandled,false,'Service worker cannot control the main laundry homepage');
  console.log('PASS: offline service worker install, cache upgrade, online refresh, offline reopen, path isolation');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
