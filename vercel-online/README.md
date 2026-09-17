# INKSHOT online: Vercel + servidor de partidas

Este pacote publica a página do jogo na **Vercel** e conecta o multiplayer a um **Web Service Node no Render**. O navegador conversa diretamente com o servidor das partidas por HTTPS; não há proxy de streaming em uma Function da Vercel.

Os arquivos já incluem o endereço configurável da API, a permissão de acesso entre os dois domínios (CORS), o build estático e o `vercel.json`. Esta entrega prepara a publicação; nenhum site foi publicado automaticamente.

## 1. Coloque os arquivos no GitHub

Extraia o ZIP. Crie um repositório e coloque **o conteúdo da pasta `INKSHOT-Online` na raiz**: `index.html`, `arena.cjs`, `server.cjs`, `package.json`, `package-lock.json`, `build-vercel.cjs` e `vercel.json`, entre os demais arquivos. Não envie apenas o ZIP.

Se preferir manter tudo em uma subpasta, selecione essa mesma subpasta como Root Directory nos dois serviços.

## 2. Publique o servidor no Render

No [Render](https://render.com/), crie um **Web Service** e conecte o repositório.

| Campo | Valor |
|---|---|
| Language / Runtime | Node |
| Build Command | `npm ci --ignore-scripts` |
| Start Command | `npm start` |
| Environment variable | `NODE_ENV=production` |
| Health Check Path | `/api/info` |
| Instâncias | **1** |

O servidor já usa `PORT` fornecida pela hospedagem e escuta em `0.0.0.0`. Não é necessário configurar uma porta fixa. A versão Node 24 está indicada no projeto.

Após o deploy, copie o endereço HTTPS público fornecido pelo Render. Exemplo ilustrativo: `https://inkshot-servidor.onrender.com`.

Abra esse endereço com `/api/info` no final. Deve aparecer um JSON com `"game":"INKSHOT"`. Guarde o endereço **sem `/api/info`** para a próxima etapa.

Referência: [Web Services do Render](https://render.com/docs/web-services).

## 3. Publique a página na Vercel

Na [Vercel](https://vercel.com/), escolha **Add New → Project** e importe o mesmo repositório.

| Campo | Valor |
|---|---|
| Framework Preset | Other |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci --ignore-scripts --no-audit --no-fund` |

O `vercel.json` já define os comandos e a pasta de saída. Antes de clicar em Deploy, adicione esta variável de ambiente para Production:

```text
INKSHOT_API_URL=https://SEU-SERVIDOR.onrender.com
```

Use o endereço real do servidor. Não acrescente `/api` e não use `localhost`. O build recusa endereço ausente ou inválido para evitar uma publicação com o multiplayer apontando para o lugar errado.

Publique e copie o domínio estável de produção, por exemplo `https://seu-inkshot.vercel.app`. Use esse domínio, não a URL temporária de um deploy específico.

Referência: [configuração de projetos da Vercel](https://vercel.com/docs/project-configuration).

## 4. Conecte os dois domínios

Volte às variáveis de ambiente do **servidor no Render** e adicione:

```text
ALLOWED_ORIGINS=https://SEU-PROJETO.vercel.app
```

Use o domínio real que você copiou na etapa 3, sem caminho, `?room=...` ou barra no final. Salve e reinicie/republique o serviço para aplicar a variável.

Para permitir também um domínio próprio, separe as origens por vírgula:

```text
ALLOWED_ORIGINS=https://seu-inkshot.vercel.app,https://jogo.seudominio.com
```

URLs de Preview da Vercel não são liberadas automaticamente. Para testar em uma delas, configure também `INKSHOT_API_URL` no ambiente Preview e acrescente sua origem exata a `ALLOWED_ORIGINS`.

## 5. Joguem pelo link da Vercel

1. Abra o domínio público da Vercel no Chrome, Edge ou Firefox.
2. Entre em MULTIPLAYER e crie uma sala.
3. Copie o convite e envie aos amigos.
4. Eles abrem o mesmo link pela internet e entram na sala.
5. O líder inicia e cada jogador clica em CONTINUAR para capturar o mouse.

O computador de quem criou a sala pode ficar apenas com o navegador aberto; a simulação roda na hospedagem.

## Se não conectar

- **Build reclama de INKSHOT_API_URL:** adicione a variável na Vercel e faça um novo deploy. Uma alteração nessa variável exige um novo build.
- **Servidor aparece indisponível:** abra o `/api/info` do Render e confira os logs do serviço.
- **CORS / origem não permitida:** compare o endereço da barra do navegador com `ALLOWED_ORIGINS` no Render. O protocolo e o domínio precisam coincidir. Reinicie o serviço após alterar a configuração.
- **Primeiro acesso demora:** serviços gratuitos do Render podem dormir após 15 minutos sem tráfego e levar cerca de um minuto para iniciar novamente. O painel do jogo aguarda até 90 segundos nessa conexão inicial. Se a hospedagem mostrar uma página intermediária, aguarde e tente de novo. [Limites do plano gratuito](https://render.com/docs/free).
- **Sala desapareceu após deploy:** as salas ficam na memória do processo e são perdidas quando o servidor reinicia. Crie outra sala.

Mantenha **uma instância** do servidor. Esta versão não distribui a memória das salas entre vários processos. Um plano que mantenha o serviço ativo evita a espera por inicialização; escolha o plano e a região conforme o uso da equipe.

## Por que separar o servidor da Vercel?

A arena atual mantém salas em memória e executa uma simulação contínua a 30 Hz. Functions têm duração limitada e chamadas diferentes podem cair em instâncias diferentes; preservar a mesma sala exigiria outra arquitetura. Este pacote conserva a simulação existente em um processo Node contínuo. [Duração das Functions](https://vercel.com/docs/functions/configuring-functions/duration), [conexões e estado entre instâncias](https://vercel.com/docs/functions/websockets).

## Teste local

`npm start` abre o servidor local. Acesse `http://localhost:3000`; sem um build da Vercel, o HTML usa a própria origem para a API. O modo solo ainda pode ser aberto diretamente pelo arquivo.
