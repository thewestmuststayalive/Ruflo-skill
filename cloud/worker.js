import { timingSafeEqual } from 'node:crypto';
import {init,setSetting,snapshot,runScheduled} from './store.js';
import {readToken,loginAvailable,beginLogin,completeLogin} from './login.js';
import {createPublisher,validatePost} from '../facebook.js';
const encoder=new TextEncoder();
function json(value,status=200,extra={}){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});}
async function authenticated(request,password){
  const auth=request.headers.get('Authorization')||'';let decoded='';
  try{if(auth.startsWith('Basic '))decoded=Buffer.from(auth.slice(6),'base64').toString();}catch{return false;}
  const [a,b]=await Promise.all([decoded,`admin:${password}`].map(v=>crypto.subtle.digest('SHA-256',encoder.encode(v))));
  return timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
export function facebookReady(env,token){return Boolean(token&&/^\d+$/.test(env.FACEBOOK_PAGE_ID||'')&&/^v\d+\.\d+$/.test(env.META_GRAPH_VERSION||''));}
async function readBody(request){
  const reader=request.body?.getReader();if(!reader)throw new Error('Ugyldigt format.');const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000){await reader.cancel();throw new Error('Forespørgslen er for stor.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||typeof data!=='object')throw new Error('Ugyldigt format.');return data;
}
async function handle(request,env){
  const url=new URL(request.url);const path=url.pathname;
  if(path==='/health'&&request.method==='GET')return json({ok:true});
  if(!env.APP_PASSWORD||env.APP_PASSWORD.length<20)return json({error:'Tilføj APP_PASSWORD på mindst 20 tegn under Settings → Variables and Secrets.'},503);
  if(!await authenticated(request,env.APP_PASSWORD))return json({error:'Log ind som admin.'},401,{'WWW-Authenticate':'Basic realm="BW Bilpleje", charset="UTF-8"'});
  const origin=env.PUBLIC_URL?new URL(env.PUBLIC_URL).origin:url.origin;
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return json({error:'Forespørgslen kommer fra en anden side.'},403);
  if(request.method!=='GET'&&request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Forespørgslen kommer fra en anden side.'},403);
  if(!env.DB)return json({error:'D1-databasen DB er ikke forbundet.'},503);
  await init(env.DB);
  if(request.method==='GET'){
    if(path==='/facebook/connect'){
      if(!loginAvailable(env))return json({error:'Tilføj Meta-appens oplysninger under Variables and Secrets.'},503);
      const login=await beginLogin(env,origin);
      return new Response(null,{status:302,headers:{Location:login.url,'Set-Cookie':`fb_state=${login.state}; Path=/facebook; HttpOnly; SameSite=Lax; Max-Age=600${origin.startsWith('https:')?'; Secure':''}`}});
    }
    if(path==='/facebook/callback'){
      const cookie=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('fb_state='))?.slice(9);
      try{await completeLogin(env,{origin,state:url.searchParams.get('state'),code:url.searchParams.get('code'),cookie});}
      catch{return json({error:'Facebook-login mislykkedes. Kontrollér appens indstillinger og sidetilladelser, og prøv igen.'},400);}
      return new Response(null,{status:302,headers:{Location:'/', 'Set-Cookie':'fb_state=; Path=/facebook; HttpOnly; SameSite=Lax; Max-Age=0'}});
    }
    if(path.startsWith('/api/')){
      const token=await readToken(env);const ready=facebookReady(env,token);
      if(path==='/api/status')return json({configured:ready});
      if(path==='/api/facebook')return json({connected:Boolean(token),loginAvailable:loginAvailable(env),callbackUrl:origin+'/facebook/callback'});
      if(path==='/api/automation')return json(await snapshot(env.DB,ready));
      return json({error:'Siden findes ikke.'},404);
    }
    return env.ASSETS.fetch(request);
  }
  if(request.method==='POST'){
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Ugyldigt format.'},415);
    let data;try{data=await readBody(request);}catch{return json({error:'Ugyldig eller for stor forespørgsel.'},400);}
    const token=await readToken(env);const ready=facebookReady(env,token);
    if(path==='/api/automation'){
      if(data.action==='enable'){
        if(!ready)return json({error:'Forbind Facebook-siden først.'},409);
        if(await env.DB.prepare("SELECT id FROM jobs WHERE state='review' OR state='publishing' LIMIT 1").first())return json({error:'Kontrollér først opslag med ukendt resultat.'},409);
        await setSetting(env.DB,'enabled','true');
      }else if(data.action==='pause')await setSetting(env.DB,'enabled','false');
      else if(data.action==='resolve'&&typeof data.id==='string')await env.DB.prepare("UPDATE jobs SET state='dismissed',error='Kontrolleret manuelt; ingen automatisk genudgivelse.' WHERE id=? AND state='review'").bind(data.id).run();
      else return json({error:'Ukendt handling.'},400);
      return json(await snapshot(env.DB,ready));
    }
    if(path==='/api/publish'){
      if(!ready)return json({error:'Forbind Facebook-siden først.'},503);
      try{validatePost(data);}catch(error){return json({error:error.message},400);}
      try{return json(await createPublisher({token,pageId:env.FACEBOOK_PAGE_ID,version:env.META_GRAPH_VERSION})(data));}catch(error){return json({error:error.message},502);}
    }
  }
  return json({error:'Siden findes ikke.'},404);
}
export default {
  async fetch(request,env){
    let response;
    try{response=await handle(request,env);}catch{response=json({error:'Der opstod en serverfejl. Kontrollér indstillingerne; se Facebook-siden før et nyt udgivelsesforsøg.'},500);}
    response=new Response(response.body,response);response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');
    response.headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    return response;
  },
  async scheduled(controller,env){
    // A missing password also disables cron: configuration errors must not expose or publish content.
    if(!env.APP_PASSWORD||env.APP_PASSWORD.length<20||!env.DB)return;
    await init(env.DB);const token=await readToken(env);
    await runScheduled(env.DB,{scheduledTime:controller.scheduledTime,ready:facebookReady(env,token),publish:createPublisher({token,pageId:env.FACEBOOK_PAGE_ID,version:env.META_GRAPH_VERSION})});
  }
};
