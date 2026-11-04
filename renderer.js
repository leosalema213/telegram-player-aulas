const $ = id => document.getElementById(id);
const video = $('video');
let library;
let course;
let lesson;
let lastSaved = 0;
let restoring = false;
let view = 'course';
let playbackSpeed = 1;
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
  view = 'course';
  $('search').value = '';
  render();
  const resume = item && window.playbackUtils.findResume([item])?.item;
  if (resume) selectLesson(resume, false);
}
$('home').onclick = () => { stop(); view = 'dashboard'; render(); };
$('open-notes').onclick = () => window.notebook.open(course);
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
video.addEventListener('play', updatePlayer);
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
  $('speed-toggle').textContent = `${String(speed).replace('.', ',')}×`;
  $('speed-number').value = String(speed);
  $('speed-range').value = String(speed);
  $('speed-status').textContent = '';
  document.querySelectorAll('[data-speed]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === speed)));
}
async function setSpeed(value, save = true) {
  const speed = Number(value);
  if (!window.playbackUtils.validSpeed(speed)) {
    $('speed-status').textContent = 'Informe um valor entre 0,25 e 2, com até duas casas decimais.';
    return;
  }
  displaySpeed(speed);
  if (save) {
    try { await window.player.savePlaybackSpeed(speed); }
    catch { $('speed-status').textContent = 'Não foi possível salvar a velocidade. Tente novamente.'; }
  }
}
function showSpeedMenu(open) {
  $('speed-menu').hidden = !open;
  $('speed-toggle').setAttribute('aria-expanded', String(open));
}
$('speed-toggle').onclick = () => showSpeedMenu($('speed-menu').hidden);
$('speed-range').oninput = event => setSpeed(event.target.value, false);
$('speed-range').onchange = event => setSpeed(event.target.value);
$('speed-number').onchange = event => setSpeed(event.target.value);
$('speed-minus').onclick = () => setSpeed(Math.max(0.25, Math.round((playbackSpeed - 0.05) * 100) / 100));
$('speed-plus').onclick = () => setSpeed(Math.min(2, Math.round((playbackSpeed + 0.05) * 100) / 100));
document.querySelectorAll('[data-speed]').forEach(button => { button.onclick = () => setSpeed(button.dataset.speed); });
document.addEventListener('click', event => { if (!event.target.closest('.speed-control')) showSpeedMenu(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('speed-menu').hidden) { showSpeedMenu(false); $('speed-toggle').focus(); } });
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
