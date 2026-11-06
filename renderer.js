const $ = id => document.getElementById(id);
const video = $('video');
let library;
let course;
let lesson;
let lastSaved = 0;
let restoring = false;
let view = 'course';
let playbackSpeed = 1;
let librarySpeed = 1;
let playlistData;
const expandedFolders = new Set();
let popupAnchor;
let playlistMode = 'list';
let activeAudioId;
const libraryAudio = $('media-audio');
let playlistPopupFolder;
let playlistFolderEditing;
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>';
const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>';
const volumeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
const mutedIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM22 9l-6 6m0-6 6 6"/></svg>';

function duration(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
}

function notice(message = '') {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

async function run(action, button) {
  if (button) button.disabled = true;
  notice();
  try {
    await action();
  } catch (error) {
    notice(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  } finally {
    if (button) button.disabled = false;
  }
}

function button(text, action, className) {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = text;
  item.className = className;
  item.onclick = action;
  return item;
}

function iconButton(label, path, action, className = 'quiet') {
  const item = button('', action, className);
  item.setAttribute('aria-label', label); item.title = label;
  item.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  return item;
}

function render() {
  $('login').hidden = library.connected;
  $('empty').hidden = !library.connected || !!course || view === 'dashboard';
  $('course').hidden = !course || view !== 'course';
  $('dashboard').hidden = !library.connected || view !== 'dashboard';
  $('home').hidden = !library.connected;
  $('home').setAttribute('aria-current', view === 'dashboard' ? 'page' : 'false');
  $('add').hidden = !library.connected;
  $('disconnect').hidden = !library.connected || library.demo;
  $('connection-label').textContent = library.demo ? 'Modo demonstração' : 'Dados locais';
  $('courses').replaceChildren(...library.courses.map(item => {
    const entry = button(item.title, () => selectCourse(item), 'course-link');
    if (item === course && view === 'course') entry.setAttribute('aria-current', 'true');
    return entry;
  }));
  if (view === 'dashboard') renderDashboard();
  if (!course) return;
  $('course-title').textContent = course.title;
  renderStats();
  renderLessons();
  renderDocuments();
  renderPlaylist();
  $('now-title').textContent = lesson?.title || 'Sala de reprodução';
  $('now-chapter').textContent = lesson?.chapter || '';
  $('lesson-navigation').hidden = !lesson;
  $('previous-lesson').disabled = !window.playbackUtils.adjacentLesson(course, lesson, -1);
  $('next-lesson').disabled = !window.playbackUtils.adjacentLesson(course, lesson, 1);
  $('toggle-done').textContent = lesson?.done ? 'Reabrir aula' : 'Concluir aula';
}

function renderDashboard() {
  const { lessons, completed, finished, remaining, percent } = window.playbackUtils.dashboardMetrics(library.courses);
  $('dashboard-lessons').textContent = `${completed} / ${lessons}`;
  $('dashboard-finished').textContent = `${finished} / ${library.courses.length}`;
  $('dashboard-progress').textContent = `${percent}%`;
  $('dashboard-remaining').textContent = duration(remaining);
  $('dashboard-empty').hidden = library.courses.length > 0;
  $('dashboard-courses').replaceChildren(...library.courses.map(item => {
    const card = button('', () => selectCourse(item), 'card dashboard-course');
    const title = document.createElement('strong'); title.textContent = item.title;
    const done = item.lessons.filter(lesson => lesson.done).length;
    const detail = document.createElement('span'); detail.textContent = `${done} de ${item.lessons.length} aulas concluídas`;
    const progress = document.createElement('progress'); progress.max = Math.max(1, item.lessons.length); progress.value = done;
    card.append(title, detail, progress); return card;
  }));
}

function renderStats() {
  let total = 0, left = 0, done = 0;
  for (const item of course.lessons) {
    total += item.duration;
    if (item.done) { done++; continue; }
    left += Math.max(0, item.duration - item.position);
  }
  const percent = total ? Math.floor((total - left) / total * 100) : 0;
  $('completed').textContent = `${done} / ${course.lessons.length}`;
  $('remaining').textContent = duration(left);
  $('percent').textContent = `${percent}%`;
  $('bar').value = percent;
  const next = window.playbackUtils.findResume([course])?.item;
  $('resume').hidden = !next;
  if (next) {
    $('resume').innerHTML = playIcon;
    $('resume').append(document.createTextNode(next.position > 0 ? `Continuar em ${duration(next.position)}` : 'Assistir próxima aula'));
    $('resume').onclick = () => selectLesson(next);
  }
}

function renderLessons() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const entries = [];
  let chapter;
  for (const item of course.lessons) {
    if (!`${item.title} ${item.chapter}`.toLocaleLowerCase().includes(query)) continue;
    if (item.chapter !== chapter) {
      chapter = item.chapter;
      const label = document.createElement('div');
      label.className = 'chapter';
      label.textContent = chapter;
      entries.push(label);
    }
    const row = document.createElement('div');
    row.className = 'lesson';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'lesson-check';
    check.checked = item.done;
    check.setAttribute('aria-label', `Marcar ${item.title} como concluída`);
    check.onchange = async () => {
      const owner = course;
      const done = check.checked;
      check.disabled = true;
      try {
        const position = item === lesson && !restoring && video.readyState >= 1 && !video.error ? video.currentTime : item.position;
        await window.player.progress(owner.id, item.id, position, done);
        item.position = !done && position >= item.duration ? 0 : position;
        item.done = done;
        item.updated = Date.now();
        if (course === owner) render();
      } catch (error) {
        check.checked = !done;
        notice(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      } finally { check.disabled = false; }
    };
    const play = button('', () => selectLesson(item), 'lesson-play');
    const icon = document.createElement('span');
    icon.innerHTML = playIcon;
    icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.textContent = item.title;
    const time = document.createElement('small');
    time.textContent = duration(item.duration);
    play.append(icon, title, time);
    row.append(check, play);
    if (item === lesson) row.setAttribute('aria-current', 'true');
    entries.push(row);
  }
  if (!entries.length) {
    const label = document.createElement('p');
    label.className = 'chapter';
    label.textContent = 'Nenhuma aula encontrada.';
    entries.push(label);
  }
  $('lessons').replaceChildren(...entries);
}

function renderDocuments() {
  const documents = course.documents;
  $('materials').hidden = Array.isArray(documents) && !documents.length;
  $('materials-count').textContent = documents ? `${documents.length} ${documents.length === 1 ? 'ARQUIVO' : 'ARQUIVOS'}` : '';
  $('materials-status').textContent = documents ? '' : 'Para buscar os materiais deste curso, clique em Atualizar.';
  $('documents').replaceChildren(...(documents || []).map(item => {
    const row = document.createElement('div');
    row.className = 'document-row';
    const name = document.createElement('span');
    name.textContent = item.name;
    const download = button('Baixar', async () => {
      const owner = course;
      download.disabled = true;
      $('materials-status').textContent = `Baixando ${item.name}…`;
      try {
        const saved = await window.player.downloadDocument(owner.id, item.id);
        if (course === owner) $('materials-status').textContent = saved ? 'Documento salvo.' : '';
      } catch (error) {
        if (course === owner) $('materials-status').textContent = error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      } finally { download.disabled = false; }
    }, 'secondary');
    row.append(name, download);
    return row;
  }));
}

function playlistItems(folderId) {
  return (playlistData?.items || []).filter(item => item.folderId === folderId);
}

function mediaUrl(item) {
  return `media://playlist/${encodeURIComponent(course.id)}/${encodeURIComponent(item.id)}`;
}

function renderPlaylist() {
  const folders = playlistData?.folders || [];
  if (!playlistData) return;
  if (activeAudioId && !playlistData.items.some(item => item.id === activeAudioId)) stopLibraryAudio();
  $('playlist-list').setAttribute('aria-pressed', String(playlistMode === 'list'));
  $('playlist-gallery').setAttribute('aria-pressed', String(playlistMode === 'gallery'));
  if (speedAnchor?.classList.contains('library-speed')) showSpeedMenu(false);
  $('playlist-media').replaceChildren(renderPlaylistBranch('root', folders));
  syncAudioControls();
}

function renderPlaylistBranch(folderId, folders) {
  const branch = document.createElement('div');
  branch.className = 'playlist-branch';
  for (const folder of folders.filter(entry => entry.parent === folderId)) {
    const entry = document.createElement('div'); entry.className = 'playlist-folder';
    entry.style.setProperty('--folder-color', folder.color || '#d6b55b');
    const expanded = expandedFolders.has(folder.id);
    const open = iconButton(folder.name, expanded ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6', () => {
      hidePlaylistPopup();
      if (expanded) expandedFolders.delete(folder.id);
      else expandedFolders.add(folder.id);
      renderPlaylist();
      document.getElementById(`folder-${folder.id}`)?.focus({ preventScroll: true });
    }, 'quiet icon-label');
    open.id = `folder-${folder.id}`;
    open.setAttribute('aria-expanded', String(expanded));
    const icon = document.createElement('span');
    icon.className = 'folder-symbol';
    icon.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/></svg>';
    open.append(icon, document.createTextNode(folder.name));
    const add = iconButton('Adicionar à pasta', 'M12 5v14M5 12h14', event => showFolderActions(folder, 'add', event.currentTarget));
    const options = iconButton('Opções da pasta', 'M12 5v.01M12 12v.01M12 19v.01', event => showFolderActions(folder, 'options', event.currentTarget));
    entry.append(open, add, options);
    branch.append(entry);
    if (expanded) branch.append(renderPlaylistBranch(folder.id, folders));
  }
  const entries = playlistItems(folderId);
  const content = entries.map((item, index) => {
    const entry = document.createElement('div'); entry.className = `media-entry ${playlistMode}`;
    const isAudio = item.type === 'audio';
    const open = isAudio ? document.createElement('span') : button(item.name, () => openMedia(item), 'media-open');
    if (isAudio) open.textContent = item.name;
    const title = document.createElement('div');
    title.className = 'media-title';
    if (isAudio) {
      const play = iconButton('Reproduzir', 'm9 5 12 7-12 7z', () => {
        if (activeAudioId === item.id && !libraryAudio.paused) libraryAudio.pause();
        else playLibraryAudio(item);
      });
      play.dataset.audioPlay = item.id;
      const stop = iconButton('Parar', 'M6 6h12v12H6z', stopLibraryAudio);
      stop.classList.add('audio-stop');
      stop.dataset.audioStop = item.id;
      title.append(play, stop);
    }
    title.append(open);
    if (playlistMode === 'gallery' && item.type === 'image') {
      const preview = document.createElement('img');
      preview.className = 'media-preview'; preview.src = mediaUrl(item); preview.alt = '';
      open.prepend(preview);
    }
    const detail = document.createElement('small'); detail.textContent = `${item.type === 'audio' ? 'Áudio' : item.type === 'video' ? 'Vídeo' : 'Imagem'} · ${Math.max(1, Math.ceil(item.size / 1024))} KB`;
    const controls = document.createElement('div'); controls.className = 'actions';
    const up = iconButton('Subir', 'm5 12 7-7 7 7M12 19V5', () => updatePlaylist(() => window.player.movePlaylist(course.id, item.id, folderId, 'up')));
    const down = iconButton('Descer', 'M12 5v14m-7-7 7 7 7-7', () => updatePlaylist(() => window.player.movePlaylist(course.id, item.id, folderId, 'down')));
    up.disabled = index === 0; down.disabled = index === entries.length - 1;
    controls.append(up, down);
    if (isAudio) {
      const wrapper = document.createElement('div');
      wrapper.className = 'speed-control';
      const speed = button(formatSpeed(librarySpeed), event => toggleSpeedMenu(event.currentTarget), 'speed-button library-speed');
      speed.setAttribute('aria-label', `Velocidade de ${item.name}`);
      speed.setAttribute('aria-expanded', 'false');
      speed.setAttribute('aria-controls', 'speed-menu');
      wrapper.append(speed);
      controls.append(wrapper);
    }
    controls.append(iconButton('Opções do arquivo', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3l-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 4h3l1-3 3-1 3-2-2-3 1-3-2-3-3 1-2-4Z', event => showFileActions(item, folders, event.currentTarget)));
    entry.append(title, detail, controls);
    if (isAudio) {
      const progress = document.createElement('div');
      progress.className = 'audio-progress';
      progress.dataset.audioProgress = item.id;
      progress.hidden = true;
      const seek = document.createElement('input');
      seek.type = 'range';
      seek.min = '0';
      seek.step = 'any';
      seek.setAttribute('aria-label', `Posição de reprodução de ${item.name}`);
      seek.oninput = () => {
        if (activeAudioId !== item.id || seek.disabled) return;
        libraryAudio.currentTime = seek.valueAsNumber;
        syncAudioProgress();
      };
      progress.append(seek, document.createElement('small'));
      entry.append(progress);
    }
    return entry;
  });
  if (!branch.childElementCount && !entries.length) {
    const empty = document.createElement('p'); empty.textContent = folderId === 'root' ? 'Adicione arquivos ou crie uma pasta.' : 'Pasta vazia.'; branch.append(empty);
  }
  if (content.length) {
    const list = document.createElement('div');
    list.className = `media-list ${playlistMode}`;
    list.append(...content); branch.append(list);
  }
  return branch;
}

async function loadPlaylist(owner = course) {
  if (!owner) return;
  const data = await window.player.loadPlaylist(owner.id);
  if (course !== owner) return;
  playlistData = data;
  renderPlaylist();
}

async function updatePlaylist(action) {
  const owner = course;
  $('playlist-status').textContent = 'Salvando playlist…';
  try {
    const data = await action();
    if (course === owner) { playlistData = data; $('playlist-status').textContent = ''; renderPlaylist(); }
  } catch (error) {
    if (course === owner) $('playlist-status').textContent = error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }
}

function closeMedia() {
  $('media-viewer').close();
}

function openMedia(item) {
  stopLibraryAudio();
  video.pause();
  $('media-title').textContent = item.name;
  for (const id of ['media-image', 'media-video']) $(id).hidden = true;
  const target = $(item.type === 'image' ? 'media-image' : 'media-video');
  target.src = mediaUrl(item); target.hidden = false;
  if (!$('media-viewer').open) $('media-viewer').showModal();
  if (item.type === 'video') {
    target.defaultPlaybackRate = 1;
    target.playbackRate = 1;
    target.play().catch(() => {});
  }
}

function saveProgress(done) {
  if (!lesson || (restoring && done === undefined)) return Promise.resolve();
  const hasVideo = !restoring && video.readyState >= 1 && !video.error;
  const position = hasVideo ? Math.min(video.currentTime, lesson.duration) : lesson.position;
  if (position === lesson.position && done === undefined) return Promise.resolve();
  lesson.position = done === false && position >= lesson.duration ? 0 : position;
  if (done !== undefined) lesson.done = done;
  lesson.updated = Date.now();
  lastSaved = lesson.updated;
  renderStats();
  return window.player.progress(course.id, lesson.id, lesson.position, done).catch(error => notice(error.message));
}

function stop() {
  const saved = saveProgress();
  stopLibraryAudio();
  if ($('media-viewer').open) closeMedia();
  lesson = undefined;
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.hidden = true;
  $('poster').hidden = false;
  updatePlayer();
  return saved;
}

function selectCourse(item) {
  if (item === course && view === 'course') return;
  stop();
  course = item;
  playlistData = undefined;
  expandedFolders.clear();
  hidePlaylistPopup();
  view = 'course';
  $('search').value = '';
  render();
  $('playlist-media').replaceChildren();
  loadPlaylist(item).catch(error => { if (course === item) $('playlist-status').textContent = error.message; });
  const resume = item && window.playbackUtils.findResume([item])?.item;
  if (resume) selectLesson(resume, false);
}
$('home').onclick = () => { stop(); view = 'dashboard'; render(); };
$('window-minimize').onclick = () => run(() => window.player.minimizeWindow());
$('window-maximize').onclick = () => run(() => window.player.maximizeWindow());
$('window-close').onclick = () => run(async () => {
  await stop();
  await window.player.closeWindow();
});
$('open-notes').onclick = () => window.notebook.open(course);
$('playlist-list').onclick = () => { playlistMode = 'list'; renderPlaylist(); };
$('playlist-gallery').onclick = () => { playlistMode = 'gallery'; renderPlaylist(); };
$('playlist-add').onclick = event => { popupAnchor = event.currentTarget; showFilesPopup(); };
$('playlist-new-folder').onclick = event => { popupAnchor = event.currentTarget; showFolderEditor('root'); };
function folderLabel(folder) {
  const folders = playlistData?.folders || [];
  const labels = [];
  for (let current = folder; current; current = folders.find(entry => entry.id === current.parent)) {
    if (current.id !== 'root') labels.unshift(current.name);
  }
  return labels.join(' / ') || 'Soltos na Biblioteca';
}
function hidePlaylistPopup() {
  $('playlist-popup').hidden = true;
  playlistPopupFolder = undefined; playlistFolderEditing = undefined;
}
function positionPlaylistPopup() {
  const popup = $('playlist-popup');
  if (popup.hidden) return;
  if (!popupAnchor?.isConnected) { hidePlaylistPopup(); return; }
  const rect = popupAnchor.getBoundingClientRect();
  const gap = 6, margin = 8;
  const below = innerHeight - rect.bottom - gap - margin;
  const above = rect.top - gap - margin;
  if (rect.bottom < 0 || rect.top > innerHeight) { hidePlaylistPopup(); return; }
  popup.style.maxHeight = '';
  const openAbove = popup.offsetHeight > below && above > below;
  popup.style.maxHeight = `${Math.max(0, openAbove ? above : below)}px`;
  popup.style.top = `${openAbove ? rect.top - gap - popup.offsetHeight : rect.bottom + gap}px`;
  const rightLimit = innerWidth - popup.offsetWidth - margin;
  popup.style.left = `${Math.max(margin, rect.right <= rightLimit ? rect.right : Math.min(rect.right - popup.offsetWidth, rightLimit))}px`;
}
window.addEventListener('resize', positionPlaylistPopup);
window.addEventListener('scroll', positionPlaylistPopup, true);
document.addEventListener('pointerdown', event => {
  if (!$('playlist-popup').contains(event.target) && !popupAnchor?.contains(event.target)) hidePlaylistPopup();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('playlist-popup').hidden) {
    hidePlaylistPopup(); popupAnchor?.focus({ preventScroll: true });
  }
});
function showFolderEditor(folderId, editing) {
  $('playlist-file-actions').hidden = true;
  if (!playlistData) return;
  const folder = playlistData.folders.find(entry => entry.id === (editing || folderId));
  playlistPopupFolder = folderId; playlistFolderEditing = editing;
  $('playlist-popup').hidden = false;
  $('playlist-folder-form').hidden = false; $('playlist-files-form').hidden = true; $('playlist-folder-actions').hidden = true;
  $('playlist-folder-title').textContent = editing ? 'Editar pasta' : folderId === 'root' ? 'Nova pasta' : 'Nova subpasta';
  $('playlist-folder-create').textContent = editing ? 'Salvar alterações' : 'Criar pasta';
  $('playlist-folder-name').value = editing ? folder.name : '';
  $('playlist-folder-color').value = editing ? folder.color || '#d6b55b' : '#d6b55b';
  $('playlist-folder-status').textContent = '';
  positionPlaylistPopup();
  $('playlist-folder-name').focus({ preventScroll: true });
}
function showFilesPopup() {
  $('playlist-file-actions').hidden = true;
  if (!playlistData) return;
  const select = $('playlist-files-folder');
  select.replaceChildren(...playlistData.folders.map(folder => new Option(folderLabel(folder), folder.id)));
  select.value = 'root';
  $('playlist-popup').hidden = false;
  $('playlist-folder-form').hidden = true; $('playlist-files-form').hidden = false; $('playlist-folder-actions').hidden = true;
  positionPlaylistPopup();
  select.focus({ preventScroll: true });
}
function showFolderActions(folder, kind, anchor) {
  $('playlist-file-actions').hidden = true;
  popupAnchor = anchor;
  playlistPopupFolder = folder.id;
  const actions = $('playlist-folder-actions');
  $('playlist-popup').hidden = false;
  $('playlist-folder-form').hidden = true; $('playlist-files-form').hidden = true; actions.hidden = false;
  $('playlist-folder-subfolder').hidden = kind !== 'add';
  $('playlist-folder-add').hidden = kind !== 'add';
  $('playlist-folder-edit').hidden = kind !== 'options';
  $('playlist-folder-delete').hidden = kind !== 'options';
  positionPlaylistPopup();
  actions.querySelector('button:not([hidden])').focus({ preventScroll: true });
}
function showFileActions(item, folders, anchor) {
  popupAnchor = anchor;
  for (const id of ['playlist-folder-form', 'playlist-files-form', 'playlist-folder-actions']) $(id).hidden = true;
  $('playlist-file-actions').hidden = false;
  $('playlist-popup').hidden = false;
  const move = $('playlist-file-move');
  move.replaceChildren(new Option('Escolher pasta…', ''), ...folders.filter(folder => folder.id !== item.folderId).map(folder => new Option(folderLabel(folder), folder.id)));
  move.onchange = () => {
    if (!move.value) return;
    hidePlaylistPopup();
    updatePlaylist(() => window.player.movePlaylist(course.id, item.id, move.value, 'folder'));
  };
  $('playlist-file-delete').onclick = () => confirmLibraryDelete('item', item);
  positionPlaylistPopup();
  move.focus({ preventScroll: true });
}
document.querySelectorAll('[data-folder-color]').forEach(control => {
  control.onclick = () => { $('playlist-folder-color').value = control.dataset.folderColor; };
});
document.querySelectorAll('.playlist-popup-cancel').forEach(control => { control.onclick = hidePlaylistPopup; });
$('playlist-popup-cancel').onclick = hidePlaylistPopup;
$('playlist-folder-form').onsubmit = async event => {
  event.preventDefault();
  const name = $('playlist-folder-name').value;
  const submit = $('playlist-folder-create');
  submit.disabled = true;
  $('playlist-folder-status').textContent = '';
  try {
    const owner = course, color = $('playlist-folder-color').value;
    const parent = playlistPopupFolder;
    const data = playlistFolderEditing
      ? await window.player.updatePlaylistFolder(owner.id, playlistFolderEditing, name, color)
      : await window.player.createPlaylistFolder(owner.id, playlistPopupFolder, name, color);
    if (course === owner) { playlistData = data; expandLibraryPath(parent); hidePlaylistPopup(); renderPlaylist(); }
  } catch (error) {
    $('playlist-folder-status').textContent = error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    positionPlaylistPopup();
  } finally { submit.disabled = false; }
};
$('playlist-files-form').onsubmit = event => {
  event.preventDefault();
  const folderId = $('playlist-files-folder').value;
  importLibraryFiles(folderId);
};
function expandLibraryPath(folderId) {
  for (let folder = playlistData.folders.find(entry => entry.id === folderId); folder?.parent; folder = playlistData.folders.find(entry => entry.id === folder.parent)) expandedFolders.add(folder.id);
}
function importLibraryFiles(folderId) {
  hidePlaylistPopup();
  const owner = course;
  updatePlaylist(async () => {
    const data = await window.player.importPlaylist(owner.id, folderId);
    if (course === owner) expandLibraryPath(folderId);
    return data;
  });
}
$('playlist-folder-subfolder').onclick = () => showFolderEditor(playlistPopupFolder);
$('playlist-folder-add').onclick = () => importLibraryFiles(playlistPopupFolder);
$('playlist-folder-edit').onclick = () => showFolderEditor(playlistPopupFolder, playlistPopupFolder);
$('playlist-folder-delete').onclick = () => confirmLibraryDelete('folder', playlistData.folders.find(entry => entry.id === playlistPopupFolder));
function confirmLibraryDelete(kind, entry) {
  hidePlaylistPopup();
  const owner = course;
  const dialog = $('library-delete');
  $('library-delete-message').textContent = kind === 'folder' ? `Excluir “${entry.name}” e todo o seu conteúdo?` : `Excluir “${entry.name}” da Biblioteca?`;
  dialog.returnValue = '';
  dialog.onclose = () => {
    if (dialog.returnValue === 'delete' && course === owner) updatePlaylist(() => window.player.deletePlaylist(owner.id, kind, entry.id));
  };
  dialog.showModal();
};
$('media-close').onclick = closeMedia;
$('media-viewer').onclose = () => {
  const mediaVideo = $('media-video');
  mediaVideo.pause();
  mediaVideo.removeAttribute('src');
  mediaVideo.load();
  $('media-image').removeAttribute('src');
};
function syncAudioControls() {
  for (const control of document.querySelectorAll('[data-audio-play]')) {
    const playing = control.dataset.audioPlay === activeAudioId && !libraryAudio.paused;
    const label = playing ? 'Pausar' : 'Reproduzir';
    control.setAttribute('aria-label', label);
    control.title = label;
    control.querySelector('path').setAttribute('d', playing ? 'M9 5v14M15 5v14' : 'm9 5 12 7-12 7z');
  }
  for (const control of document.querySelectorAll('[data-audio-stop]')) control.disabled = control.dataset.audioStop !== activeAudioId;
  for (const progress of document.querySelectorAll('[data-audio-progress]')) progress.hidden = progress.dataset.audioProgress !== activeAudioId;
  syncAudioProgress();
}
function syncAudioProgress() {
  const progress = document.querySelector('.audio-progress:not([hidden])');
  if (!progress) return;
  const [seek, time] = progress.children;
  const length = libraryAudio.duration;
  const ready = Number.isFinite(length) && length > 0;
  seek.disabled = !ready;
  seek.max = ready ? String(length) : '0';
  seek.valueAsNumber = ready ? libraryAudio.currentTime : 0;
  const elapsed = duration(Math.floor(seek.valueAsNumber));
  const total = ready ? duration(Math.floor(length)) : '–:––';
  seek.setAttribute('aria-valuetext', `${elapsed} de ${total}`);
  time.textContent = `${elapsed} / ${total}`;
}
function stopLibraryAudio() {
  if (!activeAudioId) return;
  activeAudioId = undefined;
  libraryAudio.pause();
  libraryAudio.removeAttribute('src');
  libraryAudio.load();
  syncAudioControls();
}
function playLibraryAudio(item) {
  video.pause();
  if (activeAudioId !== item.id) {
    activeAudioId = item.id;
    libraryAudio.src = mediaUrl(item);
    syncAudioControls();
  }
  libraryAudio.playbackRate = librarySpeed;
  libraryAudio.play().catch(error => {
    if (error.name !== 'AbortError' && activeAudioId === item.id) {
      stopLibraryAudio();
      $('playlist-status').textContent = 'Não foi possível reproduzir este áudio.';
    }
  });
}
libraryAudio.onplay = libraryAudio.onpause = syncAudioControls;
libraryAudio.ondurationchange = libraryAudio.ontimeupdate = syncAudioProgress;
libraryAudio.onended = () => {
  const item = playlistData?.items.find(entry => entry.id === activeAudioId);
  const next = item && playlistItems(item.folderId).slice(playlistItems(item.folderId).indexOf(item) + 1).find(entry => entry.type === 'audio');
  if (next) playLibraryAudio(next);
  else stopLibraryAudio();
};
window.addEventListener('notebook-error', event => notice(event.detail));
function closeCourseMenu() { $('course-menu-items').hidden = true; $('course-menu-toggle').setAttribute('aria-expanded', 'false'); }
$('course-menu-toggle').onclick = () => {
  const open = $('course-menu-items').hidden;
  $('course-menu-items').hidden = !open; $('course-menu-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('refresh').focus();
};
document.addEventListener('click', event => { if (!event.target.closest('.course-menu')) closeCourseMenu(); });
$('course-menu-items').onkeydown = event => {
  const items = [$('refresh'), $('remove')], index = items.indexOf(document.activeElement);
  if (event.key === 'Escape') { event.preventDefault(); closeCourseMenu(); $('course-menu-toggle').focus(); }
  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + 1) % 2; items[next].focus();
  } else if (event.key === 'Tab') closeCourseMenu();
};

function selectLesson(item, autoplay = true) {
  if (item === lesson && !video.error) {
    if (autoplay) video.play().catch(() => {});
    return;
  }
  stop();
  notice();
  lesson = item;
  restoring = true;
  video.hidden = false;
  $('poster').hidden = true;
  video.src = `lesson://video/${course.id}/${item.id}`;
  video.playbackRate = playbackSpeed;
  if (autoplay) video.play().catch(() => {});
  render();
}

video.addEventListener('loadedmetadata', () => {
  if (!lesson || !restoring) return;
  if (lesson.position > 0 && lesson.position < video.duration) video.currentTime = lesson.position;
  restoring = false;
  updatePlayer();
});
video.addEventListener('timeupdate', () => {
  updatePlayer();
  if (Date.now() - lastSaved >= 5000) saveProgress();
});
video.addEventListener('play', () => { stopLibraryAudio(); updatePlayer(); });
video.addEventListener('pause', () => { updatePlayer(); saveProgress(); });
video.addEventListener('seeked', () => saveProgress());
video.addEventListener('ended', async () => {
  await saveProgress(true);
  render();
});
video.addEventListener('error', () => {
  updatePlayer();
  if (lesson) notice('Não foi possível reproduzir a aula. Confira sua conexão e tente abrir o vídeo novamente.');
});
window.addEventListener('beforeunload', () => saveProgress());
function updatePlayer() {
  const active = !!lesson && !video.error;
  const length = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : lesson?.duration || 0;
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const playing = active && !video.paused && !video.ended;
  $('play-pause').innerHTML = playing ? pauseIcon : playIcon;
  $('play-pause').setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir');
  $('play-pause').title = playing ? 'Pausar' : 'Reproduzir';
  $('play-pause').disabled = !active;
  $('seek').disabled = !active || !length;
  $('seek').value = length ? Math.min(1000, current / length * 1000) : 0;
  $('current-time').textContent = duration(current);
  $('total-time').textContent = duration(length);
}
function togglePlayback() {
  if (!lesson) return;
  if (video.paused || video.ended) video.play().catch(() => notice('Não foi possível reproduzir a aula. Tente novamente.'));
  else video.pause();
}
$('play-pause').onclick = togglePlayback;
video.onclick = () => { video.focus({ preventScroll: true }); togglePlayback(); };
video.onkeydown = event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !lesson || restoring || video.error || !Number.isFinite(video.duration) || video.duration <= 0) return;
  event.preventDefault();
  const position = window.playbackUtils.arrowSeek(video.currentTime, video.duration, event.key);
  if (position !== undefined) video.currentTime = position;
};
$('seek').oninput = event => {
  const length = Number.isFinite(video.duration) ? video.duration : 0;
  if (length > 0) video.currentTime = Number(event.target.value) / 1000 * length;
};
$('volume').oninput = event => { video.volume = Number(event.target.value) / 100; video.muted = video.volume === 0; };
$('mute').onclick = () => { video.muted = !video.muted; };
video.addEventListener('volumechange', () => {
  $('mute').innerHTML = video.muted || video.volume === 0 ? mutedIcon : volumeIcon;
  $('mute').setAttribute('aria-label', video.muted || video.volume === 0 ? 'Ativar som' : 'Silenciar');
  $('mute').title = $('mute').getAttribute('aria-label');
  $('volume').value = video.muted ? 0 : Math.round(video.volume * 100);
});
function displaySpeed(speed) {
  playbackSpeed = speed;
  video.defaultPlaybackRate = speed;
  video.playbackRate = speed;
  $('speed-toggle').textContent = formatSpeed(speed);
}
function formatSpeed(speed) {
  return `${String(speed).replace('.', ',')}×`;
}
function displaySpeedMenuValue(speed) {
  $('speed-number').value = String(speed);
  $('speed-range').value = String(speed);
  $('speed-status').textContent = '';
  document.querySelectorAll('[data-speed]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === speed)));
}
async function setSpeed(value, save = true) {
  const isLibrary = speedAnchor?.classList.contains('library-speed');
  const speed = Number(value);
  if (!window.playbackUtils.validSpeed(speed)) {
    $('speed-status').textContent = 'Informe um valor entre 0,25 e 2, com até duas casas decimais.';
    return;
  }
  if (isLibrary) {
    librarySpeed = speed;
    libraryAudio.defaultPlaybackRate = speed;
    libraryAudio.playbackRate = speed;
    for (const button of document.querySelectorAll('.library-speed')) button.textContent = formatSpeed(speed);
  } else {
    displaySpeed(speed);
  }
  displaySpeedMenuValue(speed);
  if (save && !isLibrary) {
    try { await window.player.savePlaybackSpeed(speed); }
    catch {
      if (speedAnchor === $('speed-toggle')) $('speed-status').textContent = 'Não foi possível salvar a velocidade. Tente novamente.';
    }
  }
}
let speedAnchor;
function currentMenuSpeed() {
  return speedAnchor?.classList.contains('library-speed') ? librarySpeed : playbackSpeed;
}
function showSpeedMenu(open, anchor = $('speed-toggle')) {
  const menu = $('speed-menu');
  speedAnchor?.setAttribute('aria-expanded', 'false');
  speedAnchor = open ? anchor : undefined;
  (open ? anchor : $('speed-toggle')).parentElement.append(menu);
  menu.hidden = !open;
  if (open) {
    displaySpeedMenuValue(currentMenuSpeed());
    anchor.setAttribute('aria-expanded', 'true');
  }
}
function toggleSpeedMenu(anchor) {
  showSpeedMenu(speedAnchor !== anchor, anchor);
}
$('speed-toggle').onclick = event => toggleSpeedMenu(event.currentTarget);
$('speed-range').oninput = event => setSpeed(event.target.value, false);
$('speed-range').onchange = event => setSpeed(event.target.value);
$('speed-number').onchange = event => setSpeed(event.target.value);
$('speed-minus').onclick = () => setSpeed(Math.max(0.25, Math.round((currentMenuSpeed() - 0.05) * 100) / 100));
$('speed-plus').onclick = () => setSpeed(Math.min(2, Math.round((currentMenuSpeed() + 0.05) * 100) / 100));
document.querySelectorAll('[data-speed]').forEach(button => { button.onclick = () => setSpeed(button.dataset.speed); });
document.addEventListener('click', event => { if (!event.target.closest('.speed-control')) showSpeedMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !speedAnchor) return;
  const anchor = speedAnchor;
  showSpeedMenu(false);
  anchor.focus();
});
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector('.viewing').requestFullscreen();
  } catch { notice('Não foi possível abrir a tela cheia.'); }
};
document.addEventListener('fullscreenchange', () => {
  const active = !!document.fullscreenElement;
  $('fullscreen').setAttribute('aria-label', active ? 'Sair da tela cheia' : 'Tela cheia');
  $('fullscreen').title = $('fullscreen').getAttribute('aria-label');
});
$('search').oninput = renderLessons;
$('toggle-sidebar').onclick = () => {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  const label = collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral';
  $('toggle-sidebar').setAttribute('aria-expanded', String(!collapsed));
  $('toggle-sidebar').setAttribute('aria-label', label);
  $('toggle-sidebar').title = label;
};
$('theater').onclick = () => {
  const expanded = $('theater').getAttribute('aria-pressed') !== 'true';
  $('theater').setAttribute('aria-pressed', String(expanded));
  $('theater').setAttribute('aria-label', expanded ? 'Mostrar aulas' : 'Modo teatro');
  $('theater').title = expanded ? 'Mostrar a lista de aulas' : 'Ampliar vídeo e ocultar a lista de aulas';
  $('playlist').hidden = expanded;
  document.querySelector('.course-grid').classList.toggle('theater', expanded);
};
$('toggle-done').onclick = () => {
  if (lesson.done && video.ended) {
    video.pause();
    video.currentTime = 0;
  }
  saveProgress(!lesson.done);
  render();
};
function navigateLesson(offset) {
  const target = window.playbackUtils.adjacentLesson(course, lesson, offset);
  if (target) selectLesson(target);
}
$('previous-lesson').onclick = () => navigateLesson(-1);
$('next-lesson').onclick = () => navigateLesson(1);

