import {scheduleSlots,localParts} from '../schedule.js';
import {makePost} from '../public/business.js';
const schemas=new WeakMap();
export async function init(db){
  if(!schemas.has(db))schemas.set(db,db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,due TEXT NOT NULL,topic TEXT NOT NULL,message TEXT NOT NULL,state TEXT NOT NULL,facebook_id TEXT,error TEXT,claimed_at TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS oauth_states(state TEXT PRIMARY KEY,expires INTEGER NOT NULL)')
  ]).catch(error=>{schemas.delete(db);throw error;}));
  await schemas.get(db);
}
export async function getSetting(db,key){return (await db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first())?.value;}
export async function setSetting(db,key,value){await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,String(value)).run();}
export function slotJob(date){
  const p=localParts(date);const id=`${p.year}-${p.month}-${p.day}`;const topic=['basis','grundig','dybderens'][Math.floor(date.getTime()/86400000)%3];
  return {id,due:date.toISOString(),topic,message:makePost(topic),state:'queued'};
}
export async function recover(db,now=new Date()){
  await db.prepare("UPDATE jobs SET state='review',error='Udgivelsen blev afbrudt. Kontrollér Facebook-siden før genaktivering.' WHERE state='publishing' AND claimed_at<?").bind(new Date(now.getTime()-10*60000).toISOString()).run();
  if(await db.prepare("SELECT id FROM jobs WHERE state='review' LIMIT 1").first())await setSetting(db,'enabled','false');
}
export async function snapshot(db,ready,now=new Date()){
  await recover(db,now);
  const rows=(await db.prepare('SELECT * FROM jobs ORDER BY due DESC LIMIT 60').all()).results;
  const jobs=new Map(scheduleSlots(now).map(date=>{const j=slotJob(date);return[j.id,j];}));
  for(const row of rows)jobs.set(row.id,row);
  return {enabled:await getSetting(db,'enabled')==='true',ready,imagesEnabled:false,schedule:'Mandag, onsdag og fredag kl. 18 · dansk tid',jobs:[...jobs.values()].sort((a,b)=>a.due.localeCompare(b.due))};
}
export async function runScheduled(db,{scheduledTime,now=new Date(),publish,ready}){
  await init(db);await recover(db,now);
  if(await getSetting(db,'enabled')!=='true')return;
  if(!ready){await setSetting(db,'enabled','false');return;}
  const due=new Date(scheduledTime);const p=localParts(due);
  // The pair of UTC triggers covers both CET and CEST. Only the Danish 18:00 slot publishes.
  if(!['Mon','Wed','Fri'].includes(p.weekday)||p.hour!=='18'||p.minute!=='00')return;
  if(now.getTime()-due.getTime()>6*3600000||now<due)return;
  const job=slotJob(due);
  await db.prepare("INSERT OR IGNORE INTO jobs(id,due,topic,message,state) VALUES(?,?,?,?,'queued')").bind(job.id,job.due,job.topic,job.message).run();
  const claim=await db.prepare("UPDATE jobs SET state='publishing',claimed_at=? WHERE id=? AND state='queued'").bind(now.toISOString(),job.id).run();
  if(!claim.meta.changes)return;
  if(await getSetting(db,'enabled')!=='true'){
    await db.prepare("UPDATE jobs SET state='skipped',error='Sat på pause før udgivelse.' WHERE id=?").bind(job.id).run();return;
  }
  let result;
  try{
    result=await publish({message:job.message});
  }catch(error){
    const state=error.uncertain?'review':'failed';
    await db.prepare('UPDATE jobs SET state=?,error=? WHERE id=?').bind(state,error.uncertain?'Resultatet er ukendt. Kontrollér Facebook-siden.':'Facebook afviste opslaget. Kontrollér forbindelsen.',job.id).run();
    await setSetting(db,'enabled','false');return;
  }
  // If this write fails after Facebook accepted the post, leave the claim in place for recovery.
  await db.prepare("UPDATE jobs SET state='published',facebook_id=? WHERE id=?").bind(result.id,job.id).run();
}

