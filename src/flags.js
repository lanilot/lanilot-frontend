// Small inline SVG flags (3:2), so they render the same on every OS — emoji flags do not show on Windows.
const svg = body => `<svg viewBox="0 0 30 20" aria-hidden="true">${body}</svg>`;

const usStripes = Array.from({ length: 7 }, (_, i) => `<rect y="${i * 20 / 6.5}" width="30" height="${20 / 13}" fill="#b22234"/>`).join('');
const usStars = Array.from({ length: 12 }, (_, i) => `<circle cx="${1.6 + (i % 4) * 2.8}" cy="${1.6 + Math.floor(i / 4) * 2.9}" r=".55" fill="#fff"/>`).join('');

export const FLAGS = {
  en: svg(`<rect width="30" height="20" fill="#fff"/>${usStripes}<rect width="12" height="${20 * 7 / 13}" fill="#3c3b6e"/>${usStars}`),
  es: svg('<rect width="30" height="20" fill="#c60b1e"/><rect y="5" width="30" height="10" fill="#ffc400"/>'),
  fr: svg('<rect width="30" height="20" fill="#fff"/><rect width="10" height="20" fill="#0055a4"/><rect x="20" width="10" height="20" fill="#ef4135"/>'),
  it: svg('<rect width="30" height="20" fill="#fff"/><rect width="10" height="20" fill="#009246"/><rect x="20" width="10" height="20" fill="#ce2b37"/>'),
  ru: svg('<rect width="30" height="20" fill="#fff"/><rect y="6.67" width="30" height="6.67" fill="#0039a6"/><rect y="13.33" width="30" height="6.67" fill="#d52b1e"/>'),
  uz: svg('<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.4" fill="#0099b5"/><rect y="13.6" width="30" height="6.4" fill="#1eb53a"/><rect y="6.4" width="30" height=".6" fill="#ce1126"/><rect y="13" width="30" height=".6" fill="#ce1126"/><circle cx="4.6" cy="3.2" r="2.2" fill="#fff"/><circle cx="5.5" cy="3.2" r="2" fill="#0099b5"/>')
};
