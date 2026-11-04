const countries = {
  BR: { code: '55', local: /^[1-9][0-9]9?[0-9]{8}$/ },
  PT: { code: '351', local: /^[29][0-9]{8}$/ },
  US: { code: '1', local: /^[2-9][0-9]{2}[2-9][0-9]{6}$/ },
  GB: { code: '44', local: /^[1-9][0-9]{9}$/ },
};

function normalizePhone(value, country) {
  const selected = countries[country];
  if (!selected || typeof value !== 'string' || !/^\+?[\d\s()-]+$/.test(value)) throw new Error('Confira o país e o formato do telefone.');
  const digits = value.replace(/\D/g, '');
  const full = digits.startsWith(selected.code) ? digits.slice(selected.code.length) : '';
  const localValid = selected.local.test(digits);
  const fullValid = !!full && selected.local.test(full);
  if (value.trim().startsWith('+')) {
    if (!fullValid) throw new Error('O telefone não corresponde ao país selecionado ou está inválido.');
    return '+' + digits;
  }
  if (localValid === fullValid) throw new Error('Telefone inválido ou ambíguo. Confira o país e informe o número com + e código internacional.');
  return '+' + (fullValid ? digits : selected.code + digits);
}
module.exports = { normalizePhone };
