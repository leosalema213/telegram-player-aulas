function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-preview\.([1-9]\d*))?$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number), preview = match[4] ? Number(match[4]) : null;
  if (!parts.every(Number.isSafeInteger) || (preview !== null && !Number.isSafeInteger(preview))) return null;
  return { parts, base: parts.join('.'), preview };
}
function isProductionVersion(value) {
  const parsed = parseVersion(value);
  return !!parsed && value === parsed.base && parsed.parts[2] <= 9;
}
function nextStable(value) {
  const parsed = parseVersion(value);
  if (!parsed) throw new Error('Versão inválida.');
  if (parsed.preview !== null) return parsed.base;
  const [major, minor, patch] = parsed.parts;
  return patch >= 9 ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}
function nextPreview(value) {
  const parsed = parseVersion(value);
  if (!parsed) throw new Error('Versão inválida.');
  return parsed.preview !== null ? `${parsed.base}-preview.${parsed.preview + 1}` : `${nextStable(value)}-preview.1`;
}
module.exports = { parseVersion, isProductionVersion, nextStable, nextPreview };
