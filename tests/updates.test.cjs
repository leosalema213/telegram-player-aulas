const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { AppUpdates, isNewer, INSTALLER, REPOSITORY } = require('../updates.cjs');

test('ignora prévias remotas e compara a versão instalada', () => {
  assert.equal(isNewer('v0.1.0-preview.3', '0.1.0-preview.2'), false);
  assert.equal(isNewer('v0.1.0', '0.1.0-preview.2'), true);
  assert.equal(isNewer('v0.1.0', '0.1.0'), false);
});
test('consulta, falha no download, tenta novamente e verifica antes de instalar', async () => {
  const cacheDir = await fs.mkdtemp(path.join(process.cwd(), '.player-update-'));
  const content = Buffer.from('instalador de teste');
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  const url = `https://github.com/${REPOSITORY}/releases/download/v0.1.0/${INSTALLER}`;
  let downloads = 0; let launched = false; let quit = false;
  const updater = new AppUpdates({ version: '0.1.0-preview.2', cacheDir,
    fetchImpl: async address => address === url
      ? (++downloads === 1 ? new Response(null, { status: 503 }) : new Response(content))
      : Response.json({ tag_name: 'v0.1.0', assets: [{ name: INSTALLER, size: content.length, digest: `sha256:${digest}`, browser_download_url: url }] }),
    launchInstaller: async () => { launched = true; }, onQuit: () => { quit = true; },
  });
  try {
    assert.equal((await updater.check()).status, 'available');
    assert.equal((await updater.download()).status, 'error');
    assert.equal((await updater.check()).status, 'available');
    const downloaded = await updater.download();
    assert.equal(downloaded.status, 'ready', downloaded.message);
    assert.equal((await updater.install()).status, 'installing');
    assert.ok(launched && quit);
  } finally { await fs.rm(cacheDir, { recursive: true, force: true }); }
});

test('limpa instaladores concluídos sem tocar em versões futuras ou arquivos desconhecidos', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'player-update-cleanup-'));
  try {
    const old = path.join(cacheDir, '0.1.2'), current = path.join(cacheDir, '0.1.3'), future = path.join(cacheDir, '0.1.4');
    await Promise.all([old, current, future].map(folder => fs.mkdir(folder)));
    await fs.writeFile(path.join(old, INSTALLER), 'old');
    await fs.writeFile(path.join(current, INSTALLER + '.partial'), 'current');
    await fs.writeFile(path.join(future, INSTALLER), 'future');
    await fs.writeFile(path.join(old, 'notes.txt'), 'keep');
    const updater = new AppUpdates({ version: '0.1.3', cacheDir, fetchImpl: async () => new Response(null, { status: 404 }) });
    await updater.cleanupInstalled();
    await assert.rejects(fs.access(path.join(old, INSTALLER)));
    await assert.rejects(fs.access(path.join(current, INSTALLER + '.partial')));
    await fs.access(path.join(old, 'notes.txt'));
    await fs.access(path.join(future, INSTALLER));
  } finally { await fs.rm(cacheDir, { recursive: true, force: true }); }
});
