const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const repo = 'leosalema213/telegram-player-aulas';
const name = 'Player-de-Aulas-Instalar.exe';
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
function token() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const result = cp.spawnSync('git', ['credential', 'fill'], { cwd: root, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, windowsHide: true });
  const value = result.stdout?.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  if (!value) throw new Error('Autentique o Git com o GitHub ou configure GH_TOKEN.');
  return value;
}
(async () => {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A publicação exige uma versão estável.');
  if (git('status', '--porcelain')) throw new Error('Faça commit de todas as alterações antes de publicar.');
  const commit = git('rev-parse', 'HEAD');
  if (git('rev-parse', 'origin/main') !== commit) throw new Error('Envie o commit atual para origin/main antes de publicar.');
  const installer = path.join(root, 'release', version, name);
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(installer)) hash.update(chunk);
  const checksum = installer + '.sha256';
  fs.writeFileSync(checksum, `${hash.digest('hex')}  ${name}\n`);
  const headers = { Authorization: `Bearer ${token()}`, 'User-Agent': 'Player-de-Aulas-release', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(600000) });
    if (!response.ok) throw new Error(`GitHub respondeu ${response.status} durante a publicação.`);
    return response.json();
  }
  const api = `https://api.github.com/repos/${repo}/releases`;
  const releases = await request(api);
  if (releases.some(item => item.tag_name === `v${version}`)) throw new Error('Esta versão já existe. Confira a Release antes de repetir.');
  let release = await request(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: `v${version}`, target_commitish: commit, name: `Player de Aulas ${version}`, draft: true, body: 'Aplicativo para organizar e assistir aulas de canais do Telegram. Baixe o instalador para Windows; seus dados permanecem neste computador.' }) });
  for (const file of [installer, checksum]) {
    const asset = path.basename(file);
    await request(release.upload_url.split('{')[0] + '?name=' + encodeURIComponent(asset), { method: 'POST', headers: { 'Content-Type': file.endsWith('.exe') ? 'application/octet-stream' : 'text/plain', 'Content-Length': String(fs.statSync(file).size) }, body: Readable.toWeb(fs.createReadStream(file)), duplex: 'half' });
    console.log(`Enviado: ${asset}`);
  }
  release = await request(`${api}/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, make_latest: 'true' }) });
  console.log(`Release disponível: ${release.html_url}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
