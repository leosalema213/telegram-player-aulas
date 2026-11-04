const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prune } = require('../scripts/prune-releases.cjs');

test('mantém a versão atual e a anterior, sem tocar nos perfis', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'player-prune-'));
  try {
    for (const [name, time] of [['0.1.0', 100], ['0.1.1', 200], ['0.1.2', 300]]) {
      const folder = path.join(root, name); fs.mkdirSync(folder);
      const file = path.join(folder, 'Player-de-Aulas-Instalar.exe'); fs.writeFileSync(file, 'teste'); fs.utimesSync(file, time, time);
    }
    fs.mkdirSync(path.join(root, 'perfil-teste'));
    assert.deepEqual(prune({ directory: root, currentVersion: '0.1.2' }).kept, ['0.1.2', '0.1.1']);
    assert.equal(fs.existsSync(path.join(root, '0.1.0')), false);
    assert.equal(fs.existsSync(path.join(root, 'perfil-teste')), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('não remove versões quando o instalador atual falta', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'player-prune-'));
  try {
    fs.mkdirSync(path.join(root, '0.1.0'));
    fs.writeFileSync(path.join(root, '0.1.0', 'Player-de-Aulas-Instalar.exe'), 'teste');
    assert.throws(() => prune({ directory: root, currentVersion: '0.1.2' }), /instalador atual/);
    assert.equal(fs.existsSync(path.join(root, '0.1.0')), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
