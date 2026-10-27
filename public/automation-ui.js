const $=id=>document.getElementById(id);
let state;
const names={queued:'Planlagt',publishing:'Udgiver',published:'Udgivet',failed:'Fejlet',review:'Skal kontrolleres',skipped:'Sprunget over',dismissed:'Kontrolleret'};
function render(data){
  state=data;$('auto-status').textContent=data.enabled?'● Automatik kører':'○ Automatik er sat på pause';
  $('auto-schedule').textContent=data.schedule;
  $('auto-toggle').textContent=data.enabled?'Sæt på pause':'Aktivér automatisk udgivelse';
  $('auto-toggle').disabled=!data.enabled&&!data.ready;
  $('auto-help').textContent=data.ready?'Ved aktivering genereres ét AI-billede pr. opslag. API-forbrug betales via din AI-konto.':'Facebook-sideadgang og en API-nøgle til AI-billeder skal tilføjes på hostingkontoen, før automatik kan aktiveres.';
  $('jobs').replaceChildren();
  const jobs=[...data.jobs].sort((a,b)=>a.due.localeCompare(b.due));
  for(const job of jobs){
    const item=document.createElement('details');const summary=document.createElement('summary');
    summary.textContent=new Intl.DateTimeFormat('da-DK',{timeZone:'Europe/Copenhagen',dateStyle:'medium',timeStyle:'short'}).format(new Date(job.due))+` · ${job.topic.toUpperCase()} · ${names[job.state]||job.state}`;
    const text=document.createElement('p');text.className='job-text';text.textContent=job.message;
    item.append(summary,text);
    if(job.error){const error=document.createElement('p');error.textContent=job.error;item.append(error);}
    if(job.facebook_id){const id=document.createElement('p');id.textContent='Facebook-ID: '+job.facebook_id;item.append(id);}
    if(job.state==='review'){const button=document.createElement('button');button.type='button';button.textContent='Jeg har kontrolleret Facebook-siden';button.onclick=()=>action({action:'resolve',id:job.id});item.append(button);}
    $('jobs').append(item);
  }
}
async function action(data){
  $('auto-toggle').disabled=true;
  try{const r=await fetch('/api/automation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw new Error(result.error);render(result);$('auto-result').textContent='Ændringen er gemt.';}
  catch(error){$('auto-result').textContent=error.message;}
  finally{$('auto-toggle').disabled=!state?.enabled&&!state?.ready;}
}
$('auto-toggle').onclick=()=>{
  if(!state)return;
  if(!state.enabled&&!confirm('Aktivér tre offentlige opslag om ugen med AI-genererede billeder? Det bruger betalt AI-adgang og udgiver automatisk uden godkendelse af hvert opslag.'))return;
  action({action:state.enabled?'pause':'enable'});
};
async function refresh(){try{const r=await fetch('/api/automation');if(!r.ok)throw new Error();render(await r.json());}catch{$('auto-result').textContent='Kontrolpanelet kunne ikke hentes. Genindlæs siden.';}}
refresh();setInterval(refresh,60000);

fetch('/api/facebook').then(r=>r.json()).then(data=>{ $('facebook-connect').hidden=!data.loginAvailable; $('facebook-help').textContent=data.connected?'Facebook-siden er forbundet.':data.loginAvailable?'Forbind din side med Facebook-knappen.':'Facebook-login kræver, at Meta-appen sættes op på hostingkontoen.'; }).catch(()=>{});