async function initialize() {
  const settings = await window.player.playbackSettings().catch(() => { notice('Não foi possível ler a velocidade salva.'); return { speed: 1 }; });
  displaySpeed(settings.speed);
  library = await window.player.library();
  course = library.courses[0];
  const recent = window.playbackUtils.findResume(library.courses);
  if (recent) course = recent.course;
  render();
  if (course) loadPlaylist(course).catch(error => { if (course) $('playlist-status').textContent = error.message; });
  if (recent) selectLesson(recent.item, false);
  if (library.startupError) notice(library.startupError);
}

function loginStep(step) {
  for (const id of ['credentials', 'code', 'password']) $(id).hidden = id !== step;
  $(step).querySelector('input').focus();
}

function form(id, action) {
  $(id).onsubmit = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    run(() => action(data), event.submitter);
  };
}

$('api-link').onclick = () => run(() => window.player.openApi(), $('api-link'));
form('credentials', async ({ apiId, apiHash, phone, country }) => {
  const { email } = await window.player.sendCode({ apiId: Number(apiId), apiHash: apiHash.trim(), phone: phone.trim(), country });
  $('code-label').textContent = typeof email === 'string' ? `Código enviado para ${email}` : email ? 'Código enviado por e-mail' : 'Código enviado pelo Telegram';
  $('code').reset();
  loginStep('code');
});
form('code', async ({ value }) => {
  if (await window.player.signIn(value.trim()) === 'password') loginStep('password');
  else {
    $('code').reset();
    $('credentials').reset();
    await initialize();
  }
});
form('password', async ({ value }) => {
  await window.player.password(value);
  $('password').reset();
  $('code').reset();
  $('credentials').reset();
  await initialize();
});
document.querySelectorAll('.back').forEach(control => {
  control.onclick = () => loginStep('credentials');
});
$('disconnect').onclick = () => run(async () => {
  await stop();
  await window.player.disconnect();
  await initialize();
  loginStep('credentials');
}, $('disconnect'));

