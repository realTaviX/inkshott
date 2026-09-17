'use strict';
const fs=require('node:fs');
const path=require('node:path');
function build(api=process.env.INKSHOT_API_URL,output=path.join(__dirname,'dist')){
 if(!api)throw Error('Configure INKSHOT_API_URL na Vercel com a URL HTTPS do servidor multiplayer, antes de fazer o deploy.');
 const url=new URL(api);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('INKSHOT_API_URL deve usar HTTPS (HTTP só é aceito para testes em localhost).');
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('INKSHOT_API_URL deve ser apenas a origem, por exemplo https://inkshot-servidor.onrender.com, sem /api ou credenciais.');
 const marker='const ONLINE_API_ORIGIN = "";';
 const source=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 if(!source.includes(marker))throw Error('Marcador de configuração não encontrado no index.html.');
 const html=source.replace(marker,'const ONLINE_API_ORIGIN = '+JSON.stringify(url.origin)+';');
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'index.html'),html);
 console.log('Frontend estático pronto em '+output+'; API: '+url.origin);
 return html;
}
if(require.main===module){try{build();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={build};
