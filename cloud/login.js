import {getSetting,setSetting} from './store.js';
const encoder=new TextEncoder();
const b64=bytes=>Buffer.from(bytes).toString('base64');
async function vaultKey(password){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode('bw-cloud-token:'+password)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function readToken(env){
  const saved=await getSetting(env.DB,'facebook_token');
  if(saved&&env.APP_PASSWORD){try{const [iv,data]=saved.split('.').map(v=>Buffer.from(v,'base64'));const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv},await vaultKey(env.APP_PASSWORD),data);return new TextDecoder().decode(decoded);}catch{/* reconnect after password rotation */}}
  return env.FACEBOOK_PAGE_ACCESS_TOKEN||null;
}
export async function saveToken(env,token){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await vaultKey(env.APP_PASSWORD),encoder.encode(token));await setSetting(env.DB,'facebook_token',b64(iv)+'.'+b64(encrypted));}
export function loginAvailable(env){return Boolean(env.APP_PASSWORD&&/^\d+$/.test(env.FACEBOOK_APP_ID||'')&&env.FACEBOOK_APP_SECRET&&/^v\d+\.\d+$/.test(env.META_GRAPH_VERSION||''));}
export async function beginLogin(env,origin){
  if(!loginAvailable(env))throw new Error('Meta-appen er ikke konfigureret.');
  await env.DB.prepare('DELETE FROM oauth_states WHERE expires<?').bind(Date.now()).run();
  const state=Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('hex');
  await env.DB.prepare('INSERT INTO oauth_states(state,expires) VALUES(?,?)').bind(state,Date.now()+10*60000).run();
  const url=new URL(`https://www.facebook.com/${env.META_GRAPH_VERSION}/dialog/oauth`);
  for(const [key,value] of Object.entries({client_id:env.FACEBOOK_APP_ID,redirect_uri:origin+'/facebook/callback',state,scope:'pages_show_list,pages_read_engagement,pages_manage_posts',response_type:'code'}))url.searchParams.set(key,value);
  return {state,url:url.href};
}
export async function completeLogin(env,{origin,state,code,cookie},fetchImpl=fetch){
  if(!loginAvailable(env)||!state||state!==cookie||!code)throw new Error('Ugyldigt Facebook-login.');
  const consumed=await env.DB.prepare('DELETE FROM oauth_states WHERE state=? AND expires>=? RETURNING state').bind(state,Date.now()).first();
  if(!consumed)throw new Error('Login udløbet.');
  const get=async(path,params,token)=>{
    const url=new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${path}`);
    for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
    const response=await fetchImpl(url.href,{headers:token?{Authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(30000)});
    const result=await response.json();if(!response.ok||result.error)throw new Error('Facebook afviste login.');return result;
  };
  const short=await get('oauth/access_token',{client_id:env.FACEBOOK_APP_ID,client_secret:env.FACEBOOK_APP_SECRET,redirect_uri:origin+'/facebook/callback',code});
  if(!short.access_token)throw new Error('Intet token.');
  const long=await get('oauth/access_token',{grant_type:'fb_exchange_token',client_id:env.FACEBOOK_APP_ID,client_secret:env.FACEBOOK_APP_SECRET,fb_exchange_token:short.access_token});
  if(!long.access_token)throw new Error('Intet varigt token.');
  const hmac=await crypto.subtle.importKey('raw',encoder.encode(env.FACEBOOK_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const proof=Buffer.from(await crypto.subtle.sign('HMAC',hmac,encoder.encode(long.access_token))).toString('hex');
  const pages=await get('me/accounts',{fields:'id,access_token',limit:'100',appsecret_proof:proof},long.access_token);
  const page=pages.data?.find(p=>p.id===env.FACEBOOK_PAGE_ID);
  if(!page?.access_token)throw new Error('Adgang til den valgte side mangler.');
  await saveToken(env,page.access_token);
}
