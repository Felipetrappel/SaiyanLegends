/* Saiyan Legends Online — versão para PC (Electron). Abre o jogo em janela própria, sem emulador e sem navegador.
 * Serve os arquivos do jogo em um servidor local (127.0.0.1, porta livre) e conecta no servidor de salas online. */
const { app, BrowserWindow, Menu } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, 'game');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { r.writeHead(400); return r.end(); }
      if (p.endsWith('/')) p += 'index.html';
      const f = path.resolve(ROOT, '.' + p); if (!f.startsWith(ROOT + path.sep)) { r.writeHead(404); return r.end(); }
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); r.end(d); });
    });
    s.listen(0, '127.0.0.1', () => res(s.address().port));
  });
}
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.whenReady().then(async () => {
  const port = await serve();
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({ width: 1280, height: 720, minWidth: 800, minHeight: 450, backgroundColor: '#0b0220', title: 'Saiyan Legends Online', autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: false, nodeIntegration: false, backgroundThrottling: false } });
  w.loadURL('http://127.0.0.1:' + port + '/index.html');
  w.webContents.setWindowOpenHandler(({ url }) => { require('electron').shell.openExternal(url); return { action: 'deny' }; });
  w.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F11') { w.setFullScreen(!w.isFullScreen()); e.preventDefault(); } });
  app.on('second-instance', () => { if (w.isMinimized()) w.restore(); w.focus(); });
});
app.on('window-all-closed', () => app.quit());
