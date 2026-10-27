import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from './worker.js';
import {init,setSetting,getSetting,runScheduled,snapshot} from './store.js';
import {saveToken,readToken,beginLogin,completeLogin} from './login.js';

// Exercise production SQL against SQLite with the same async interface as D1.
class D1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');}
  prepare(sql){const db=this.sqlite;let args=[];const statement={bind(...values){args=values;return statement;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const result=db.prepare(sql).run(...args);return{meta:{changes:result.changes}};}};return statement;}
  async batch(statements){return Promise.all(statements.map(s=>s.run()));}
  close(){this.sqlite.close();}
}
const password='local-test-password-at-least-20';
function env(){return {DB:new D1(),APP_PASSWORD:password,FACEBOOK_PAGE_ID:'61595933881305',META_GRAPH_VERSION:'v99.0',ASSETS:{fetch:async()=>new Response('editor')}};}
const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
const request=(path,options={})=>new Request('https://bw.example'+path,{headers,...options});

test('free worker protects assets and APIs but exposes health status',async()=>{
 const e=env();try{assert.equal((await worker.fetch(new Request('https://bw.example/'),e)).status,401);assert.equal((await worker.fetch(request('/'),e)).status,200);assert.equal((await worker.fetch(new Request('https://bw.example/health'),e)).status,200);}finally{e.DB.close();}
});
test('worker cannot activate without Facebook and never requires AI configuration',async()=>{
 const e=env();try{let r=await worker.fetch(request('/api/automation'),e);const data=await r.json();assert.equal(data.imagesEnabled,false);assert.equal(data.enabled,false);assert.equal(data.jobs.length,12);r=await worker.fetch(request('/api/automation',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"action":"enable"}'}),e);assert.equal(r.status,409);}finally{e.DB.close();}
});
test('worker rejects cross-origin changes',async()=>{
 const e=env();try{const r=await worker.fetch(request('/api/automation',{method:'POST',headers:{...headers,Origin:'https://other.example','Content-Type':'application/json'},body:'{"action":"pause"}'}),e);assert.equal(r.status,403);}finally{e.DB.close();}
});
test('scheduled worker publishes text once across repeated invocations',async()=>{
 const e=env();let calls=0;try{await init(e.DB);await setSetting(e.DB,'enabled','true');const opts={scheduledTime:Date.parse('2026-10-26T17:00:00Z'),now:new Date('2026-10-26T17:00:01Z'),ready:true,publish:async data=>{calls++;assert.equal(data.image,undefined);assert.ok(data.message.includes('42 30 01 68'));return{id:'fb_1'};}};await runScheduled(e.DB,opts);await runScheduled(e.DB,opts);assert.equal(calls,1);assert.equal((await e.DB.prepare('SELECT state FROM jobs').first()).state,'published');}finally{e.DB.close();}
});
test('competing cron invocations atomically claim only one post',async()=>{
 const e=env();let calls=0;try{await init(e.DB);await setSetting(e.DB,'enabled','true');const opts={scheduledTime:Date.parse('2026-10-26T17:00:00Z'),now:new Date('2026-10-26T17:00:01Z'),ready:true,publish:async()=>{calls++;return{id:'once'};}};await Promise.all([runScheduled(e.DB,opts),runScheduled(e.DB,opts)]);assert.equal(calls,1);}finally{e.DB.close();}
});
test('cron handles Danish summer and winter time and ignores the extra UTC slot',async()=>{
 for(const [due,expected]of [['2026-10-23T16:00:00Z',1],['2026-10-23T17:00:00Z',0],['2026-10-26T16:00:00Z',0],['2026-10-26T17:00:00Z',1]]){
  const e=env();let calls=0;try{await init(e.DB);await setSetting(e.DB,'enabled','true');await runScheduled(e.DB,{scheduledTime:Date.parse(due),now:new Date(due),ready:true,publish:async()=>{calls++;return{id:'test'};}});assert.equal(calls,expected,due);}finally{e.DB.close();}
 }
});
test('ambiguous Facebook response pauses cron and cannot be resent by repeating trigger',async()=>{
 const e=env();let calls=0;try{await init(e.DB);await setSetting(e.DB,'enabled','true');const opts={scheduledTime:Date.parse('2026-10-26T17:00:00Z'),now:new Date('2026-10-26T17:00:01Z'),ready:true,publish:async()=>{calls++;const error=new Error();error.uncertain=true;throw error;}};await runScheduled(e.DB,opts);await runScheduled(e.DB,opts);assert.equal(calls,1);assert.equal(await getSetting(e.DB,'enabled'),'false');assert.equal((await e.DB.prepare('SELECT state FROM jobs').first()).state,'review');}finally{e.DB.close();}
});
test('interrupted invocation is marked for review and disables subsequent publishing',async()=>{
 const e=env();try{await init(e.DB);await setSetting(e.DB,'enabled','true');await e.DB.prepare("INSERT INTO jobs(id,due,topic,message,state,claimed_at) VALUES('old','2026-10-26T17:00:00Z','basis','old','publishing','2026-10-26T17:00:00Z')").run();const data=await snapshot(e.DB,true,new Date('2026-10-26T18:00:00Z'));assert.equal(data.enabled,false);assert.equal(data.jobs.find(j=>j.id==='old').state,'review');}finally{e.DB.close();}
});
test('D1 stores encrypted tokens and public status does not reveal credentials',async()=>{
 const e=env();try{await init(e.DB);await saveToken(e,'page-secret');assert.equal(await readToken(e),'page-secret');assert.ok(!(await getSetting(e.DB,'facebook_token')).includes('page-secret'));const status=await(await worker.fetch(request('/api/facebook'),e)).json();assert.equal(status.connected,true);assert.ok(!JSON.stringify(status).includes('page-secret'));}finally{e.DB.close();}
});
test('OAuth state survives separate worker requests and never selects another page',async()=>{
 const e={...env(),FACEBOOK_APP_ID:'123',FACEBOOK_APP_SECRET:'app-secret'};try{await init(e.DB);const {state}=await beginLogin(e,'https://bw.example');const fake=async url=>Response.json(new URL(url).pathname.endsWith('me/accounts')?{data:[{id:'wrong-page',access_token:'other'}]}:{access_token:'user-token'});await assert.rejects(completeLogin(e,{origin:'https://bw.example',state,code:'code',cookie:'wrong'},fake));await assert.rejects(completeLogin(e,{origin:'https://bw.example',state,code:'code',cookie:state},fake),/valgte side/);assert.equal(await readToken(e),null);}finally{e.DB.close();}
});

test('activation with a configured page token works without any AI key',async()=>{
 const e={...env(),FACEBOOK_PAGE_ACCESS_TOKEN:'test-only-token'};try{const response=await worker.fetch(request('/api/automation',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"action":"enable"}'}),e);assert.equal(response.status,200);const state=await response.json();assert.equal(state.ready,true);assert.equal(state.enabled,true);assert.equal(state.imagesEnabled,false);}finally{e.DB.close();}
});
