const { app, BrowserWindow, ipcMain, protocol, safeStorage, shell, net, dialog } = require('electron');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { connect } = require('./telegram.cjs');
const { normalizePhone } = require('./phone.cjs');
const { validSpeed: validPlaybackSpeed } = require('./playback.js');
const { AppUpdates } = require('./updates.cjs');
const { spawn } = require('node:child_process');

const demo = process.argv.includes('--demo');
app.setName(demo ? 'Player de Aulas Demo' : 'Player de Aulas');
if (demo && process.env.PLAYER_DEMO_USER_DATA) app.setPath('userData', path.resolve(process.env.PLAYER_DEMO_USER_DATA));
protocol.registerSchemesAsPrivileged([
  { scheme: 'lesson', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);

const directory = app.getPath('userData');
const sessionPath = path.join(directory, 'sessao.bin');
const appearancePath = path.join(directory, 'aparencia.json');
const playbackPath = path.join(directory, 'reproducao.json');
let window;
let telegram;
let credentials;
let account;
let courses = {};
let writes = Promise.resolve();
let updater;

async function readFile(file) {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function saveFile(file, data) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(file + '.tmp', data);
  await fs.rename(file + '.tmp', file);
}

async function openLibrary(id) {
  const file = path.join(directory, `biblioteca-${id}.json`);
  const data = await readFile(file);
  courses = data ? JSON.parse(data).courses : {};
  account = id;
  return Boolean(data);
}

function saveLibrary() {
  const file = path.join(directory, `biblioteca-${account}.json`);
  return saveQueued(file, { version: 1, courses });
}

function saveQueued(file, value) {
  const data = JSON.stringify(value, null, 2);
  writes = writes.catch(() => {}).then(() => saveFile(file, data));
  return writes;
}

async function rememberLogin() {
  const id = await telegram.account();
  const data = JSON.stringify({ ...credentials, session: telegram.session() });
  await saveFile(sessionPath, safeStorage.encryptString(data));
  await openLibrary(id);
}

function selectedLesson(courseId, lessonId) {
  return courses[courseId]?.lessons.find(lesson => lesson.id === lessonId);
}

const sampleChannel = { id: '-100123', title: 'Administração de Redes Linux' };
const sampleLessons = [
  { id: 22, title: '#F22 Comando MTR', chapter: 'Capítulo 6 · Ferramentas de conexão', duration: 30 },
  { id: 23, title: '#F23 Uso do Tcpdump – Parte 1', chapter: 'Capítulo 7 · Análise de rede', duration: 30 },
  { id: 24, title: '#F24 Uso do Tcpdump – Parte 2', chapter: 'Capítulo 7 · Análise de rede', duration: 30 },
];
const sampleDocuments = [{ id: 25, name: 'Material de exemplo.txt', size: 30 }];

function requireAccount() {
  if (!account) throw new Error('Conecte sua conta primeiro.');
}

function bind(name, action) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!window || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origem inválida.');
    return action(...args);
  });
}

