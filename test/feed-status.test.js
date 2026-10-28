import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const controller=source.slice(source.indexOf('// Service messages are presentation only'),source.indexOf('// ── LIKES + IDB'));
function harness(){
 const notices=[],events={},timers=new Map();let nextTimer=0;
 const element=()=>{const classes=new Set();return {children:[],attributes:{},style:{},hidden:false,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},setAttribute(k,v){this.attributes[k]=v;},append(...items){this.children.push(...items);}};};
 const c=vm.createContext({navigator:{onLine:true},articles:[],curMode:'wiki',window:{addEventListener:(name,fn)=>{events[name]=fn;}},document:{createElement:element,querySelector:()=>({getBoundingClientRect:()=>({bottom:118})}),body:{appendChild:n=>notices.push(n)}},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(controller,c);
 return {c,notices,events,timers,status:c.WSFeedStatus};
}
test('service notice appears only after a failure and when there are cards to read',()=>{
 const h=harness();h.status.sync();assert.equal(h.notices.length,0);
 h.status.waiting();assert.equal(h.notices.length,0,'startup uses its own recovery card');
 h.c.articles.push({id:'w1'});h.status.sync();const notice=h.notices[0];
 assert.equal(notice.children[0].textContent,'Waiting for Wikipedia');assert.equal(notice.children[1].textContent,'We’ll retry automatically.');
 assert.equal(notice.style.top,'128px','sits under the header, clear of the card actions');assert.equal(notice.attributes.role,'status');assert.equal(notice.attributes['aria-live'],'polite');assert.equal(notice.hidden,false);assert.ok(notice.classList.contains('visible'));
 h.status.waiting();assert.equal(h.notices.length,1,'retries never duplicate the notice');
});
test('recovery clears the notice and a later failure cancels the old hide timer',()=>{
 const h=harness();h.c.articles.push({id:'w1'});h.status.waiting();h.status.recovered();const notice=h.notices[0];
 assert.equal(notice.attributes['aria-hidden'],'true');assert.equal(notice.classList.contains('visible'),false);
 assert.equal(h.timers.size,1);h.status.waiting();assert.equal(h.timers.size,0);assert.equal(notice.hidden,false);
 h.status.recovered();for(const fn of h.timers.values())fn();assert.equal(notice.hidden,true);
});
test('changing feed clears the notice, and offline mode does not blame Wikimedia',()=>{
 const h=harness();h.c.articles.push({id:'w1'});h.status.waiting();const notice=h.notices[0];
 h.events['feed-reset']();assert.equal(notice.hidden,true);h.c.curMode='how';h.status.sync();assert.equal(notice.hidden,true);
 h.status.waiting();assert.equal(notice.children[0].textContent,'Waiting for Wikivoyage');
 h.c.navigator.onLine=false;h.events.offline();assert.equal(notice.attributes['aria-hidden'],'true');
});
test('a normal unfinished batch and stale reply do not create an upstream outage notice',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('async function fetchWorkerBatch(',start);let waits=0;
 const c=vm.createContext({Date,curMode:'wiki',curLang:'en',fillGeneration:2,workerCooldownUntil:0,pendingWorkerBatch:null,articles:[{id:'w1'}],queue:[],WSFeedStatus:{waiting(){waits++;}}});
 vm.runInContext(source.slice(start,end),c);
 const response=code=>({status:503,headers:new Headers({'Retry-After':'2'}),json:async()=>({code})});
 await c.noteWorkerCooldown(response('batch_pending'),2,'wiki|en');assert.equal(waits,0);
 await c.noteWorkerCooldown(response('upstream_unavailable'),1,'wiki|en');assert.equal(waits,0);
 await c.noteWorkerCooldown(response('work_rate_limited'),2,'wiki|en');assert.equal(waits,0);
 await c.noteWorkerCooldown(response('upstream_rate_limited'),2,'wiki|en');assert.equal(waits,1);
});
