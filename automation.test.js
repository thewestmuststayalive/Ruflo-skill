import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Automation,scheduleSlots,generateImage} from './automation.js';

test('three weekly evening slots follow Copenhagen daylight saving time',()=>{
  const slots=scheduleSlots(new Date('2026-10-21T00:00:00Z'),10).map(d=>d.toISOString());
  assert.ok(slots.includes('2026-10-23T16:00:00.000Z'));
  assert.ok(slots.includes('2026-10-26T17:00:00.000Z'));
  assert.equal(scheduleSlots(new Date('2026-11-01T00:00:00Z'),7).length,3);
});
const job=(a,id='test',due='2026-10-26T17:00:00.000Z')=>a.db.prepare('INSERT INTO jobs(id,due,topic,message) VALUES(?,?,?,?)').run(id,due,'basis','BW Bilpleje');
const options={imagesEnabled:true,path:':memory:',ready:()=>true,now:()=>new Date('2026-10-26T17:01:00Z'),generateImage:async()=>'image',publish:async()=>({id:'posted'})};

test('automation defaults to paused and never posts without activation',async()=>{
  const a=new Automation({...options,publish:async()=>{assert.fail('must not publish');}});try{job(a);await a.tick();assert.equal(a.isEnabled(),false);assert.equal(a.db.prepare("SELECT state FROM jobs WHERE id='test'").get().state,'queued');}finally{a.close();}
});
test('successful scheduled post is persisted and not repeated on later ticks',async()=>{
  let calls=0;const a=new Automation({...options,publish:async()=>{calls++;return{id:'fb_1'};}});
  try{job(a);a.enable();await a.tick();await a.tick();assert.equal(calls,1);assert.equal(a.db.prepare("SELECT facebook_id FROM jobs WHERE id='test'").get().facebook_id,'fb_1');}finally{a.close();}
});
test('unknown publishing outcome pauses automation and is never retried automatically',async()=>{
  let calls=0;const a=new Automation({...options,publish:async()=>{calls++;const e=new Error();e.uncertain=true;throw e;}});
  try{job(a);a.enable();await a.tick();await a.tick();assert.equal(calls,1);assert.equal(a.isEnabled(),false);assert.equal(a.db.prepare("SELECT state FROM jobs WHERE id='test'").get().state,'review');assert.throws(()=>a.enable(),/Kontrollér/);a.resolve('test');a.enable();await a.tick();assert.equal(calls,1);}finally{a.close();}
});
test('restarts preserve jobs and flag interrupted publishing without resending',()=>{
  const dir=mkdtempSync(join(tmpdir(),'bw-test-'));const path=join(dir,'test.sqlite');
  try{let a=new Automation({...options,path});job(a);a.enable();a.db.prepare("UPDATE jobs SET state='publishing' WHERE id='test'").run();a.close();a=new Automation({...options,path});assert.equal(a.isEnabled(),false);assert.equal(a.db.prepare("SELECT state FROM jobs WHERE id='test'").get().state,'review');a.close();}finally{rmSync(dir,{recursive:true});}
});
test('late posts are skipped instead of publishing a backlog',async()=>{
  const a=new Automation({...options,publish:async()=>assert.fail('must not publish stale post')});try{job(a,'old','2026-10-25T17:00:00.000Z');a.enable();await a.tick();assert.equal(a.db.prepare("SELECT state FROM jobs WHERE id='old'").get().state,'skipped');}finally{a.close();}
});
test('image generation failure pauses without attempting Facebook publication',async()=>{
  const a=new Automation({...options,generateImage:async()=>{throw new Error('API limit');},publish:async()=>assert.fail('must not publish without image')});
  try{job(a);a.enable();await a.tick();assert.equal(a.isEnabled(),false);assert.equal(a.db.prepare("SELECT state FROM jobs WHERE id='test'").get().state,'failed');}finally{a.close();}
});
test('image generator uses one image, low quality, no fabricated before/after claims',async()=>{
  const result=await generateImage('basis',{key:'test-only',fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/images/generations');const body=JSON.parse(opts.body);assert.equal(body.n,1);assert.equal(body.quality,'low');assert.match(body.prompt,/no before-and-after/i);return Response.json({data:[{b64_json:'/9j/AA=='}]});}});
  assert.equal(result,'data:image/jpeg;base64,/9j/AA==');
});

test('pausing during image generation prevents subsequent Facebook publishing',async()=>{
  let release,started;const generated=new Promise(r=>started=r);const wait=new Promise(r=>release=r);
  const a=new Automation({...options,generateImage:async()=>{started();await wait;return'image';},publish:async()=>assert.fail('paused job must not publish')});
  try{job(a);a.enable();const tick=a.tick();await generated;a.setEnabled(false);release();await tick;assert.equal(a.db.prepare("SELECT state FROM jobs WHERE id='test'").get().state,'skipped');}finally{a.close();}
});

test('text-only automation publishes without generating or requiring images',async()=>{
  let published;
  const a=new Automation({...options,imagesEnabled:false,generateImage:async()=>assert.fail('must not call image API'),publish:async data=>{published=data;return{id:'text-post'};}});
  try{job(a);a.enable();assert.equal(a.snapshot().imagesEnabled,false);await a.tick();assert.equal(published.image,undefined);assert.ok(published.message.includes('BASIS – 349 kr.'));assert.ok(!published.message.includes('AI-genereret'));assert.equal(a.db.prepare("SELECT state FROM jobs WHERE id='test'").get().state,'published');}finally{a.close();}
});
test('turning off images removes illustration labels from queued posts',()=>{
  const a=new Automation({...options,imagesEnabled:false});try{job(a);a.db.prepare("UPDATE jobs SET message=message||' Billedet er en AI-genereret illustration.' WHERE id='test'").run();a.snapshot();assert.ok(!a.db.prepare("SELECT message FROM jobs WHERE id='test'").get().message.includes('AI-genereret'));}finally{a.close();}
});
