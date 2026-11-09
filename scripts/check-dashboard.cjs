// Focused UI check using an isolated demo profile, never a real Telegram account.
const { _electron: electron } = require('../../estudo-desktop/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const profile = await fs.mkdtemp(path.join(root, 'release', 'perfil-dashboard-'));
  const make = (id, title, position, done, importedAt) => ({ id, title, importedAt, documents: [], lessons: [{ id: 22, title: 'Aula de exemplo', chapter: 'Aulas', duration: 30, position, done, updated: 0 }] });
  const courses = { '-1001': make('-1001', 'Curso concluído', 30, true, 30), '-1002': make('-1002', 'Curso novo', 0, false, 20), '-1003': make('-1003', 'Curso em andamento', 5, false, 10) };
  await fs.writeFile(path.join(profile, 'biblioteca-demo.json'), JSON.stringify({ version: 1, courses }));
  const executablePath = process.env.PLAYER_TEST_EXE || path.join(root, 'node_modules/electron/dist/electron.exe');
  const env = { ...process.env, PLAYER_DEMO_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: process.env.PLAYER_TEST_EXE ? ['--demo'] : [root, '--demo'], env });
  try {
    const page = await app.firstWindow();
    await page.locator('#home').click();
    assert.deepEqual(await page.locator('#courses button').allTextContents(), ['Curso em andamento', 'Curso novo']);
    assert.deepEqual(await page.locator('#dashboard-courses strong').allTextContents(), ['Curso em andamento', 'Curso novo', 'Curso concluído']);
    assert.equal(await page.locator('#dashboard-started-courses button').count(), 1);
    assert.equal(await page.locator('#dashboard-completed-courses button').count(), 1);
    const colors = await page.evaluate(() => ['started', 'completed'].map(state => getComputedStyle(document.querySelector(`.course-${state} progress`)).accentColor));
    assert.notEqual(colors[0], colors[1]);
    await page.screenshot({ path: path.join(root, 'release', 'dashboard-preview.png') });
    await page.locator('#dashboard-completed-courses button').click();
    await page.locator('.lesson-check').uncheck();
    await page.waitForFunction(() => document.querySelectorAll('#courses button').length === 3);
    await page.locator('.lesson-check').check();
    await page.waitForFunction(() => document.querySelectorAll('#courses button').length === 2);
    assert.equal(await page.locator('#course').getAttribute('data-status'), 'completed');
    await page.locator('#home').click();
    await page.reload();
    await page.locator('#home').click();
    assert.equal(await page.locator('#dashboard-completed-courses button').count(), 1);
    const saved = JSON.parse(await fs.readFile(path.join(profile, 'biblioteca-demo.json'), 'utf8'));
    assert.equal(saved.courses['-1001'].lessons[0].done, true);
    assert.equal(saved.courses['-1002'].lessons[0].position, 0);
    console.log('Sidebar, ordem, cores, conclusão, reabertura e persistência conferidas em perfil isolado.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
