const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validSpeed, findResume, dashboardMetrics } = require('../playback.js');

test('aceita velocidades personalizadas de 0,25 a 2 com até duas casas', () => {
  for (const speed of [0.25, 1, 1.2, 1.43, 2]) assert.equal(validSpeed(speed), true);
  for (const speed of [0, 0.24, 2.01, 1.234, NaN, Infinity, '1.2']) assert.equal(validSpeed(speed), false);
});
test('calcula métricas sem contar curso vazio como finalizado', () => {
  const courses = [{ lessons: [{ duration: 60, position: 20, done: false }, { duration: 30, position: 0, done: true }] }, { lessons: [{ duration: 30, position: 5, done: true }] }, { lessons: [] }];
  assert.deepEqual(dashboardMetrics(courses), { lessons: 3, completed: 2, finished: 1, total: 120, remaining: 40, percent: 66 });
  assert.equal(dashboardMetrics([]).percent, 0);
});
test('retoma a aula pendente mais recente entre cursos', () => {
  const a = { lessons: [{ id: 1, duration: 100, position: 30, updated: 10, done: false }] };
  const b = { lessons: [{ id: 2, duration: 100, position: 40, updated: 20, done: false }, { id: 3, duration: 100, position: 99, updated: 30, done: true }] };
  assert.deepEqual(findResume([a, b]), { course: b, item: b.lessons[0] });
  b.lessons[0].done = true;
  assert.deepEqual(findResume([a, b]), { course: a, item: a.lessons[0] });
  a.lessons[0].position = 0;
  assert.deepEqual(findResume([a, b]), { course: a, item: a.lessons[0] });
  a.lessons[0].done = true;
  assert.equal(findResume([a, b]), undefined);
  assert.equal(findResume([]), undefined);
});
test('ao trocar de curso escolhe a retomada do próprio curso ou a primeira aula', () => {
  const course = { lessons: [{ id: 1, duration: 30, position: 0, updated: 0, done: false }, { id: 2, duration: 30, position: 8, updated: 10, done: false }] };
  assert.equal(findResume([course]).item.id, 2);
  course.lessons[1].done = true;
  assert.equal(findResume([course]).item.id, 1);
  course.lessons[0].done = true;
  assert.equal(findResume([course]), undefined);
});
