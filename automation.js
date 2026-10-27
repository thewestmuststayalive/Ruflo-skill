import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { makePost } from './public/business.js';

const zone = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',minute:'2-digit',weekday:'short'});
function localParts(date) { return Object.fromEntries(zone.formatToParts(date).map(p=>[p.type,p.value])); }
export function scheduleSlots(now, days=28) {
  const slots=[];
  // Iterate UTC hours so both summer and winter time are handled by IANA timezone data.
  const start=Math.floor(now.getTime()/3600000)*3600000;
  for(let t=start;t<now.getTime()+days*86400000;t+=3600000){
    const p=localParts(new Date(t));
    if(t>now.getTime() && ['Mon','Wed','Fri'].includes(p.weekday) && p.hour==='18' && p.minute==='00') slots.push(new Date(t));
  }
  return slots;
}

export class Automation {
  constructor({path, publish, generateImage, ready, now=()=>new Date()}) {
    if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);this.publish=publish;this.generateImage=generateImage;this.ready=ready;this.now=now;this.running=false;
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, due TEXT NOT NULL, topic TEXT NOT NULL, message TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', facebook_id TEXT, error TEXT);
      UPDATE jobs SET state='review',error='Serveren genstartede under udgivelse. Kontrollér Facebook-siden før et nyt opslag.' WHERE state='publishing';`);
    if(this.db.prepare("SELECT id FROM jobs WHERE state='review' LIMIT 1").get()) this.setEnabled(false);
  }
  isEnabled(){ return this.db.prepare("SELECT value FROM settings WHERE key='enabled'").get()?.value==='true'; }
  setEnabled(enabled){this.db.prepare("INSERT INTO settings(key,value) VALUES('enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(enabled));}
  fillPlan(){
    const topics=['basis','grundig','dybderens'];
    for(const due of scheduleSlots(this.now())){
      const p=localParts(due);const id=`${p.year}-${p.month}-${p.day}`;
      const topic=topics[Math.floor(due.getTime()/86400000)%3];
      this.db.prepare("INSERT OR IGNORE INTO jobs(id,due,topic,message) VALUES(?,?,?,?)").run(id,due.toISOString(),topic,makePost(topic)+'\n\nBilledet er en AI-genereret illustration.');
    }
  }
  snapshot(){this.fillPlan();return {enabled:this.isEnabled(),ready:this.ready(),schedule:'Mandag, onsdag og fredag kl. 18 · dansk tid',jobs:this.db.prepare('SELECT * FROM jobs ORDER BY due DESC LIMIT 60').all().reverse()};}
  enable(){if(!this.ready()) throw new Error('Facebook-adgang og API-nøgle til billeder skal konfigureres først.');if(this.db.prepare("SELECT id FROM jobs WHERE state='review' LIMIT 1").get())throw new Error('Kontrollér først opslag med ukendt resultat.');this.fillPlan();this.setEnabled(true);}
  resolve(id){this.db.prepare("UPDATE jobs SET state='dismissed',error='Kontrolleret manuelt; ingen automatisk genudgivelse.' WHERE id=? AND state='review'").run(id);}
  async tick(){
    if(this.running || !this.isEnabled())return;
    this.running=true;
    try{
      this.fillPlan();
      if(!this.ready()){this.setEnabled(false);return;}
      const now=this.now();
      // Never flood the Facebook page after an outage: discard posts over six hours late.
      this.db.prepare("UPDATE jobs SET state='skipped',error='Sprunget over: mere end seks timer forsinket.' WHERE state='queued' AND due<?").run(new Date(now.getTime()-6*3600000).toISOString());
      const job=this.db.prepare("SELECT * FROM jobs WHERE state='queued' AND due<=? ORDER BY due LIMIT 1").get(now.toISOString());
      if(!job)return;
      const claim=this.db.prepare("UPDATE jobs SET state='publishing' WHERE id=? AND state='queued'").run(job.id);
      if(!claim.changes)return;
      let image;
      try{image=await this.generateImage(job.topic);}catch{
        this.db.prepare("UPDATE jobs SET state='failed',error='Billedgenerering fejlede. Automatik er sat på pause; kontrollér API-adgang og saldo.' WHERE id=?").run(job.id);
        this.setEnabled(false);return;
      }
      if(!this.isEnabled()){
        this.db.prepare("UPDATE jobs SET state='skipped',error='Sat på pause under billedgenerering.' WHERE id=?").run(job.id);return;
      }
      try{
        const {id}=await this.publish({message:job.message,image});
        this.db.prepare("UPDATE jobs SET state='published',facebook_id=? WHERE id=?").run(id,job.id);
      }catch(error){
        const state=error.uncertain?'review':'failed';
        this.db.prepare('UPDATE jobs SET state=?,error=? WHERE id=?').run(state,error.uncertain?'Udgivelsens resultat er ukendt. Kontrollér Facebook-siden.':'Facebook afviste opslaget. Kontrollér tilladelser og token.',job.id);
        this.setEnabled(false);
      }
    }finally{this.running=false;}
  }
  start(){this.timer=setInterval(()=>this.tick().catch(()=>{this.setEnabled(false);console.error('Automatik stoppet efter intern fejl.');}),60000);this.timer.unref();}
  stop(){clearInterval(this.timer);}
  close(){this.stop();this.db.close();}
}

export async function generateImage(topic,{key=process.env.AI_IMAGE_API_KEY,fetchImpl=fetch}={}){
  if(!key)throw new Error('Missing image key');
  const scenes={basis:'a pristine clean car dashboard and center console',grundig:'a meticulous close-up of spotless car interior door trim and cup holders',dybderens:'fresh clean ordinary fabric car seats and textile floor mats'};
  const response=await fetchImpl('https://api.openai.com/v1/images/generations',{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(180000),
    body:JSON.stringify({model:'gpt-image-1',n:1,size:'1024x1024',quality:'low',output_format:'jpeg',prompt:`Create a premium photorealistic advertising illustration for Danish interior car cleaning brand BW Bilpleje. Subject: ${scenes[topic] || scenes.basis}. Scandinavian understated aesthetic, navy and teal accents, warm daylight, immaculate realistic materials, square composition. Interior cleaning only. No exterior washing, no before-and-after comparison, no people, no text, no lettering, no logos, no prices. This is an illustrative generic car, not evidence of any actual customer work.`})
  });
  if(!response.ok)throw new Error('Image API rejected request');
  const result=await response.json();const encoded=result.data?.[0]?.b64_json;
  if(typeof encoded!=='string'||Buffer.from(encoded,'base64').length>5_000_000)throw new Error('Invalid generated image');
  return `data:image/jpeg;base64,${encoded}`;
}
