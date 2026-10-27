import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function createServer({ token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN, pageId = process.env.FACEBOOK_PAGE_ID, version = process.env.META_GRAPH_VERSION, fetchImpl = fetch } = {}) {
  return http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) return json(403, {error:'Forespørgslen kommer fra en anden side.'});
    try {
      if (req.method === 'GET' && req.url === '/api/status') return json(200, {configured: Boolean(token && /^\d+$/.test(pageId || '') && /^v\d+\.\d+$/.test(version || ''))});
      if (req.method === 'POST' && req.url === '/api/publish') {
        if (!token || !/^\d+$/.test(pageId || '') || !/^v\d+\.\d+$/.test(version || '')) return json(503, {error:'Facebook-forbindelsen mangler. Udfyld serverens .env-fil.'});
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415,{error:'Ugyldigt format.'});
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body)>8_000_000) return json(413,{error:'Billedet er for stort. Vælg højst 5 MB.'}); }
        let data; try { data = JSON.parse(body); } catch { return json(400,{error:'Ugyldigt opslag.'}); }
        if (typeof data.message !== 'string' || !data.message.trim() || data.message.length > 10000) return json(400,{error:'Skriv en tekst på mellem 1 og 10.000 tegn.'});
        const form = new FormData();
        form.set('access_token', token);
        let endpoint = 'feed';
        if (data.image) {
          if (typeof data.image !== 'string' || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(data.image)) return json(400,{error:'Vælg et JPG- eller PNG-billede.'});
          const [header, encoded] = data.image.split(',');
          const bytes = Buffer.from(encoded,'base64');
          if (bytes.length > 5_000_000) return json(413,{error:'Billedet må højst fylde 5 MB.'});
          const mime = header.includes('png') ? 'image/png' : 'image/jpeg';
          const valid = mime === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
          if (!valid) return json(400,{error:'Filen er ikke et gyldigt JPG- eller PNG-billede.'});
          form.set('source',new Blob([bytes],{type:mime}),mime==='image/png'?'opslag.png':'opslag.jpg');
          form.set('caption',data.message.trim()); endpoint = 'photos';
        } else form.set('message',data.message.trim());
        let response;
        try { response = await fetchImpl(`https://graph.facebook.com/${version}/${pageId}/${endpoint}`,{method:'POST',body:form,signal:AbortSignal.timeout(30000)}); }
        catch { return json(502,{error:'Forbindelsen til Facebook blev afbrudt. Kontrollér siden, før du prøver igen, så du undgår dobbelte opslag.'}); }
        const result = await response.json();
        if (!response.ok || result.error) return json(502,{error:'Facebook afviste opslaget. Kontrollér sidetoken, tilladelser og API-version i Meta.'});
        const id = result.post_id || result.id;
        if (!id) return json(502,{error:'Facebook returnerede ingen opslag-ID. Kontrollér siden før et nyt forsøg.'});
        return json(200,{id});
      }
      if (req.method === 'GET' && (req.url === '/' || req.url === '/app.js' || req.url === '/style.css' || req.url === '/business.js')) {
        const file = req.url === '/' ? 'index.html' : req.url.slice(1);
        const content = await readFile(new URL(`./public/${file}`,import.meta.url));
        res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'"}); return res.end(content);
      }
      json(404,{error:'Siden findes ikke.'});
    } catch { json(500,{error:'Der opstod en serverfejl. Kontrollér Facebook-siden før et nyt forsøg.'}); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) createServer().listen(Number(process.env.PORT || 3000),'127.0.0.1',()=>console.log('Bilpleje-opslag kører på port '+(process.env.PORT || 3000)));