function setupHandlers(startupError) {
  bind('open-api', () => shell.openExternal('https://my.telegram.org/apps'));
  bind('update-status', () => updater?.state);
  bind('app-version', () => app.getVersion());
  bind('update-check', () => updater?.check());
  bind('update-download', () => updater?.download());
  bind('update-install', () => updater?.install());
  bind('appearance', async () => {
    const data = await readFile(appearancePath);
    return data ? JSON.parse(data) : {};
  });
  bind('save-appearance', ({ mode, palette }) => saveQueued(appearancePath, { mode, palette }));
  bind('playback-settings', async () => {
    const data = await readFile(playbackPath);
    if (!data) return { speed: 1 };
    try { const { speed } = JSON.parse(data); return { speed: validPlaybackSpeed(speed) ? speed : 1 }; }
    catch { return { speed: 1 }; }
  });
  bind('save-playback-speed', speed => {
    if (!validPlaybackSpeed(speed)) throw new Error('Escolha uma velocidade entre 0,25× e 2×.');
    return saveQueued(playbackPath, { speed });
  });
  bind('library', () => ({ connected: !!account, demo, courses: Object.values(courses), startupError }));
  bind('send-code', async ({ apiId, apiHash, phone, country }) => {
    if (demo || account) throw new Error('A sessão já está aberta.');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento seguro do sistema está indisponível.');
    if (!Number.isSafeInteger(apiId) || apiId <= 0 || !/^[a-f\d]{32}$/i.test(apiHash)) {
      throw new Error('Confira o API ID, o API hash e o telefone com código do país.');
    }
    phone = normalizePhone(phone, country);
    if (telegram) await telegram.destroy();
    credentials = { apiId, apiHash };
    telegram = await connect(credentials);
    return telegram.sendCode(phone);
  });
  bind('sign-in', async code => {
    if (!telegram || account) throw new Error('Solicite um novo código.');
    const result = await telegram.signIn(code);
    if (result === 'connected') await rememberLogin();
    return result;
  });
  bind('password', async password => {
    if (!telegram || account) throw new Error('Solicite um novo código.');
    await telegram.password(password);
    await rememberLogin();
  });
  bind('disconnect', async () => {
    if (!account || demo) return;
    await writes;
    await telegram.logout();
    await fs.rm(sessionPath, { force: true });
    await telegram.destroy();
    telegram = undefined;
    account = undefined;
    courses = {};
  });
  let channels = [];
  bind('channels', async () => {
    requireAccount();
    const owner = account;
    const result = demo ? [sampleChannel] : await telegram.listChannels();
    if (owner !== account) throw new Error('A sessão mudou. Atualize a lista de canais.');
    channels = result;
    return channels;
  });
  bind('import-course', async id => {
    requireAccount();
    const owner = account;
    const channel = channels.find(item => item.id === id);
    if (!channel) throw new Error('Selecione um canal da lista.');
    const lessons = demo ? sampleLessons : await telegram.lessons(id);
    const documents = demo ? sampleDocuments : await telegram.documents(id);
    if (owner !== account) throw new Error('A sessão mudou durante a importação.');
    if (!lessons.length) throw new Error('O canal não tem aulas de vídeo disponíveis.');
    const previous = new Map((courses[id]?.lessons || []).map(item => [item.id, item]));
    courses[id] = {
      ...channel,
      documents,
      lessons: lessons.map(lesson => ({
        ...lesson,
        position: Math.min(previous.get(lesson.id)?.position || 0, lesson.duration),
        done: !!previous.get(lesson.id)?.done,
        updated: previous.get(lesson.id)?.updated || 0,
      })),
    };
    await saveLibrary();
    return Object.values(courses);
  });
  bind('remove-course', async id => {
    requireAccount();
    delete courses[id];
    await saveLibrary();
    return Object.values(courses);
  });
  bind('download-document', async (courseId, documentId) => {
    requireAccount();
    const owner = account;
    const entry = courses[courseId]?.documents?.find(item => item.id === documentId);
    if (!entry) throw new Error('Documento não encontrado. Atualize o curso e tente novamente.');
    const name = entry.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 180) || 'documento';
    const result = await dialog.showSaveDialog(window, { title: 'Salvar documento', defaultPath: name, buttonLabel: 'Salvar' });
    if (result.canceled || !result.filePath) return false;
    if (owner !== account || !courses[courseId]?.documents?.some(item => item.id === documentId)) throw new Error('O curso ou a sessão mudou. Tente novamente.');
    const partial = path.join(path.dirname(result.filePath), `.player-${randomUUID()}.tmp`);
    try {
      const source = demo ? { size: 30, chunks: () => [Buffer.from('Material de exemplo do curso.\n')] } : await telegram.document(courseId, documentId);
      if (source.size !== entry.size) throw new Error('O documento mudou. Atualize o curso e tente novamente.');
      await pipeline(Readable.from(source.chunks()), createWriteStream(partial, { flags: 'wx' }));
      if ((await fs.stat(partial)).size !== source.size) throw new Error('O download foi interrompido. Tente novamente.');
      if (owner !== account || !courses[courseId]?.documents?.some(item => item.id === documentId)) throw new Error('O curso ou a sessão mudou durante o download.');
      await fs.rename(partial, result.filePath);
      return true;
    } catch (error) {
      await fs.rm(partial, { force: true }).catch(() => {});
      throw error;
    }
  });
  bind('progress', async (id, lessonId, position, done) => {
    const lesson = selectedLesson(id, lessonId);
    if (!lesson) return;
    if (Number.isFinite(position)) lesson.position = Math.min(Math.max(position, 0), lesson.duration);
    if (typeof done === 'boolean') {
      lesson.done = done;
      if (!done && lesson.position >= lesson.duration) lesson.position = 0;
    }
    lesson.updated = Date.now();
    await saveLibrary();
  });
}

