// Orquestra o fluxo local; publicação só após autorização e commit revisado.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { parseVersion, nextPreview } = require('../versions.cjs');
const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(file, args) {
  const result = cp.spawnSync(file, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && file === npm });
  if (result.error || result.status !== 0) throw result.error || new Error(`${file} falhou (${result.status}).`);
}
function git(...args) { return cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
function version() { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; }
function changeVersion(target) {
  for (const name of ['package.json', 'package-lock.json']) {
    const file = path.join(root, name), source = fs.readFileSync(file, 'utf8');
    const before = version();
    let updated = source.replace(/("version"\s*:\s*")[^"]+("\s*[,}])/, (_match, a, b) => a + target + b);
    if (name === 'package-lock.json') updated = updated.replace(/("packages"\s*:\s*\{\s*""\s*:\s*\{[\s\S]*?"version"\s*:\s*")[^"]+("\s*[,}])/, (_match, a, b) => a + target + b);
    if (updated === source || !parseVersion(before)) throw new Error(`Não foi possível atualizar ${name}.`);
    fs.writeFileSync(file, updated);
  }
}
async function main() {
  const mode = process.argv[2];
  if (mode === 'preview') {
    let target = nextPreview(version());
    while (fs.existsSync(path.join(root, 'release', target)) || git('tag', '--list', `v${target}`)) target = nextPreview(target);
    changeVersion(target);
    run(npm, ['run', 'check']); run(npm, ['run', 'dist']);
    const file = path.join(root, 'release', target, 'Player-de-Aulas-Instalar.exe');
    if (!fs.statSync(file).size) throw new Error('Instalador vazio.');
    console.log(`Prévia pronta para validação: ${file}`);
  } else if (mode === 'publicar') {
    if (!process.argv.includes('--aprovado')) throw new Error('A publicação exige --aprovado, após validação explícita da prévia.');
    const current = parseVersion(version());
    if (!current?.preview) throw new Error('Prepare e valide uma prévia antes de publicar.');
    if (git('status', '--porcelain')) throw new Error('Revise e faça commit das alterações aprovadas antes de publicar; nenhum arquivo é incluído automaticamente.');
    if (git('branch', '--show-current') !== 'main') throw new Error('A publicação exige a branch main.');
    if (!fs.existsSync(path.join(root, 'release', version(), 'Player-de-Aulas-Instalar.exe'))) throw new Error('Instalador da prévia não encontrado.');
    if (fs.existsSync(path.join(root, 'release', current.base)) || git('tag', '--list', `v${current.base}`)) throw new Error('A versão final já existe; confira antes de continuar.');
    changeVersion(current.base); run(npm, ['run', 'check']); run(npm, ['run', 'dist']);
    run('git', ['add', '--', 'package.json', 'package-lock.json']);
    run('git', ['commit', '-m', `chore: release ${current.base}`]);
    run('git', ['push', 'origin', 'main']); run(npm, ['run', 'release']);
  } else throw new Error('Use: node scripts/fluxo-release.cjs preview | publicar --aprovado');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
