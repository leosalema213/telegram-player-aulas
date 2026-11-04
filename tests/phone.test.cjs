const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone } = require('../phone.cjs');
test('normaliza números locais e internacionais do país selecionado', () => {
  for (const input of ['(11) 99999-9999', '+55 11 99999-9999', '55 11 99999-9999']) assert.equal(normalizePhone(input, 'BR'), '+5511999999999');
  assert.equal(normalizePhone('912 345 678', 'PT'), '+351912345678');
  assert.equal(normalizePhone('351912345678', 'PT'), '+351912345678');
});
test('rejeita número inválido ou de outro país', () => {
  for (const input of ['+351912345678', '123', 'abc', '++5511999999999']) assert.throws(() => normalizePhone(input, 'BR'));
});
