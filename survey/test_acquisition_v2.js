// Tests use mocked DOM and Supabase. Feature gate remains false in production.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const match=html.match(/<script>\n(\(\(\) => \{[\s\S]*?\}\)\(\);)\n<\/script>/);
assert.ok(match,'inline kiosk exists');
const src=match[1];
assert.ok(src.includes('const ACQUISITION_V2_ENABLED = false;'),'safe production gate is off');
const packs=JSON.parse(src.match(/const ACQUISITION_PACKS = (\{[^\n]*\});/)[1]);
assert.equal(Object.keys(packs).length,11);
for(const [lang,p] of Object.entries(packs)){
  for(const [key,n] of [['q2',10],['q4',10],['q5',7]]){
    assert.equal(p[key].length,n,lang+' '+key+' choices');
    assert.ok(p[key].every(x=>typeof x==='string'&&x.trim().length),lang+' '+key+' complete');
  }
}
class Node {
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.className='';this.textContent='';this.value='';}
  append(...arr){this.children.push(...arr);}
  replaceChildren(...arr){this.children=arr;}
  addEventListener(key,cb){this.events[key]=cb;}
  setAttribute(key,val){this[key]=val;}
  click(){assert.equal(typeof this.events.click,'function');this.events.click({});}
}
function all(root,pred){
  const out=[];function visit(n){if(!n||typeof n!=='object')return;if(pred(n))out.push(n);for(const child of n.children||[])visit(child);}
  visit(root);return out;
}
function simulate(v2,preview){
  const elements=Object.fromEntries(['view','connection','setup-banner','footer-message'].map(k=>[k,new Node('div')]));
  const doc={getElementById:k=>elements[k],createElement:k=>new Node(k),addEventListener(){},documentElement:{lang:'en'}};
  const win={RSSL_CONFIG:{supabaseUrl:'https://mfsdnfhoifahvlsjzzxf.supabase.co',publishableKey:'sb_publishable_TEST'},location:{search:preview?'?preview_v2=1':''},
    callbacks:{},addEventListener(k,f){this.callbacks[k]=f;}};
  const storage=new Map();
  const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
  const posts=[];let counter=1;
  const crypto={randomUUID:()=> '00000000-0000-4000-8000-'+String(counter++).padStart(12,'0')};
  const fetch=async(url,opts)=>{posts.push(JSON.parse(opts.body));return{ok:true,status:201,text:async()=>''};};
  const code=v2?src.replace('const ACQUISITION_V2_ENABLED = false;','const ACQUISITION_V2_ENABLED = true;'):src;
  new Function('window','document','navigator','self','crypto','fetch','localStorage','setTimeout',
    'clearTimeout','setInterval','AbortController','console',code)
    (win,doc,{onLine:true},{crypto},crypto,fetch,localStorage,()=>1,()=>{},()=>{},
    class{constructor(){this.signal={}}abort(){}},{error(){}});
  const find=(name)=>all(elements.view,n=>n.className===name);
  const click=(cls,index=0)=>{const matches=find(cls);assert.ok(matches[index],cls+' index '+index);matches[index].click();};
  const lang=(code)=>{const t=all(elements.view,n=>n.className==='language-tile'&&n.lang===code);assert.equal(t.length,1);t[0].click();};
  return {posts,elements,doc,find,click,lang};
}
async function settle(){for(let i=0;i<55;i++)await Promise.resolve();}
(async()=>{
  for(const code of Object.keys(packs)){
    const s=simulate(true,false);s.lang(code);
    assert.equal(s.find('option').length,3);
    s.click('option',0); // first
    assert.equal(s.find('option').length,8,'extended discovery list');
    assert.equal(all(s.elements.view,n=>n.tag==='h2')[0].textContent,packs[code].q2[0]);
    s.click('option',4); // hotel referral
    s.click('option',0); // Google Maps today
    assert.equal(all(s.elements.view,n=>n.tag==='h2')[0].textContent,packs[code].q4[0]);
    assert.equal(s.find('option').length,8);
    s.click('option',0); // convenience
    assert.equal(all(s.elements.view,n=>n.tag==='h2')[0].textContent,packs[code].q5[0]);
    assert.equal(s.find('option').length,5);
    s.click('option',2); // staying nearby
    await settle();
    assert.equal(s.posts.length,1,code+' insert');
    const p=s.posts[0];
    assert.equal(p.visit_type,'first');
    assert.equal(p.discovery_source,'other','legacy category mapped');
    assert.equal(p.discovery_detail,'host_referral');
    assert.equal(p.google_today,'maps');
    assert.equal(p.choice_reason,'location');
    assert.equal(p.customer_context,'staying_nearby');
    assert.equal(p.experience,null);
    assert.equal(p.improvement,null);
    assert.equal(p.survey_version,2);
    assert.equal(p.survey_language,code);
    s.click('big-button');
    assert.equal(s.find('language-tile').length,11,'reset to language choice');
    assert.equal(s.doc.documentElement.lang,'en');
  }
  const r=simulate(true,false);r.lang('fr');r.click('option',1); // returning
  r.click('option',5); // Apple maps
  r.click('option',3); // no Google
  assert.equal(r.find('option').length,4,'existing service feedback question retained');
  r.click('option',1);r.click('option',0);
  await settle();
  assert.equal(r.posts.length,1);
  assert.equal(r.posts[0].discovery_source,'other');
  assert.equal(r.posts[0].discovery_detail,'apple_maps');
  assert.equal(r.posts[0].experience,'good');
  assert.equal(r.posts[0].improvement,'nothing');
  assert.equal(r.posts[0].choice_reason,null);
  assert.equal(r.posts[0].customer_context,null);

  const u=simulate(true,false);u.lang('en');u.click('option',2);
  u.click('option',6);u.click('option',3);u.click('option',7);u.click('option',4);
  await settle();
  assert.equal(u.posts[0].visit_type,'unsure');
  assert.equal(u.posts[0].discovery_detail,'other');
  assert.equal(u.posts[0].choice_reason,'other');
  assert.equal(u.posts[0].customer_context,'prefer_not');

  const pv=simulate(false,true);pv.lang('ja');
  for(let i=0;i<5;i++)pv.click('option',0);
  await settle();
  assert.equal(pv.posts.length,0,'preview never posts');
  assert.ok(pv.find('note-box')[0].textContent.includes('プレビュー'));

  const old=simulate(false,false);old.lang('es');old.click('option',0);
  assert.equal(old.find('option').length,6,'legacy screen unchanged');
  for(let i=0;i<4;i++)old.click('option',0);
  await settle();assert.equal(old.posts.length,1);
  assert.ok(!Object.hasOwn(old.posts[0],'survey_version'),'old production payload preserved');
  assert.ok(!Object.hasOwn(old.posts[0],'choice_reason'));
  console.log('PASS: eleven language acquisition branches, new/returning records, preview no-write and legacy production');
})().catch(e=>{console.error(e);process.exitCode=1;});
