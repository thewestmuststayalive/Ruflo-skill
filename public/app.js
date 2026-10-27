import { business, makePost } from './business.js';
const $ = id => document.getElementById(id);
let image = null, configured = false, loadingImage = false;
function preview(){ $('preview-name').textContent=$('company').value.trim() || 'Din virksomhed'; $('preview-text').textContent=$('message').value || 'Din opslagstekst vises her.'; }
$('company').addEventListener('input',preview); $('message').addEventListener('input',preview);
$('company').value=business.name;
$('city').value=business.area;
function generatePost(){ $('message').value=makePost($('topic').value, $('company').value.trim() || business.name, $('city').value.trim() || business.area); preview(); }
$('template').onclick=generatePost;
$('topic').onchange=generatePost;
generatePost();
function clearImage(){image=null;$('image').value='';$('preview-image').hidden=true;$('preview-image').removeAttribute('src');$('remove').hidden=true;}
$('remove').onclick=clearImage;
$('image').onchange=async()=>{ const file=$('image').files[0]; image=null;$('preview-image').hidden=true;$('remove').hidden=true; if(!file)return; if(!['image/jpeg','image/png'].includes(file.type)||file.size>5000000){clearImage();$('result').textContent='Vælg et JPG- eller PNG-billede på højst 5 MB.';return;} loadingImage=true;$('publish').disabled=true;try{image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});$('preview-image').src=image;$('preview-image').hidden=false;$('remove').hidden=false;$('result').textContent='';}catch{clearImage();$('result').textContent='Billedet kunne ikke læses.';}finally{loadingImage=false;$('publish').disabled=!configured;} };
$('form').onsubmit=async event=>{event.preventDefault();if(!configured||loadingImage)return;if(!confirm('Vil du udgive opslaget offentligt på din Facebook-side nu?'))return;$('publish').disabled=true;$('result').textContent='Udgiver…';try{const r=await fetch('/api/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:$('message').value,image})});const data=await r.json();$('result').textContent=r.ok?`Opslaget er udgivet! Facebook-ID: ${data.id}`:data.error;}catch{$('result').textContent='Forbindelsen blev afbrudt. Kontrollér Facebook-siden, før du prøver igen.';}finally{$('publish').disabled=!configured;}};
fetch('/api/status').then(r=>r.json()).then(data=>{configured=data.configured;$('publish').disabled=!configured;$('connection').textContent=configured?'● Facebook-forbindelsen er konfigureret.':'○ Tilføj Facebook-adgang i serverens .env-fil for at udgive.';}).catch(()=>{$('connection').textContent='Kan ikke kontakte serveren.';});
