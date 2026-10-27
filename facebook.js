export function validatePost(data){
  if(typeof data.message!=='string'||!data.message.trim()||data.message.length>10000)throw new Error('Skriv en tekst på mellem 1 og 10.000 tegn.');
  if(data.image){
    if(typeof data.image!=='string'||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(data.image))throw new Error('Vælg et JPG- eller PNG-billede.');
    const [header,encoded]=data.image.split(',');const bytes=Buffer.from(encoded,'base64');
    if(bytes.length>5_000_000)throw new Error('Billedet må højst fylde 5 MB.');
    const mime=header.includes('png')?'image/png':'image/jpeg';
    const valid=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!valid)throw new Error('Filen er ikke et gyldigt JPG- eller PNG-billede.');
    return {bytes,mime};
  }
}
export function createPublisher({token,pageId,version,fetchImpl=fetch}){
  return async data=>{
    const photo=validatePost(data);const form=new FormData();form.set('access_token',token);
    if(photo){form.set('source',new Blob([photo.bytes],{type:photo.mime}),photo.mime==='image/png'?'opslag.png':'opslag.jpg');form.set('caption',data.message.trim());}
    else form.set('message',data.message.trim());
    let response,result;
    try{
      response=await fetchImpl(`https://graph.facebook.com/${version}/${pageId}/${photo?'photos':'feed'}`,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
      result=await response.json();
    }catch{const error=new Error('Forbindelsen til Facebook blev afbrudt. Kontrollér siden før et nyt forsøg.');error.uncertain=true;throw error;}
    if(!response.ok||result.error)throw new Error('Facebook afviste opslaget. Kontrollér sidetoken, tilladelser og API-version i Meta.');
    const id=result.post_id||result.id;
    if(!id){const error=new Error('Facebook returnerede ingen opslag-ID. Kontrollér siden før et nyt forsøg.');error.uncertain=true;throw error;}
    return {id};
  };
}
