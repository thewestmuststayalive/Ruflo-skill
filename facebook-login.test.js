import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {FacebookLogin} from './facebook-login.js';
function setup(fetchImpl){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)');return {db,login:new FacebookLogin({db,password:'test-password-for-encryption',appId:'123',appSecret:'app-secret',pageId:'61595933881305',version:'v99.0',publicUrl:'https://bw.example',fetchImpl})};}
test('Facebook login validates state, exchanges tokens and stores only encrypted page access',async()=>{
  const {db,login}=setup(async(url,opts)=>{
    const u=new URL(url);
    if(u.pathname.endsWith('me/accounts')){assert.equal(opts.headers.Authorization,'Bearer long-token');return Response.json({data:[{id:'61595933881305',access_token:'page-token-secret'}]});}
    return Response.json({access_token:u.searchParams.has('code')?'short-token':'long-token'});
  });
  try{
    const {state,url}=login.begin();assert.equal(new URL(url).searchParams.get('redirect_uri'),'https://bw.example/facebook/callback');
    await assert.rejects(login.complete({state,code:'code',cookieState:'wrong'}),/ugyldigt/);
    await login.complete({state,code:'code',cookieState:state});assert.equal(login.token(),'page-token-secret');
    assert.ok(!db.prepare("SELECT value FROM settings WHERE key='facebook_token'").get().value.includes('page-token-secret'));
    assert.ok(!JSON.stringify(login.status()).includes('page-token-secret'));
    await assert.rejects(login.complete({state,code:'code',cookieState:state}),/ugyldigt/);
  }finally{db.close();}
});
test('login never substitutes a different Facebook page',async()=>{
  const {db,login}=setup(async url=>Response.json(new URL(url).pathname.endsWith('me/accounts')?{data:[{id:'wrong-page',access_token:'wrong-token'}]}:{access_token:'user-token'}));
  try{const {state}=login.begin();await assert.rejects(login.complete({state,code:'code',cookieState:state}),/ikke givet adgang/);assert.equal(login.token(),null);}finally{db.close();}
});
