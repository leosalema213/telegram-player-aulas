const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const asar = require('@electron/asar');
const root = path.join(__dirname, '..');
const { version } = require('../package.json');
const archive = path.join(root, 'release', version, 'win-unpacked', 'resources', 'app.asar');
for (const name of fs.readdirSync(root).filter(file => /\.(cjs|js|html|css)$/.test(file))) {
  const original = fs.readFileSync(path.join(root, name));
  const packaged = asar.extractFile(archive, name);
  if (!packaged.equals(original)) throw new Error(`Arquivo empacotado difere do original: ${name}`);
  if (/\.(cjs|js)$/.test(name)) new vm.Script(packaged.toString('utf8'), { filename: name });
}
console.log('Arquivos empacotados conferem com o projeto e têm sintaxe válida.');
