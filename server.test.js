import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './server.js';
async function run(options, callback){const s=createServer(options);await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await callback(`http://127.0.0.1:${s.address().port}`);}finally{await new Promise(r=>s.close(r));}}
test('editor loads and publishing is unavailable without credentials',()=>run({},async base=>{assert.equal((await fetch(base)).status,200);assert.deepEqual(await(await fetch(base+'/api/status')).json(),{configured:false});assert.equal((await fetch(base+'/api/publish',{method:'POST'})).status,503);}));
test('text post forwards to the configured page without exposing the token',()=>run({token:'test-secret',pageId:'123',version:'v99.0',fetchImpl:async(url,opts)=>{assert.equal(url,'https://graph.facebook.com/v99.0/123/feed');assert.equal(opts.body.get('message'),'Ren bil');assert.equal(opts.body.get('access_token'),'test-secret');return Response.json({id:'123_456'});}},async base=>{const r=await fetch(base+'/api/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:' Ren bil '})});assert.deepEqual(await r.json(),{id:'123_456'});}));
test('rejects cross-origin posting',()=>run({},async base=>{assert.equal((await fetch(base+'/api/publish',{method:'POST',headers:{Origin:'https://other.example'}})).status,403);}));
test('Facebook rejection is reported without leaking its response',()=>run({token:'secret',pageId:'123',version:'v99.0',fetchImpl:async()=>Response.json({error:{message:'secret'}},{status:403})},async base=>{const r=await fetch(base+'/api/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Test'})});assert.equal(r.status,502);assert.ok(!(await r.text()).includes('secret'));}));

test('business templates preserve prices, booking and travel conditions',async()=>{
  const {makePost}=await import('./public/business.js');
  const post=makePost();
  for(const text of ['BASIS – 349 kr.','GRUNDIG – 549 kr.','DYBDERENS – fra 849 kr.','42 30 01 68','https://m.me/61595933881305','100 kr. + 5 kr. pr. ekstra kilometer','adgang til strøm','fuldstændig fjernelse kan ikke garanteres']) assert.ok(post.includes(text),text);
  assert.ok(makePost('dybderens').startsWith('✨ DYBDERENS – fra 849 kr.'));
});
test('business module is served for browser-generated posts',()=>run({},async base=>{const r=await fetch(base+'/business.js');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);assert.match(await r.text(),/export const business/);}));
