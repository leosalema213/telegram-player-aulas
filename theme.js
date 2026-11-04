(async () => {
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const shortcut = document.getElementById('toggle-theme');
  const dialog = document.getElementById('appearance');
  const modes = [...dialog.querySelectorAll('[data-mode]')];
  const palettes = [...dialog.querySelectorAll('[data-color]')];
  const status = document.getElementById('appearance-status');
  const saved = await window.player.appearance().catch(() => {
    status.textContent = 'Não foi possível ler a aparência salva.';
    return {};
  });
  let mode = modes.some(item => item.dataset.mode === saved.mode) ? saved.mode : 'system';
  let palette = palettes.some(item => item.dataset.color === saved.palette) ? saved.palette : 'pink';

  function apply() {
    const dark = mode === 'dark' || mode === 'custom' || (mode === 'system' && system.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    if (mode === 'custom') root.dataset.palette = palette;
    else delete root.dataset.palette;
    shortcut.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>';
    shortcut.title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
    shortcut.setAttribute('aria-label', shortcut.title);
    for (const item of modes) item.setAttribute('aria-pressed', item.dataset.mode === mode);
    for (const item of palettes) item.setAttribute('aria-pressed', item.dataset.color === palette);
    document.getElementById('palette-options').hidden = mode !== 'custom';
  }

  function select(next) {
    mode = next;
    apply();
    persist();
  }

  function persist() {
    status.textContent = '';
    window.player.saveAppearance({ mode, palette }).catch(() => {
      status.textContent = 'Não foi possível salvar a aparência.';
    });
  }

  for (const item of modes) item.onclick = () => select(item.dataset.mode);
  for (const item of palettes) {
    item.onclick = () => {
      palette = item.dataset.color;
      apply();
      persist();
    };
  }
  shortcut.onclick = () => select(root.dataset.theme === 'dark' ? 'light' : 'dark');
  document.getElementById('preferences').onclick = () => dialog.showModal();
  system.addEventListener('change', apply);
  apply();
})();
