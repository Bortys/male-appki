// Przybornik · nawigacja między narzędziami. Każde narzędzie to osobny moduł,
// wczytywany dopiero przy pierwszym otwarciu.
import { el, opisBledu } from './wspolne.js';

const MODULY = {
  sciskacz: './narzedzia/sciskacz.js',
  kadrownik: './narzedzia/kadrownik.js',
  zrzut: './narzedzia/zrzut.js',
  odchudzacz: './narzedzia/odchudzacz.js',
  stol: './narzedzia/stol.js',
  karuzela: './narzedzia/karuzela.js',
  ocr: './narzedzia/ocr.js',
  wideo: './narzedzia/wideo.js',
  czysciciel: './narzedzia/czysciciel.js',
  qr: './narzedzia/qr.js',
};

const uruchomione = new Map();
let biezace = null;

async function pokaz(id) {
  const statyczna = document.querySelector(`#n-${CSS.escape(id)}[data-statyczne]`);   // odnośniki do osobnych aplikacji
  if (!MODULY[id] && !statyczna) id = 'sciskacz';
  if (biezace && biezace !== id) uruchomione.get(biezace)?.modul?.ukryte?.();
  biezace = id;
  for (const s of document.querySelectorAll('.narzedzie')) s.hidden = s.dataset.id !== id;
  for (const a of document.querySelectorAll('.spis a')) {
    if (a.dataset.narzedzie === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  document.querySelector('.spis a[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });   // na telefonie spis jest paskiem
  const sekcja = document.getElementById(`n-${id}`);
  document.title = `${sekcja.querySelector('.tytul').textContent} · Przybornik`;
  if (statyczna) return;
  if (uruchomione.has(id)) { uruchomione.get(id).modul?.widoczne?.(); return; }
  const tresc = sekcja.querySelector('.tresc');
  uruchomione.set(id, {});
  try {
    const modul = await import(MODULY[id]);
    tresc.replaceChildren();
    await modul.start(tresc);
    uruchomione.set(id, { modul });
  } catch (e) {
    console.error(e);
    uruchomione.delete(id);
    tresc.replaceChildren(el('p', { class: 'komunikat', text: `Nie udało się wczytać narzędzia: ${opisBledu(e)}` }));
  }
}

const zHasha = () => location.hash.replace(/^#/, '');
window.addEventListener('hashchange', () => pokaz(zHasha()));
pokaz(zHasha());
