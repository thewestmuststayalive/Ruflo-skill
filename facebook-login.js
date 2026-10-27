import { randomBytes, createHash, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';

export class FacebookLogin {
  constructor({db,password,appId,appSecret,pageId,version,publicUrl,fetchImpl=fetch}){
    Object.assign(this,{db,appId,appSecret,pageId,version,publicUrl,fetchImpl});this.states=new Map();
    this.key=password?createHash('sha256').update('bw-bilpleje-page-token:'+password).digest():null;
  }
  available(){return Boolean(this.key&&/^\d+$/.test(this.appId||'')&&this.appSecret&&/^v\d+\.\d+$/.test(this.version||'')&&this.publicUrl);}
  callback(){return new URL('/facebook/callback',this.publicUrl).href;}
  status(){return {loginAvailable:this.available(),connected:Boolean(this.token()),callbackUrl:this.available()?this.callback():null};}
  token(){
    const row=this.db.prepare("SELECT value FROM settings WHERE key='facebook_token'").get();
    if(!row||!this.key)return null;
    try{const [iv,tag,data]=row.value.split('.').map(s=>Buffer.from(s,'base64'));const decipher=createDecipheriv('aes-256-gcm',this.key,iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString();}catch{return null;}
  }
  save(token){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',this.key,iv);const bytes=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);const value=[iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64')).join('.');this.db.prepare("INSERT INTO settings(key,value) VALUES('facebook_token',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);}
  begin(){
    if(!this.available())throw new Error('Meta-appen er ikke konfigureret.');
    const now=Date.now();for(const [key,expiry] of this.states)if(expiry<now)this.states.delete(key);
    if(this.states.size>=100)throw new Error('For mange loginforsøg. Prøv igen senere.');
    const state=randomBytes(24).toString('hex');this.states.set(state,now+10*60000);
    const url=new URL(`https://www.facebook.com/${this.version}/dialog/oauth`);
    for(const [key,value] of Object.entries({client_id:this.appId,redirect_uri:this.callback(),state,scope:'pages_show_list,pages_read_engagement,pages_manage_posts',response_type:'code'}))url.searchParams.set(key,value);
    return {state,url:url.href};
  }
  async complete({state,code,cookieState}){
    if(!this.available()||!state||state!==cookieState||!this.states.has(state)||this.states.get(state)<Date.now())throw new Error('Login er udløbet eller ugyldigt. Prøv igen.');
    this.states.delete(state);if(!code)throw new Error('Facebook-login blev ikke godkendt.');
    const get=async(path,params,token)=>{
      const url=new URL(`https://graph.facebook.com/${this.version}/${path}`);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
      const r=await this.fetchImpl(url.href,{headers:token?{Authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(30000)});const value=await r.json();if(!r.ok||value.error)throw new Error('Facebook-forbindelsen kunne ikke godkendes. Kontrollér Meta-appens indstillinger.');return value;
    };
    const short=await get('oauth/access_token',{client_id:this.appId,client_secret:this.appSecret,redirect_uri:this.callback(),code});
    if(!short.access_token)throw new Error('Facebook returnerede ikke adgang.');
    const long=await get('oauth/access_token',{grant_type:'fb_exchange_token',client_id:this.appId,client_secret:this.appSecret,fb_exchange_token:short.access_token});
    if(!long.access_token)throw new Error('Facebook returnerede ikke varig adgang.');
    const proof=createHmac('sha256',this.appSecret).update(long.access_token).digest('hex');
    const pages=await get('me/accounts',{fields:'id,name,access_token',limit:'100',appsecret_proof:proof},long.access_token);
    const page=pages.data?.find(p=>p.id===this.pageId);
    if(!page?.access_token)throw new Error('Din BW Bilpleje-side blev ikke givet adgang. Vælg siden og godkend de nødvendige tilladelser.');
    this.save(page.access_token);
  }
}
