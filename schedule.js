const zone = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',minute:'2-digit',weekday:'short'});
export function localParts(date){return Object.fromEntries(zone.formatToParts(date).map(p=>[p.type,p.value]));}
export function scheduleSlots(now,days=28){
  const slots=[];
  const dayStart=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  for(let day=0;day<=days;day++){
    const candidate=new Date(dayStart+day*86400000+16*3600000);
    const p=localParts(candidate);
    if(!['Mon','Wed','Fri'].includes(p.weekday))continue;
    candidate.setTime(candidate.getTime()+(18-Number(p.hour))*3600000);
    if(candidate>now&&candidate.getTime()<now.getTime()+days*86400000)slots.push(candidate);
  }
  return slots;
}
