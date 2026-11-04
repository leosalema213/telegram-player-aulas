(function notebook() {
  const $ = id => document.getElementById(id);
  const modal = $('notebook');
  const editor = $('note-content');
  let owner, notes = [], selected, timer, dirty = false, saving = Promise.resolve(), bookmark;
  const dateToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const note = () => notes.find(item => item.id === selected);
  const textOf = html => { const element = document.createElement('template'); element.innerHTML = html; return element.content.textContent || ''; };
  function safeHtml(html) {
    const template = document.createElement('template'); template.innerHTML = typeof html === 'string' ? html : '';
    const allowed = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'IMG', 'FONT', 'SPAN']);
    function copy(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
      if (!allowed.has(node.tagName)) {
        const fragment = document.createDocumentFragment();
        if (!['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) for (const child of node.childNodes) fragment.append(copy(child));
        return fragment;
      }
      const element = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src') || '';
        if (!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(src) || src.length > 7 * 1024 * 1024) return document.createDocumentFragment();
        element.src = src; element.alt = 'Imagem da anotação';
      } else {
        if (node.tagName === 'FONT' && /^#[a-f0-9]{6}$/i.test(node.getAttribute('color') || '')) element.setAttribute('color', node.getAttribute('color'));
        if (node.tagName === 'SPAN' && ['12', '14', '16', '18', '20', '24', '28', '32'].includes(node.getAttribute('data-size'))) element.dataset.size = node.getAttribute('data-size');
        for (const child of node.childNodes) element.append(copy(child));
      }
      return element;
    }
    const result = document.createElement('div');
    for (const child of template.content.childNodes) result.append(copy(child));
    return result.innerHTML;
  }
  function updateList() {
    const query = $('note-search').value.trim().toLocaleLowerCase();
    const ordered = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updated || 0) - (a.updated || 0));
    const date = $('note-date-filter').value;
    const shown = ordered.filter(item => (!date || item.date === date) && `${item.title} ${textOf(item.html)}`.toLocaleLowerCase().includes(query));
    $('note-list').replaceChildren(...shown.map(item => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'note-list-item';
      if (item.id === selected) button.setAttribute('aria-current', 'true');
      const title = document.createElement('strong');
      if (item.pinned) title.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" aria-label="Fixada"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
      title.append(document.createTextNode(item.title || 'Sem título'));
      const preview = document.createElement('span'); preview.textContent = textOf(item.html).trim().slice(0, 90) || (item.html.includes('<img') ? 'Anotação com imagem' : 'Sem texto');
      const time = document.createElement('small'); time.textContent = item.date.split('-').reverse().join('/');
      button.append(title, preview, time); button.onclick = () => { selected = item.id; render(); }; return button;
    }));
    $('note-count').textContent = `${shown.length === notes.length ? '' : `${shown.length} de `}${notes.length} ${notes.length === 1 ? 'anotação' : 'anotações'}`;
  }
  function render() {
    const current = note();
    $('note-empty').hidden = !!current; $('note-editor').hidden = !current;
    updateList();
    if (!current) return;
    $('note-title-input').value = current.title;
    $('note-date').value = current.date;
    $('note-pin').setAttribute('aria-pressed', String(current.pinned));
    $('note-pin').textContent = current.pinned ? 'Desafixar' : 'Fixar';
    $('note-lesson').replaceChildren(new Option('Sem aula vinculada', ''), ...owner.lessons.map(item => new Option(item.title, String(item.id))));
    if (current.lessonId && !owner.lessons.some(item => String(item.id) === current.lessonId)) $('note-lesson').add(new Option('Aula não disponível', current.lessonId));
    $('note-lesson').value = current.lessonId || '';
    editor.innerHTML = safeHtml(current.html);
  }
  function save() {
    clearTimeout(timer);
    if (!dirty || !owner) return saving;
    dirty = false;
    const snapshot = structuredClone(notes), courseId = owner.id;
    $('note-status').textContent = 'Salvando…';
    saving = saving.catch(() => {}).then(() => window.player.saveNotes(courseId, snapshot)).then(() => {
      if (!dirty) $('note-status').textContent = 'Salvo automaticamente';
    }).catch(error => { dirty = true; $('note-status').textContent = 'Falha ao salvar. Tente novamente.'; throw error; });
    return saving;
  }
  function changed() {
    if (!note()) return;
    note().updated = Date.now(); dirty = true; $('note-status').textContent = 'Alterações pendentes…';
    updateList(); clearTimeout(timer); timer = setTimeout(() => save().catch(() => {}), 500);
  }
  async function close() {
    try { await save(); modal.close(); owner = undefined; }
    catch { $('note-status').textContent = 'Falha ao salvar. Tente fechar novamente.'; }
  }
  function add() {
    const item = { id: crypto.randomUUID(), title: '', html: '', date: dateToday(), lessonId: '', pinned: false, updated: Date.now() };
    notes.unshift(item); selected = item.id; dirty = true; render(); changed(); $('note-title-input').focus();
  }
  window.notebook = { async open(course) {
    try {
      const loaded = await window.player.loadNotes(course.id);
      owner = course; notes = loaded.map(item => ({ ...item, html: safeHtml(item.html), lessonId: String(item.lessonId || ''), pinned: !!item.pinned }));
      selected = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updated || 0) - (a.updated || 0))[0]?.id;
      dirty = false; $('note-search').value = ''; $('note-date-filter').value = ''; $('note-status').textContent = 'Salvamento automático';
      $('notebook-title').textContent = `Anotações · ${course.title}`; render(); modal.showModal();
    } catch { window.dispatchEvent(new CustomEvent('notebook-error', { detail: 'Não foi possível abrir as anotações. Tente novamente.' })); }
  } };
  $('note-new').onclick = $('note-first').onclick = add;
  $('notebook-close').onclick = close;
  modal.oncancel = event => { event.preventDefault(); close(); };
  $('note-search').oninput = updateList;
  $('note-date-filter').onchange = updateList;
  $('note-toggle-list').onclick = () => {
    const collapsed = !$('notebook-list').hidden;
    $('notebook-list').hidden = collapsed;
    $('note-toggle-list').setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Mostrar lista de anotações' : 'Recolher lista de anotações';
    $('note-toggle-list').setAttribute('aria-label', label); $('note-toggle-list').title = label;
  };
  $('note-title-input').oninput = event => { note().title = event.target.value; changed(); };
  $('note-date').onchange = event => { if (event.target.value) { note().date = event.target.value; changed(); } };
  $('note-lesson').onchange = event => { note().lessonId = event.target.value; changed(); };
  $('note-pin').onclick = () => { note().pinned = !note().pinned; changed(); render(); };
  $('note-delete').onclick = () => $('note-delete-dialog').showModal();
  $('note-delete-cancel').onclick = () => $('note-delete-dialog').close();
  $('note-delete-confirm').onclick = () => { notes = notes.filter(item => item.id !== selected); selected = notes[0]?.id; dirty = true; $('note-delete-dialog').close(); render(); clearTimeout(timer); timer = setTimeout(() => save().catch(() => {}), 500); };
  editor.oninput = () => { if (note()) { note().html = safeHtml(editor.innerHTML); changed(); } };
  editor.onblur = () => { if (dirty) save().catch(() => {}); };
  window.addEventListener('beforeunload', () => { if (dirty) save().catch(() => {}); });
  editor.onpaste = event => {
    event.preventDefault();
    const image = [...event.clipboardData.items].find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
    if (image) { capture(); readImage(image); }
    else document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  };
  document.querySelectorAll('[data-format]').forEach(control => {
    control.onmousedown = event => event.preventDefault();
    control.onclick = () => { editor.focus(); document.execCommand(control.dataset.format); editor.dispatchEvent(new Event('input')); };
  });
  function capture() { const selection = window.getSelection(); bookmark = selection?.rangeCount && editor.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null; }
  function restoreSelection() {
    editor.focus();
    if (bookmark) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(bookmark); }
    bookmark = null;
  }
  for (const id of ['note-heading', 'note-color']) {
    $(id).onmousedown = capture;
    $(id).onchange = event => {
      const value = event.target.value; restoreSelection();
      document.execCommand(id === 'note-heading' ? 'formatBlock' : 'foreColor', false, value);
      editor.dispatchEvent(new Event('input'));
    };
  }
  $('note-size').onmousedown = capture;
  $('note-size').onchange = event => {
    const size = event.target.value;
    if (!['12', '14', '16', '18', '20', '24', '28', '32'].includes(size)) return;
    restoreSelection(); document.execCommand('fontSize', false, '7');
    editor.querySelectorAll('font[size="7"]').forEach(font => {
      const span = document.createElement('span'); span.dataset.size = size;
      while (font.firstChild) span.append(font.firstChild);
      font.replaceWith(span);
    });
    editor.dispatchEvent(new Event('input'));
  };
  function insertImage(src) {
    restoreSelection();
    document.execCommand('insertImage', false, src); editor.dispatchEvent(new Event('input'));
  }
  for (const id of ['note-image', 'note-sketch']) $(id).onmousedown = capture;
  $('note-image').onclick = () => $('note-image-file').click();
  function readImage(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { $('note-status').textContent = 'Use imagem PNG, JPG ou WebP de até 5 MB.'; return; }
    const target = selected, courseId = owner?.id;
    const reader = new FileReader();
    reader.onload = () => {
      if (modal.open && owner?.id === courseId && selected === target) insertImage(reader.result);
      else if (modal.open) $('note-status').textContent = 'A nota mudou; selecione a imagem novamente.';
    };
    reader.onerror = () => { if (modal.open) $('note-status').textContent = 'Não foi possível ler a imagem.'; };
    reader.readAsDataURL(file);
  }
  $('note-image-file').onchange = event => { const file = event.target.files[0]; event.target.value = ''; readImage(file); };
  const canvas = $('sketch-canvas'), ctx = canvas.getContext('2d'); let drawing = false;
  function point(event) { const rect = canvas.getBoundingClientRect(); return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height]; }
  canvas.onpointerdown = event => { drawing = true; canvas.setPointerCapture(event.pointerId); const [x, y] = point(event); ctx.beginPath(); ctx.moveTo(x, y); };
  canvas.onpointermove = event => { if (!drawing) return; const [x, y] = point(event); ctx.lineWidth = Number($('sketch-width').value); ctx.lineCap = 'round'; ctx.strokeStyle = $('sketch-color').value; ctx.lineTo(x, y); ctx.stroke(); };
  canvas.onpointerup = canvas.onpointercancel = () => { drawing = false; };
  function clearSketch() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  $('note-sketch').onclick = () => { clearSketch(); $('sketch-dialog').showModal(); };
  $('sketch-clear').onclick = clearSketch;
  $('sketch-cancel').onclick = () => $('sketch-dialog').close();
  $('sketch-save').onclick = () => { const src = canvas.toDataURL('image/png'); $('sketch-dialog').close(); insertImage(src); };
})();
