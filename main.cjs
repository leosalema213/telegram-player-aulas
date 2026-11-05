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
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
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

const PLAYLIST_TYPES = {
  '.mp3': ['audio', 'audio/mpeg'], '.m4a': ['audio', 'audio/mp4'], '.wav': ['audio', 'audio/wav'],
  '.ogg': ['audio', 'audio/ogg'], '.mp4': ['video', 'video/mp4'], '.webm': ['video', 'video/webm'],
  '.mov': ['video', 'video/quicktime'], '.png': ['image', 'image/png'], '.jpg': ['image', 'image/jpeg'],
  '.jpeg': ['image', 'image/jpeg'], '.webp': ['image', 'image/webp'], '.gif': ['image', 'image/gif'],
};

function playlistPaths(id) {
  requireAccount();
  id = String(id);
  if (!/^-\d+$/.test(id) || !courses[id]) throw new Error('Curso indisponível.');
  if (!/^(?:demo|\d+)$/.test(account)) throw new Error('Perfil indisponível.');
  return {
    index: path.join(directory, `playlist-${account}-${id}.json`),
    media: path.join(directory, `playlist-${account}-${id}`),
  };
}
async function readPlaylist(id) {
  const { index } = playlistPaths(id);
  const data = await readFile(index);
  if (!data) return { version: 1, folders: [{ id: 'root', name: 'Playlist', parent: null }], items: [] };
  const parsed = JSON.parse(data);
  if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.items) || !parsed.folders.some(folder => folder?.id === 'root' && folder.parent === null)) throw new Error('Não foi possível ler a playlist deste curso.');
  return parsed;
}
function validatePlaylist(data) {
  if (!data || !Array.isArray(data.folders) || !Array.isArray(data.items) || data.folders.length > 300 || data.items.length > 1000) throw new Error('Playlist inválida.');
  const ids = new Set();
  for (const folder of data.folders) {
    if (!folder || typeof folder.id !== 'string' || ids.has(folder.id) || typeof folder.name !== 'string' || folder.name.length > 160 || (folder.parent !== null && typeof folder.parent !== 'string') || (folder.color !== undefined && !/^#[0-9a-f]{6}$/i.test(folder.color))) throw new Error('Pastas inválidas.');
    ids.add(folder.id);
  }
  if (!ids.has('root') || data.folders.some(folder => folder.id !== 'root' && !ids.has(folder.parent))) throw new Error('Pastas inválidas.');
  const names = new Set();
  for (const item of data.items) {
    if (!item || typeof item.id !== 'string' || names.has(item.id) || !ids.has(item.folderId) || typeof item.name !== 'string' || item.name.length > 180 || !['audio', 'video', 'image'].includes(item.type) || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(item.file)) throw new Error('Arquivos inválidos.');
    names.add(item.id);
  }
}
async function savePlaylist(id, data) {
  validatePlaylist(data);
  const { index } = playlistPaths(id);
  await saveQueued(index, data);
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
  bind('window-minimize', () => { window.minimize(); });
  bind('window-maximize', () => {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  bind('window-close', () => { window.close(); });
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
  function notesFile(id) {
    requireAccount();
    if (typeof id !== 'string' || !/^-\d+$/.test(id) || !courses[id]) throw new Error('Curso indisponível.');
    if (!/^(?:demo|\d+)$/.test(account)) throw new Error('Perfil indisponível.');
    return path.join(directory, `anotacoes-${account}-${id}.json`);
  }
  bind('notes-load', async id => {
    const file = notesFile(id);
    const owner = account;
    await writes.catch(() => {});
    const data = await readFile(file);
    if (owner !== account || !courses[id]) throw new Error('O curso ou a sessão mudou.');
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed.notes)) throw new Error('Não foi possível ler as anotações.');
    return parsed.notes;
  });
  bind('notes-save', async (id, notes) => {
    const file = notesFile(id);
    if (!Array.isArray(notes) || notes.length > 1000 || notes.some(n => !n || typeof n.id !== 'string' || typeof n.title !== 'string' || typeof n.html !== 'string' || typeof n.date !== 'string' || typeof n.pinned !== 'boolean')) throw new Error('Anotações inválidas.');
    const value = { version: 1, notes };
    if (Buffer.byteLength(JSON.stringify(value)) > 20 * 1024 * 1024) throw new Error('As anotações excedem o limite de 20 MB.');
    await saveQueued(file, value);
  });
  bind('playlist-load', async id => {
    const owner = account;
    const playlist = await readPlaylist(id);
    if (owner !== account || !courses[id]) throw new Error('O curso ou a sessão mudou.');
    return playlist;
  });
  bind('playlist-import', async (id, folderId = 'root') => {
    const owner = account;
    const playlist = await readPlaylist(id);
    if (!playlist.folders.some(folder => folder.id === folderId)) throw new Error('Pasta indisponível.');
    const result = await dialog.showOpenDialog(window, {
      title: 'Adicionar à playlist', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Mídias', extensions: Object.keys(PLAYLIST_TYPES).map(extension => extension.slice(1)) }],
    });
    if (result.canceled || !result.filePaths.length) return playlist;
    const paths = playlistPaths(id);
    await fs.mkdir(paths.media, { recursive: true });
    const added = [];
    try {
      for (const source of result.filePaths) {
        const extension = path.extname(source).toLowerCase();
        const media = PLAYLIST_TYPES[extension];
        const stat = await fs.stat(source);
        if (!media || !stat.isFile() || stat.size > 2 * 1024 ** 3) throw new Error('Escolha áudios, vídeos ou imagens de até 2 GB.');
        const item = { id: randomUUID(), name: path.basename(source).slice(0, 180), type: media[0], mime: media[1], size: stat.size, folderId, file: `${randomUUID()}${extension}` };
        const target = path.join(paths.media, item.file);
        await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
        playlist.items.push(item);
        added.push(target);
      }
      if (owner !== account || !courses[id]) throw new Error('O curso ou a sessão mudou durante a importação.');
      await savePlaylist(id, playlist);
      return playlist;
    } catch (error) {
      await Promise.all(added.map(file => fs.rm(file, { force: true })));
      throw error;
    }
  });
  bind('playlist-folder-create', async (id, parent, name, color = '#d6b55b') => {
    const playlist = await readPlaylist(id);
    name = typeof name === 'string' ? name.trim() : '';
    if (!name || name.length > 160 || /[\\/:*?"<>|]/.test(name)) throw new Error('Informe um nome de pasta válido.');
    if (!playlist.folders.some(folder => folder.id === parent)) throw new Error('Pasta indisponível.');
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Escolha uma cor válida para a pasta.');
    playlist.folders.push({ id: randomUUID(), name, parent, color });
    await savePlaylist(id, playlist);
    return playlist;
  });
  bind('playlist-folder-update', async (id, folderId, name, color) => {
    const playlist = await readPlaylist(id);
    const folder = playlist.folders.find(entry => entry.id === folderId);
    name = typeof name === 'string' ? name.trim() : '';
    if (!folder || folder.id === 'root' || !name || name.length > 160 || /[\\/:*?"<>|]/.test(name) || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Confira o nome e a cor da pasta.');
    folder.name = name; folder.color = color;
    await savePlaylist(id, playlist);
    return playlist;
  });
  bind('playlist-move', async (id, itemId, folderId, direction) => {
    const playlist = await readPlaylist(id);
    if (!playlist.folders.some(folder => folder.id === folderId)) throw new Error('Pasta indisponível.');
    const item = playlist.items.find(entry => entry.id === itemId);
    if (!item) throw new Error('Arquivo indisponível.');
    if (direction === 'folder') item.folderId = folderId;
    else {
      const entries = playlist.items.filter(entry => entry.folderId === item.folderId);
      const index = entries.indexOf(item), destination = index + (direction === 'up' ? -1 : 1);
      if (!['up', 'down'].includes(direction) || destination < 0 || destination >= entries.length) return playlist;
      const other = entries[destination], first = playlist.items.indexOf(item), second = playlist.items.indexOf(other);
      [playlist.items[first], playlist.items[second]] = [playlist.items[second], playlist.items[first]];
    }
    await savePlaylist(id, playlist);
    return playlist;
  });
  bind('playlist-delete', async (id, kind, entryId) => {
    const playlist = await readPlaylist(id);
    const paths = playlistPaths(id);
    let removed = [];
    if (kind === 'item') {
      const item = playlist.items.find(entry => entry.id === entryId);
      if (!item) throw new Error('Arquivo indisponível.');
      playlist.items = playlist.items.filter(entry => entry !== item); removed = [item];
    } else {
      if (entryId === 'root' || !playlist.folders.some(folder => folder.id === entryId)) throw new Error('Pasta indisponível.');
      const folders = new Set([entryId]);
      for (let changed = true; changed;) { changed = false; for (const folder of playlist.folders) if (folders.has(folder.parent) && !folders.has(folder.id)) { folders.add(folder.id); changed = true; } }
      removed = playlist.items.filter(item => folders.has(item.folderId));
      playlist.items = playlist.items.filter(item => !folders.has(item.folderId));
      playlist.folders = playlist.folders.filter(folder => !folders.has(folder.id));
    }
    await savePlaylist(id, playlist);
    await Promise.all(removed.map(item => fs.rm(path.join(paths.media, item.file), { force: true })));
    return playlist;
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

async function streamPlaylistMedia(request) {
  const url = new URL(request.url);
  const match = /^\/(-\d+)\/([\w-]+)$/.exec(url.pathname);
  if (url.hostname !== 'playlist' || !match || !account || !courses[match[1]]) return new Response(null, { status: 404 });
  try {
    const playlist = await readPlaylist(match[1]);
    const item = playlist.items.find(entry => entry.id === match[2]);
    if (!item) return new Response(null, { status: 404 });
    const { media } = playlistPaths(match[1]);
    const file = path.resolve(media, item.file);
    if (path.dirname(file) !== path.resolve(media)) return new Response(null, { status: 404 });
    const stat = await fs.stat(file);
    const bounds = byteRange(request.headers.get('range'), stat.size);
    if (!bounds) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    const [start, end] = bounds;
    const headers = { 'Content-Type': item.mime || 'application/octet-stream', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (request.headers.get('range')) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    return new Response(Readable.toWeb(createReadStream(file, { start, end })), { status: request.headers.get('range') ? 206 : 200, headers });
  } catch {
    return new Response(null, { status: 404 });
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
  protocol.handle('media', streamPlaylistMedia);
  window = new BrowserWindow({
    width: 1120, height: 780, minWidth: 780, minHeight: 540, backgroundColor: '#101010',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    frame: false,
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
