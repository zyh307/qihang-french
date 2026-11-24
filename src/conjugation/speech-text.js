export function speechTextKey(text) {
  return String(text || '').normalize('NFC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

export function conjugationSpeech(person, form) {
  if (!form || form === '—') return '';
  if (person === 'je' && /^[aeiouyàâäéèêëîïôöùûühœ]/i.test(form) && !/^ha(?:is\b|ï)/iu.test(form)) return `j’${form}`;
  return `${person} ${form}`;
}
