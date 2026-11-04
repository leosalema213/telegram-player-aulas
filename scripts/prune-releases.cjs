const fs = require('node:fs');
const path = require('node:path');
const { parseVersion } = require('../versions.cjs');
const { version } = require('../package.json');
const workspace = fs.realpathSync(path.resolve(__dirname, '..'));
const releaseDirectory = path.join(workspace, 'release');
const installerName = 'Player-de-Aulas-Instalar.exe';
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

function prune({ directory = releaseDirectory, currentVersion = version, dryRun = false } = {}) {
  if (!fs.existsSync(directory)) return { kept: [], removed: [] };
  const root = path.resolve(directory);
  if (fs.lstatSync(root).isSymbolicLink() || !same(fs.realpathSync(root), root)) throw new Error('A pasta release não pode ser um link.');
  const builds = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && /^\d+\.\d+\.\d+(?:-preview\.\d+)?$/.test(entry.name) && parseVersion(entry.name)).map(entry => {
    const target = path.resolve(root, entry.name);
    if (!same(path.dirname(target), root) || !same(fs.realpathSync(target), target)) throw new Error('Pasta de versão inválida.');
    const installer = path.join(target, installerName);
    let time;
    if (fs.existsSync(installer)) {
      const stat = fs.lstatSync(installer);
      if (stat.isSymbolicLink() || !stat.isFile() || !same(fs.realpathSync(installer), installer)) throw new Error('Instalador inválido.');
      if (stat.size > 0) time = stat.mtimeMs;
    }
    return { name: entry.name, target, time };
  });
  const current = builds.find(build => build.name === currentVersion && build.time !== undefined);
  if (!current) throw new Error('Gere e confira o instalador atual antes de limpar versões anteriores.');
  const previous = builds.filter(build => build !== current && build.time !== undefined).sort((a, b) => b.time - a.time)[0];
  if (!previous) throw new Error('Nenhuma versão anterior com instalador disponível; a limpeza foi cancelada.');
  const removed = builds.filter(build => build !== current && build !== previous);
  function check(target) {
    const resolved = path.resolve(target);
    if (!resolved.startsWith(root + path.sep) || fs.lstatSync(resolved).isSymbolicLink() || !same(fs.realpathSync(resolved), resolved)) throw new Error('Limpeza recusada: link ou caminho fora de release.');
    if (fs.lstatSync(resolved).isDirectory()) for (const entry of fs.readdirSync(resolved)) check(path.join(resolved, entry));
  }
  for (const build of removed) check(build.target);
  console.log(`Manter: ${current.name}, ${previous.name}`);
  for (const build of removed) {
    check(build.target);
    console.log(`${dryRun ? 'Removeria' : 'Removendo'}: ${build.target}`);
    if (!dryRun) fs.rmSync(build.target, { recursive: true, force: false });
  }
  return { kept: [current.name, previous.name], removed: removed.map(build => build.name) };
}
if (require.main === module) {
  try { prune({ dryRun: process.argv.includes('--dry-run') }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prune };
