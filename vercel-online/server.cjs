'use strict';
// INKSHOT cooperativo: HTTP + SSE, somente módulos nativos do Node.js.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {Room}=require('./arena.cjs');
const MAX_ROOMS=32;
function networkAddresses(port){
 const networks=[];
 for(const [name,items]of Object.entries(os.networkInterfaces()))for(const a of items||[])if(a.family==='IPv4'&&!a.internal){
  let score=/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)?10:0;
  if(/wi-?fi|ethernet|wireless|wlan|^eth\d|^en\d/i.test(name))score+=10;
  if(/virtual|vbox|vmware|hyper|vEthernet|vpn|radmin|zerotier|tailscale|hamachi|wintun|tap|loopback/i.test(name))score-=30;
  networks.push({url:'http://'+a.address+':'+port,name,score});
 }
 return networks.sort((a,b)=>b.score-a.score);
}
function createServer({port=3000,host='0.0.0.0',testPage=null,allowedOrigins=process.env.ALLOWED_ORIGINS||''}={}){
 const origins=new Set(allowedOrigins.split(',').map(v=>v.trim()).filter(Boolean).map(value=>{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('ALLOWED_ORIGINS deve conter origens completas, sem caminhos.');return u.origin;}));
 const rooms=new Map(),streams=new Map(),rates=new Map();let ticks=0;
 function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
 function auth(data){const room=rooms.get(String(data.room||'').toUpperCase());if(!room)throw Error('Sala não encontrada. Crie outra sala.');const player=room.players.get(data.id);if(!player||player.token!==data.token)throw Error('Sessão encerrada. Entre na sala novamente.');return {room,player};}
 function closeStream(id){const old=streams.get(id);if(old){streams.delete(id);old.res.end();}}
 function remove(room,player){closeStream(player.id);room.removePlayer(player.id);if(!room.players.size)rooms.delete(room.code);}
 function write(entry,snapshot,initial=false){if(entry.res.destroyed||entry.res.writableEnded)return;const packet=initial?{...snapshot,decals:entry.room.decals}:snapshot;if(entry.res.writableLength>262144){entry.res.destroy();return;}entry.res.write('data: '+JSON.stringify(packet)+'\n\n');}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  let url;try{url=new URL(req.url,'http://'+req.headers.host);}catch{json(res,400,{error:'URL inválida.'});return;}
  // O frontend da Vercel acessa diretamente a API e o SSE, sem proxy de Functions.
  // Origens são explícitas; não usamos curingas ou cookies de terceiros.
  if(req.headers.origin){
   let origin;try{origin=new URL(req.headers.origin);}catch{json(res,403,{error:'Origem inválida.'});return;}
   if(origin.host!==req.headers.host&&!origins.has(origin.origin)){json(res,403,{error:'Origem não permitida. Configure ALLOWED_ORIGINS no servidor.'});return;}
   res.setHeader('Access-Control-Allow-Origin',origin.origin);
   res.setHeader('Vary','Origin');
   res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers','Content-Type');
   res.setHeader('Access-Control-Max-Age','600');
  }
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});fs.createReadStream(path.join(__dirname,'index.html')).pipe(res);return;}
  if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(req.method==='GET'&&url.pathname==='/api/info'){const networks=process.env.NODE_ENV==='production'||host==='127.0.0.1'||host==='::1'?[]:networkAddresses(server.address().port);json(res,200,{game:'INKSHOT',protocol:1,maxPlayers:4,addresses:networks.map(n=>n.url),networks:networks.map(({url,name})=>({url,name}))});return;}
  // Página de testes opcional, apenas quando o servidor é criado pela suíte local.
  if(testPage&&req.method==='GET'&&url.pathname==='/__test'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(testPage));return;}
  if(req.method==='GET'&&url.pathname==='/api/events'){
   try{const {room,player}=auth(Object.fromEntries(url.searchParams));closeStream(player.id);player.connected=true;player.lastSeen=Date.now();res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('retry: 1000\n\n');const entry={room,player,res};streams.set(player.id,entry);write(entry,room.snapshot(),true);res.on('close',()=>{if(streams.get(player.id)===entry){streams.delete(player.id);player.connected=false;player.input.active=false;player.lastSeen=Date.now();}});}catch(e){json(res,404,{error:e.message});}return;
  }
  if(req.method!=='POST'||!url.pathname.startsWith('/api/')){json(res,404,{error:'Não encontrado.'});return;}
  if(!String(req.headers['content-type']).startsWith('application/json')){json(res,415,{error:'Use JSON.'});return;}
  const ip=req.socket.remoteAddress,now=Date.now();let rate=rates.get(ip);if(!rate||now-rate.since>1000){rate={since:now,count:0};rates.set(ip,rate);}if(++rate.count>220){json(res,429,{error:'Muitos pedidos. Aguarde um instante.'});return;}
  let body='',tooLarge=false;try{for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096){tooLarge=true;break;}}if(tooLarge){json(res,413,{error:'Pedido muito grande.'});return;}const data=JSON.parse(body||'{}');
   if(url.pathname==='/api/create'||url.pathname==='/api/join'){
    let room;if(url.pathname==='/api/create'){if(rooms.size>=MAX_ROOMS)throw Error('Servidor cheio. Tente novamente mais tarde.');let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(code));room=new Room(code);rooms.set(code,room);}else{room=rooms.get(String(data.code||'').trim().toUpperCase());if(!room)throw Error('Não encontramos esse código de sala.');}
    const player=room.addPlayer(data.name);json(res,200,{room:room.code,id:player.id,token:player.token});return;
   }
   const {room,player}=auth(data);player.lastSeen=now;
   if(url.pathname==='/api/input'){room.input(player.id,data);json(res,200,{ok:true,seq:player.seq});return;}
   if(url.pathname==='/api/start'){room.start(player.id);json(res,200,{ok:true});return;}
   if(url.pathname==='/api/leave'){remove(room,player);json(res,200,{ok:true});return;}
   json(res,404,{error:'Comando desconhecido.'});
  }catch(e){if(!res.headersSent)json(res,400,{error:e instanceof SyntaxError?'JSON inválido.':e.message});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 const timer=setInterval(()=>{ticks++;for(const room of rooms.values())room.tick(1/30);if(ticks%2===0){for(const room of rooms.values()){const s=room.snapshot();for(const p of room.players.values()){const stream=streams.get(p.id);if(stream)write(stream,s);}}}if(ticks%30===0){const now=Date.now();for(const room of rooms.values())for(const p of room.players.values())if(!streams.has(p.id)&&now-p.lastSeen>15000)remove(room,p);for(const [ip,v]of rates)if(now-v.since>60000)rates.delete(ip);}},1000/30);
 server.on('close',()=>clearInterval(timer));
 server.on('clientError',(_e,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));
 return {server,rooms,streams,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve(server.address());});}),close:()=>new Promise(resolve=>{clearInterval(timer);for(const s of streams.values())s.res.end();streams.clear();server.close(resolve);server.closeAllConnections?.();})};
}
if(require.main===module){const port=Number(process.env.PORT)||3000,host=process.env.HOST||'0.0.0.0',app=createServer({port,host});app.listen().then(()=>{console.log('\nINKSHOT | COOPERATIVO PARA ATE 4 JOGADORES\n');console.log('Neste computador: http://localhost:'+port);if(host!=='127.0.0.1'&&host!=='::1')for(const n of networkAddresses(port))console.log('Na mesma rede:    '+n.url+' ('+n.name+')');console.log('\nDeixe esta janela aberta durante a partida. Ctrl+C encerra.\n');}).catch(e=>{console.error(e.code==='EADDRINUSE'?'A porta '+port+' ja esta em uso. Feche outro servidor ou altere PORT.':e.message);process.exitCode=1;app.close();});process.on('SIGINT',()=>app.close().then(()=>process.exit()));process.on('SIGTERM',()=>app.close().then(()=>process.exit()));}
module.exports={createServer};
