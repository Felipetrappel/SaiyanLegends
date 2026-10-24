/* Configuração do multiplayer. Edite só este arquivo.
 *
 * serverUrl:  endereço do servidor de salas (server/server.js), por exemplo
 *               'wss://meu-servidor.exemplo.com'        (use wss:// se a página do jogo estiver em https)
 *               'ws://localhost:8080'                    (teste local)
 *             Vazio ('') = usa o MESMO endereço de onde a página foi aberta (…/ws). É o caso quando o próprio
 *             `node server/server.js` entrega o jogo. Também dá para testar com  ?server=wss://… na URL.
 *
 * Se o servidor não responder, o jogo entra em MODO OFFLINE (aviso visível): as salas existem só neste navegador,
 * não aparecem para outros jogadores e não há multiplayer.
 */
window.SL_CONFIG = Object.assign({ serverUrl: '' }, window.SL_CONFIG);
/* App Android (Capacitor): a página roda em https://localhost, sem servidor próprio — aponta para o servidor de salas na internet. */
if (!window.SL_CONFIG.serverUrl && location.protocol === 'https:' && location.hostname === 'localhost') window.SL_CONFIG.serverUrl = 'wss://saiyanlegends.onrender.com/ws';
