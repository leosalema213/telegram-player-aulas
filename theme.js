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
    shortcut.textContent = dark ? '☀' : '☾';
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
