// Render the editable brand with Electron and include every Windows icon size.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
  process.exitCode = result.status ?? 1;
} else {
  const { app, BrowserWindow } = require('electron');
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await win.loadURL('about:blank');
      const svg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
      const frames = [];
      for (const size of [16, 24, 32, 48, 64, 128, 256]) {
        const data = await win.webContents.executeJavaScript(`(async () => {
          const img = new Image(); img.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))};
          await img.decode(); const canvas = document.createElement('canvas');
          canvas.width = canvas.height = ${size}; canvas.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
          return canvas.toDataURL('image/png').split(',')[1];
        })()`);
        const png = Buffer.from(data, 'base64'); frames.push({ size, png });
        if (size === 256) fs.writeFileSync(path.join(root, 'assets/icon.png'), png);
      }
      const header = Buffer.alloc(6 + frames.length * 16);
      header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
      let offset = header.length;
      frames.forEach(({ size, png }, i) => {
        const entry = 6 + i * 16; header[entry] = header[entry + 1] = size === 256 ? 0 : size;
        header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += png.length;
      });
      fs.writeFileSync(path.join(root, 'assets/icon.ico'), Buffer.concat([header, ...frames.map(frame => frame.png)]));
      console.log('Marca PNG e ICO com sete tamanhos gerados.');
    } finally { win.destroy(); app.quit(); }
  }).catch(error => { console.error(error); app.exit(1); });
}