function byteRange(header, size) {
  if (!header) return [0, size - 1];
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return start <= end ? [start, end] : null;
}

async function streamLesson(request) {
  const url = new URL(request.url);
  const match = /^\/(-\d+)\/(\d+)$/.exec(url.pathname);
  if (url.hostname !== 'video' || !match || !selectedLesson(match[1], Number(match[2]))) {
    return new Response(null, { status: 404 });
  }
  try {
    let video;
    if (demo) {
      const file = path.join(__dirname, 'demo.mp4');
      video = {
        type: 'video/mp4',
        size: (await fs.stat(file)).size,
        chunks: (start, end) => createReadStream(file, { start, end }),
      };
    } else {
      video = await telegram.video(match[1], Number(match[2]));
    }
    if (!video?.size) return new Response(null, { status: 404 });
    const range = request.headers.get('range');
    const bounds = byteRange(range, video.size);
    if (!bounds) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${video.size}` } });
    const [start, end] = bounds;
    const headers = {
      'Content-Type': /^video\/[\w.+-]+$/.test(video.type) ? video.type : 'video/mp4',
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${video.size}`;
    const stream = Readable.from(video.chunks(start, end, request.signal), { objectMode: false });
    return new Response(Readable.toWeb(stream), { status: range ? 206 : 200, headers });
  } catch (error) {
    console.error('Falha ao abrir vídeo:', error.message);
    return new Response(null, { status: 502 });
  }
}

async function start() {
  let startupError;
  try {
    if (demo) {
      if (!(await openLibrary('demo'))) {
        courses[sampleChannel.id] = {
          ...sampleChannel,
          documents: sampleDocuments,
          lessons: sampleLessons.map(lesson => ({ ...lesson, position: 0, done: false, updated: 0 })),
        };
      }
    } else {
      const saved = await readFile(sessionPath);
      if (saved) {
        const { session, ...config } = JSON.parse(safeStorage.decryptString(saved));
        credentials = config;
        telegram = await connect(config, session);
        if (await telegram.authorized()) await openLibrary(await telegram.account());
      }
    }
  } catch {
    startupError = 'Não foi possível recuperar a sessão local. Confira a conexão ou entre novamente.';
  }
  setupHandlers(startupError);
  protocol.handle('lesson', streamLesson);
  window = new BrowserWindow({
    width: 1120, height: 780, minWidth: 780, minHeight: 540, backgroundColor: '#101010',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#141414', symbolColor: '#ededed', height: 48 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.removeMenu();
  if (app.isPackaged && !demo) {
    updater = new AppUpdates({
      version: app.getVersion(), cacheDir: path.join(directory, 'updates'), fetchImpl: net.fetch.bind(net),
      emit: state => { if (!window.isDestroyed()) window.webContents.send('update-status', state); },
      launchInstaller: file => new Promise((resolve, reject) => {
        const child = spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true });
        child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
      }),
      onQuit: () => setTimeout(() => app.quit(), 100),
    });
  }
  await window.loadFile('index.html');
  if (updater) { updater.cleanupInstalled(); updater.check(); }
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(start).catch(error => {
    console.error(error);
    app.quit();
  });
  app.on('window-all-closed', async () => {
    await writes.catch(() => {});
    app.quit();
  });
} else {
  app.quit();
}
