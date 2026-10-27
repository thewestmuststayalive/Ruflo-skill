import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { Automation, generateImage } from './automation.js';
import { createPublisher, validatePost } from './facebook.js';
import { FacebookLogin } from './facebook-login.js';

function same(a,b){return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
export function createServer({token=process.env.FACEBOOK_PAGE_ACCESS_TOKEN,pageId=process.env.FACEBOOK_PAGE_ID,version=process.env.META_GRAPH_VERSION,fetchImpl=fetch,password=process.env.APP_PASSWORD,publicUrl=process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL,automation=null,facebookLogin=null,getToken=()=>token}={}){
  const configured=()=>Boolean(getToken()&&/^\d+$/.test(pageId||'')&&/^v\d+\.\d+$/.test(version||''));
  const publish=data=>createPublisher({token:getToken(),pageId,version,fetchImpl})(data);
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    if(req.method==='GET'&&req.url==='/health')return json(200,{ok:true});
    if(password){
      const auth=req.headers.authorization||'';
      const decoded=auth.startsWith('Basic ')?Buffer.from(auth.slice(6),'base64').toString():'';
      if(!same(decoded,`admin:${password}`)){res.setHeader('WWW-Authenticate','Basic realm="BW Bilpleje", charset="UTF-8"');return json(401,{error:'Log ind med brugernavn admin og din adgangskode.'});}
    }
    let expectedOrigin;
    try{expectedOrigin=publicUrl?new URL(publicUrl).origin:`http://${req.headers.host}`;}catch{return json(503,{error:'Serverens offentlige adresse er forkert konfigureret.'});}
    if(req.headers.origin&&req.headers.origin!==expectedOrigin)return json(403,{error:'Forespørgslen kommer fra en anden side.'});
    if(req.headers['sec-fetch-site']==='cross-site'&&req.method!=='GET')return json(403,{error:'Forespørgslen kommer fra en anden side.'});
    try{
      if(req.method==='GET'&&req.url==='/api/status')return json(200,{configured:configured()});
      if(req.method==='GET'&&req.url==='/api/facebook')return json(200,facebookLogin?facebookLogin.status():{loginAvailable:false,connected:false});
      if(req.method==='GET'&&req.url==='/facebook/connect'){
        if(!facebookLogin)return json(503,{error:'Meta-appen er ikke konfigureret.'});
        let login;try{login=facebookLogin.begin();}catch(error){return json(503,{error:error.message});}
        res.setHeader('Set-Cookie',`fb_state=${login.state}; HttpOnly; SameSite=Lax; Path=/facebook; Max-Age=600${expectedOrigin.startsWith('https:')?'; Secure':''}`);
        res.writeHead(302,{Location:login.url});return res.end();
      }
      if(req.method==='GET'&&req.url?.startsWith('/facebook/callback?')){
        if(!facebookLogin)return json(503,{error:'Meta-appen er ikke konfigureret.'});
        const url=new URL(req.url,expectedOrigin);const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('fb_state='))?.slice(9);
        res.setHeader('Set-Cookie','fb_state=; HttpOnly; SameSite=Lax; Path=/facebook; Max-Age=0');
        try{await facebookLogin.complete({state:url.searchParams.get('state'),code:url.searchParams.get('code'),cookieState:cookie});}
        catch{return json(400,{error:'Facebook-forbindelsen mislykkedes. Gå tilbage og prøv igen. Kontrollér, at appen og den valgte side har de nødvendige tilladelser.'});}
        res.writeHead(302,{Location:'/'});return res.end();
      }
      if(req.method==='GET'&&req.url==='/api/automation')return json(200,automation?automation.snapshot():{enabled:false,ready:false,jobs:[],schedule:'Automatik er ikke startet.'});
      if(req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'Ugyldigt format.'});
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>8_000_000)return json(413,{error:'Forespørgslen er for stor.'});chunks.push(chunk);}
        let data;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{return json(400,{error:'Ugyldigt opslag.'});}
        if(!data||typeof data!=='object')return json(400,{error:'Ugyldigt opslag.'});
        if(req.url==='/api/automation'){
          if(!automation)return json(503,{error:'Automatik er ikke startet.'});
          if(data.action==='enable'){try{automation.enable();}catch(error){return json(409,{error:error.message});}}
          else if(data.action==='pause')automation.setEnabled(false);
          else if(data.action==='resolve'&&typeof data.id==='string')automation.resolve(data.id);
          else return json(400,{error:'Ukendt handling.'});
          return json(200,automation.snapshot());
        }
        if(req.url==='/api/publish'){
          if(!configured())return json(503,{error:'Facebook-forbindelsen mangler. Udfyld serverens miljøvariabler.'});
          try{validatePost(data);}catch(error){return json(400,{error:error.message});}
          try{return json(200,await publish(data));}catch(error){return json(502,{error:error.message});}
        }
      }
      const files=new Set(['/','/app.js','/style.css','/business.js','/automation-ui.js']);
      if(req.method==='GET'&&files.has(req.url)){
        const file=req.url==='/'?'index.html':req.url.slice(1);const content=await readFile(new URL(`./public/${file}`,import.meta.url));
        res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});return res.end(content);
      }
      json(404,{error:'Siden findes ikke.'});
    }catch{json(500,{error:'Der opstod en serverfejl. Kontrollér Facebook-siden før et nyt forsøg.'});}
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const host=process.env.HOST||'127.0.0.1';
  if(host!=='127.0.0.1'&&(!process.env.APP_PASSWORD||process.env.APP_PASSWORD.length<20))throw new Error('Offentlig hosting kræver APP_PASSWORD på mindst 20 tegn.');
  const token=process.env.FACEBOOK_PAGE_ACCESS_TOKEN,pageId=process.env.FACEBOOK_PAGE_ID,version=process.env.META_GRAPH_VERSION;
  let facebookLogin;
  const getToken=()=>facebookLogin?.token()||token;
  const ready=()=>Boolean(getToken()&&/^\d+$/.test(pageId||'')&&/^v\d+\.\d+$/.test(version||'')&&process.env.AI_IMAGE_API_KEY);
  const automation=new Automation({path:join(process.env.DATA_DIR||'./data','automation.sqlite'),publish:data=>createPublisher({token:getToken(),pageId,version})(data),generateImage,ready});
  facebookLogin=new FacebookLogin({db:automation.db,password:process.env.APP_PASSWORD,appId:process.env.FACEBOOK_APP_ID,appSecret:process.env.FACEBOOK_APP_SECRET,pageId,version,publicUrl:process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL});
  automation.start();
  const server=createServer({automation,facebookLogin,getToken});
  server.listen(Number(process.env.PORT||3000),host,()=>console.log('BW Bilpleje er startet. Automatik er '+(automation.isEnabled()?'aktiv.':'sat på pause.')));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{automation.stop();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();});
}
