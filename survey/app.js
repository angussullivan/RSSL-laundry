(() => {
  'use strict';
  const cfg = window.RSSL_CONFIG || {};
  const live = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl || '') && !!cfg.publishableKey;
  const ENDPOINT = live ? cfg.supabaseUrl.replace(/\/$/,'') + '/rest/v1/rssl_customer_surveys' : '';
  const QUEUE_KEY = 'rssl-survey-pending-v1';
  const questions = [
    {key:'visit_type', title:'Is this your first visit?', help:'Tap one answer. There are just five quick questions.', choices:[['first','Yes, first time'],['repeat','No, I’ve been before'],['unsure','Prefer not to say']]},
    {key:'discovery_source', title:'How did you first hear about us?', help:'Think about when you originally discovered this laundry.', choices:[['google_maps','Google Maps'],['google_search','Google Search'],['walk_by','Walking past'],['recommendation','Friend or family'],['other','Something else'],['unsure','Can’t remember']]},
    {key:'google_today', title:'Did you use Google to find us today?', help:'This includes checking the address or requesting directions.', choices:[['maps','Yes — Google Maps'],['search','Yes — Google Search'],['both','Yes — both'],['no','No'],['unsure','Not sure']]},
    {key:'experience', title:'How has your visit been?', help:'No problem if you have only just arrived.', choices:[['excellent','Excellent'],['good','Good'],['needs_work','Could be better'],['not_finished','I haven’t finished yet']]},
    {key:'improvement', title:'What could we improve?', help:'Optional — choose the most important thing, or skip.', choices:[['nothing','Nothing — all good'],['machines','Machine availability'],['cleanliness','Cleanliness'],['prices','Pricing'],['payment','Card payment'],['instructions','Instructions / signage'],['other','Something else']]}
  ];
  const view=document.getElementById('view'), connection=document.getElementById('connection'), banner=document.getElementById('setup-banner');
  let step=-1, answers={}, idleHandle=null, thanksHandle=null, sending=false, lastUploadError=false;
  if (!live) banner.hidden=false;
  function el(tag,cls,txt){let n=document.createElement(tag); if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
  function panel(){const n=el('section','panel');view.replaceChildren(n);resetIdle();return n;}
  function clearTimers(){clearTimeout(idleHandle);clearTimeout(thanksHandle);}
  function resetIdle(){clearTimeout(idleHandle);if(step>=0 && step<questions.length) idleHandle=setTimeout(welcome,75000);}
  document.addEventListener('pointerdown',()=>{if(step>=0 && step<questions.length)resetIdle();},{passive:true});
  document.addEventListener('keydown',()=>{if(step>=0 && step<questions.length)resetIdle();});
  function welcome(){clearTimers();step=-1;answers={};const p=panel();
    const hero=el('div','hero-symbol'),sym=el('span','','✦');hero.append(sym,el('p','eyebrow','A little feedback makes a big difference'));p.append(hero);
    p.append(el('h1','', 'How did you find us?'),el('p','subtitle','Help your local laundromat get better. Five quick taps, around 20 seconds. No personal details.'));
    const b=el('button','big-button','Start survey  →');b.type='button';b.addEventListener('click',()=>renderQuestion(0));p.append(b,el('p','muted','Thank you for supporting an independent neighbourhood business.'));
  }
  function renderQuestion(idx){clearTimeout(thanksHandle);step=idx;const q=questions[idx],p=panel();
    const h=el('div','question-head');h.append(el('span','step',`QUESTION ${idx+1} OF ${questions.length}`));const prog=el('div','progress');prog.setAttribute('aria-label',`Question ${idx+1} of ${questions.length}`);questions.forEach((_,i)=>prog.append(el('b',i<=idx?'active':'')));h.append(prog);p.append(h,el('h2','question',q.title),el('p','help',q.help));
    const opts=el('div','options');q.choices.forEach(([value,label])=>{let b=el('button','option',label);b.type='button';b.addEventListener('click',()=>select(value));opts.append(b);});p.append(opts);
    const actions=el('div','actions');const back=el('button','link-button',idx===0?'Cancel':'← Back');back.type='button';back.addEventListener('click',()=>idx===0?welcome():renderQuestion(idx-1));actions.append(back);
    const skip=el('button','link-button skip',idx===4?'Skip & finish':'Skip this question →');skip.type='button';skip.addEventListener('click',()=>select(null));actions.append(skip);p.append(actions);
  }
  function select(value){if(step<0||step>=questions.length||sending)return;answers[questions[step].key]=value;const next=step+1;if(next<questions.length)renderQuestion(next);else submit();}
  function uuid(){if(self.crypto&&crypto.randomUUID)return crypto.randomUUID();throw new Error('Secure context required for new submissions');}
  function loadQueue(){try{const x=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
  function saveQueue(q){localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-250)));}
  async function send(payload){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const res=await fetch(ENDPOINT,{method:'POST',mode:'cors',cache:'no-store',signal:controller.signal,headers:{'apikey':cfg.publishableKey,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(payload)});
      if(res.ok||res.status===409)return true;
      const message=await res.text().catch(()=>'');
      throw new Error(`Submission failed (${res.status}): ${message.substring(0,250)}`);
    } finally { clearTimeout(timeout); }
  }
  let syncing=false;
  async function flush(){if(!live||syncing||!navigator.onLine)return;syncing=true;try{
    const queued=loadQueue();
    for(const payload of queued){
      try{
        await send(payload);
        lastUploadError=false;
        saveQueue(loadQueue().filter(item=>item.submission_id!==payload.submission_id));
      }catch(e){lastUploadError=true; console.error(e);break;}
    }
  }finally{syncing=false;updateConnection()}}
  async function submit(){if(sending)return;sending=true;const snapshot={...answers};clearTimers();step=questions.length;const p=panel();
    let result='demo';
    if(live){try{const payload={submission_id:uuid(),answered_at:new Date().toISOString(),visit_type:snapshot.visit_type??null,discovery_source:snapshot.discovery_source??null,google_today:snapshot.google_today??null,experience:snapshot.experience??null,improvement:snapshot.improvement??null};
      const pending=loadQueue();pending.push(payload);saveQueue(pending);result='queued';
      if(navigator.onLine){await flush();result=loadQueue().some(a=>a.submission_id===payload.submission_id)?'queued':'saved';}
    }catch(e){console.error(e);result='problem';}}
    p.append(el('div','complete-mark','✓'),el('h1','', 'Thank you!'),el('p','subtitle','Your feedback helps make Reservoir Street Laundry better for everyone.'));
    const msg=el('div','note-box'+((result==='queued'||result==='problem')?' warn':''));
    msg.textContent=result==='saved'?'Your anonymous response was received.':result==='queued'?(navigator.onLine?'Response saved on this tablet, but upload is not yet confirmed. Staff should check the connection.':'Response saved on this tablet. It will upload when the connection returns.'):result==='demo'?'Preview only — your answers were not saved.':'A device storage error occurred; please check setup.';p.append(msg);
    const b=el('button','big-button','Finish');b.addEventListener('click',welcome);p.append(b,el('p','muted','This screen resets automatically for the next customer.'));
    thanksHandle=setTimeout(welcome,9000);sending=false;updateConnection();
  }
  function updateConnection(){
    if(!live){connection.className='connection preview';connection.textContent='Preview';return;}
    let pending=loadQueue().length;if(!navigator.onLine){connection.className='connection offline';connection.textContent=`Offline · ${pending} pending`;}
    else if(pending){connection.className='connection offline';connection.textContent=lastUploadError?`Upload issue · ${pending} pending`:`${pending} waiting to sync`;}
    else{connection.className='connection online';connection.textContent='● Online · Ready';}
  }
  window.addEventListener('online',()=>{updateConnection();flush();});window.addEventListener('offline',updateConnection);
  window.addEventListener('storage',updateConnection);
  if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));}
  updateConnection();welcome();if(live){flush();setInterval(flush,30000);}
})();