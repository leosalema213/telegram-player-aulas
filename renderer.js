const $ = id => document.getElementById(id);
const video = $('video');
let library;
let course;
let lesson;
let lastSaved = 0;
let restoring = false;

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
  $('empty').hidden = !library.connected || !!course;
  $('course').hidden = !course;
  $('add').hidden = !library.connected;
  $('disconnect').hidden = !library.connected || library.demo;
  $('connection').textContent = library.demo ? '● Modo demonstração' : '● Dados locais';
  $('courses').replaceChildren(...library.courses.map(item => {
    const entry = button(item.title, () => selectCourse(item), 'course-link');
    if (item === course) entry.setAttribute('aria-current', 'true');
    return entry;
  }));
  if (!course) return;
  $('course-title').textContent = course.title;
  renderStats();
  renderLessons();
  renderDocuments();
  $('now-title').textContent = lesson?.title || 'Sala de reprodução';
  $('now-chapter').textContent = lesson?.chapter || '';
  $('toggle-done').hidden = !lesson;
  $('toggle-done').textContent = lesson?.done ? 'Reabrir aula' : 'Concluir aula';
}

function renderStats() {
  const total = course.lessons.reduce((sum, item) => sum + item.duration, 0);
  const left = course.lessons.reduce((sum, item) => sum + (item.done ? 0 : Math.max(0, item.duration - item.position)), 0);
  const done = course.lessons.filter(item => item.done).length;
  const percent = total ? Math.floor((total - left) / total * 100) : 0;
  $('completed').textContent = `${done} / ${course.lessons.length}`;
  $('remaining').textContent = duration(left);
  $('percent').textContent = `${percent}%`;
  $('bar').value = percent;
  const available = course.lessons.filter(item => !item.done);
  const next = available.reduce((recent, item) => item.position > 0 && item.updated > (recent?.updated || 0) ? item : recent, null) || available[0];
  $('resume').hidden = !next;
  if (next) {
    $('resume').textContent = next.position > 0 ? `▷ Continuar em ${duration(next.position)}` : '▷ Assistir próxima aula';
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
    icon.textContent = '▷';
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
  return saved;
}

function selectCourse(item) {
  if (item === course) return;
  stop();
  course = item;
  $('search').value = '';
  render();
}

function selectLesson(item) {
  if (item === lesson && !video.error) {
    video.play().catch(() => {});
    return;
  }
  stop();
  notice();
  lesson = item;
  restoring = true;
  video.hidden = false;
  $('poster').hidden = true;
  video.src = `lesson://video/${course.id}/${item.id}`;
  video.play().catch(() => {});
  render();
}

video.addEventListener('loadedmetadata', () => {
  if (!lesson || !restoring) return;
  if (lesson.position > 0 && lesson.position < video.duration) video.currentTime = lesson.position;
  restoring = false;
});
video.addEventListener('timeupdate', () => {
  if (Date.now() - lastSaved >= 2000) saveProgress();
});
video.addEventListener('pause', () => saveProgress());
video.addEventListener('seeked', () => saveProgress());
video.addEventListener('ended', async () => {
  await saveProgress(true);
  render();
});
video.addEventListener('error', () => {
  if (lesson) notice('Não foi possível reproduzir a aula. Confira sua conexão e tente abrir o vídeo novamente.');
});
window.addEventListener('beforeunload', () => saveProgress());
$('search').oninput = renderLessons;
$('theater').onclick = () => {
  const expanded = $('theater').getAttribute('aria-pressed') !== 'true';
  $('theater').setAttribute('aria-pressed', String(expanded));
  $('theater').textContent = expanded ? 'Mostrar aulas' : 'Modo teatro';
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

async function initialize() {
  library = await window.player.library();
  course = library.courses[0];
  render();
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
  const id = course.id;
  notice('Atualizando aulas…');
  await window.player.channels();
  await importCourse(id);
  notice();
}, $('refresh'));
$('remove').onclick = () => {
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