async function openImporter() {
  const dialog = $('importer');
  const select = $('channels');
  const submit = $('do-import');
  const status = $('import-status');
  select.replaceChildren();
  status.textContent = 'Buscando canais…';
  submit.disabled = true;
  dialog.showModal();
  try {
    const channels = await window.player.channels();
    select.replaceChildren(...channels.map(item => new Option(item.title, item.id)));
    status.textContent = channels.length ? '' : 'Nenhum canal encontrado nesta conta.';
    submit.disabled = !channels.length;
  } catch (error) {
    status.textContent = error.message;
  }
}

async function importCourse(id) {
  const courses = await window.player.importCourse(id);
  if (lesson && course.id === id) {
    await stop();
    library = await window.player.library();
  } else {
    library.courses = courses;
  }
  const updated = library.courses.find(item => item.id === id);
  selectCourse(updated);
}

$('add').onclick = $('add-empty').onclick = openImporter;
$('cancel-import').onclick = () => $('importer').close();
$('import-form').onsubmit = async event => {
  event.preventDefault();
  $('do-import').disabled = $('cancel-import').disabled = true;
  $('import-status').textContent = 'Importando aulas…';
  try {
    await importCourse($('channels').value);
    $('importer').close();
  } catch (error) {
    $('import-status').textContent = error.message;
  } finally {
    $('do-import').disabled = $('cancel-import').disabled = false;
  }
};
$('importer').oncancel = event => {
  if ($('cancel-import').disabled) event.preventDefault();
};
$('refresh').onclick = () => run(async () => {
  closeCourseMenu();
  const id = course.id;
  notice('Atualizando aulas…');
  await window.player.channels();
  await importCourse(id);
  notice();
}, $('refresh'));
$('remove').onclick = () => {
  closeCourseMenu();
  $('confirm-remove').returnValue = '';
  $('confirm-remove').showModal();
};
$('confirm-remove').onclose = () => {
  if ($('confirm-remove').returnValue !== 'remove') return;
  run(async () => {
    await stop();
    library.courses = await window.player.removeCourse(course.id);
    selectCourse(library.courses[0]);
  }, $('remove'));
};
let updateState;
const updateMessages = { idle: 'Verificação ao abrir o aplicativo.', checking: 'Verificando…', current: 'Você está na versão mais recente.', available: 'Há uma nova versão disponível.', downloading: 'Baixando a atualização…', ready: 'Atualização pronta para instalar.', installing: 'Aplicando atualização…', error: 'Não foi possível verificar ou baixar agora. Tente novamente.' };
function updatePreferences(state) {
  if (!state) return;
  $('update-preferences-status').textContent = state.message || updateMessages[state.status] || '';
  const action = $('update-preferences-action');
  action.textContent = ['available', 'downloading', 'ready', 'installing'].includes(state.status) ? 'Ver atualização' : 'Verificar atualização';
  action.disabled = state.status === 'checking';
}
function showUpdate(state) {
  if (!state) return;
  updateState = state;
  updatePreferences(state);
  const messages = { available: `A versão ${state.version} está disponível.`, downloading: 'Baixando atualização…', ready: 'Atualização pronta para instalar. O aplicativo será reiniciado.', installing: 'Abrindo instalador…', error: state.message };
  if (!messages[state.status]) return;
  $('updates-status').textContent = messages[state.status];
  $('updates-progress').hidden = state.status !== 'downloading';
  $('updates-progress').value = state.percent || 0;
  $('updates-action').textContent = state.status === 'ready' ? 'Instalar e reiniciar' : state.status === 'error' ? 'Tentar novamente' : 'Baixar';
  $('updates-action').disabled = ['downloading', 'installing'].includes(state.status);
  if (!$('updates').open) $('updates').showModal();
}
window.player.onUpdate(showUpdate);
$('update-preferences-action').onclick = async () => {
  if (!updateState) { $('update-preferences-status').textContent = 'A verificação está disponível no aplicativo instalado.'; return; }
  if (['available', 'downloading', 'ready', 'installing'].includes(updateState.status)) {
    $('appearance').close();
    showUpdate(updateState);
  } else await window.player.updateCheck();
};
const preferenceTabs = [$('tab-appearance'), $('tab-updates')];
function selectPreferenceTab(selected) {
  for (const tab of preferenceTabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !active;
  }
}
for (const tab of preferenceTabs) {
  tab.onclick = () => selectPreferenceTab(tab);
  tab.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? preferenceTabs[0] : event.key === 'End' ? preferenceTabs[1] : preferenceTabs[1 - preferenceTabs.indexOf(tab)];
    selectPreferenceTab(next); next.focus();
  };
}
window.player.appVersion().then(version => {
  $('app-version').textContent = version.includes('-preview.') ? `${version.split('-')[0]} · prévia` : version;
  $('installed-version').textContent = `Player de Aulas ${version}`;
});
window.player.updateStatus().then(state => {
  if (state) { updateState = state; updatePreferences(state); }
  else $('update-preferences-status').textContent = 'A verificação está disponível no aplicativo instalado.';
});
$('updates-close').onclick = () => $('updates').close();
$('updates-action').onclick = () => {
  if (updateState.status === 'ready') window.player.updateInstall();
  else if (updateState.status === 'error') window.player.updateCheck();
  else window.player.updateDownload();
};
run(initialize);
