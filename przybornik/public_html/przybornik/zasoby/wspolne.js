// Przybornik · wspólne klocki interfejsu i pomocnicy. Bez zależności, bez builda.

const meta = (nazwa) => document.querySelector(`meta[name="${nazwa}"]`)?.content || '';
const ZETON = meta('przybornik-zeton');
export const LIB = new URL('../lib/', import.meta.url).href;

/* --- DOM ------------------------------------------------------------------ */

/** el('button', {class: 'przycisk', onclick: f}, 'Tekst') */
export function el(znacznik, wlasciwosci = {}, ...dzieci) {
  const e = document.createElement(znacznik);
  for (const [k, v] of Object.entries(wlasciwosci || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k.startsWith('aria-') || k === 'role' || k === 'for' || k === 'list') e.setAttribute(k, v === true ? 'true' : String(v));
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const d of dzieci.flat(Infinity)) {
    if (d === null || d === undefined || d === false) continue;
    e.append(d instanceof Node ? d : document.createTextNode(String(d)));
  }
  return e;
}

/** Pole formularza z etykietą nad kontrolką. */
export function pole(etykieta, kontrolka, { szerokie = false, podpis = null } = {}) {
  const znacznik = kontrolka.matches?.('input, select, textarea') ? 'label' : 'div';
  return el(znacznik, { class: 'pole' + (szerokie ? ' szerokie' : '') },
    el('span', { class: 'etykieta', text: etykieta }), kontrolka,
    podpis ? el('span', { class: 'wartosc', text: podpis }) : null);
}

export function lista(opcje, wybrana) {
  const s = el('select');
  for (const [wartosc, etykieta] of opcje) s.append(el('option', { value: String(wartosc), text: etykieta, selected: String(wartosc) === String(wybrana) }));
  return s;
}

/** Rząd przycisków jednokrotnego wyboru. Zwraca element z polem .wartosc i zdarzeniem 'zmiana'. */
export function zetony(opcje, wybrana, { kolory = false } = {}) {
  const rzad = el('div', { class: 'zetony', role: 'group' });
  rzad.wartosc = wybrana;
  const odswiez = () => {
    for (const b of rzad.children) b.setAttribute('aria-pressed', String(b.dataset.wartosc === String(rzad.wartosc)));
  };
  for (const [wartosc, etykieta] of opcje) {
    const b = el('button', { type: 'button', class: 'zeton' + (kolory ? ' kolor' : ''), dataset: { wartosc: String(wartosc) }, title: etykieta });
    if (kolory) { b.style.background = wartosc; b.setAttribute('aria-label', etykieta); } else { b.textContent = etykieta; }
    b.addEventListener('click', () => { rzad.ustaw(wartosc); rzad.dispatchEvent(new Event('zmiana')); });
    rzad.append(b);
  }
  rzad.ustaw = (w) => { rzad.wartosc = w; odswiez(); };
  odswiez();
  return rzad;
}

export function wybor(etykieta, zaznaczony = false, dopisek = '') {
  const input = el('input', { type: 'checkbox', checked: zaznaczony });
  const l = el('label', { class: 'wybor' }, input, el('span', {}, etykieta, dopisek ? [' ', el('span', { class: 'bs-mono', text: dopisek })] : null));
  l.pole = input;
  return l;
}

export function suwak(min, max, krok, wartosc, opis = (v) => v) {
  const input = el('input', { type: 'range', min, max, step: krok, value: wartosc });
  const etykieta = el('span', { class: 'wartosc', text: opis(Number(wartosc)) });
  input.addEventListener('input', () => { etykieta.textContent = opis(Number(input.value)); });
  const d = el('div', {}, input, etykieta);
  d.pole = input;
  Object.defineProperty(d, 'wartosc', { get: () => Number(input.value) });
  return d;
}

/* --- Strefa upuszczania plików ---------------------------------------------- */

export function strefa({ tytul, opis = '', accept = '', wiele = false, naPliki }) {
  const input = el('input', { type: 'file', accept, multiple: wiele });
  const s = el('label', { class: 'strefa' },
    input,
    el('span', { class: 'strefa-tytul', text: tytul }),
    opis ? el('span', { class: 'strefa-opis', text: opis }) : null);
  const oddaj = (pliki) => {
    const tablica = [...pliki].filter((p) => p && p.size > 0);
    if (tablica.length) naPliki(wiele ? tablica : [tablica[0]]);
  };
  input.addEventListener('change', () => { oddaj(input.files); input.value = ''; });
  s.addEventListener('dragover', (z) => { z.preventDefault(); s.classList.add('nad'); });
  s.addEventListener('dragleave', () => s.classList.remove('nad'));
  s.addEventListener('drop', (z) => { z.preventDefault(); s.classList.remove('nad'); oddaj(z.dataTransfer.files); });
  return s;
}

/* --- Postęp ------------------------------------------------------------------- */

export function postep() {
  const tekst = el('p', { class: 'postep-tekst' });
  const pasek = el('div', { class: 'postep-pasek' });
  const korzen = el('div', { class: 'postep', hidden: true, role: 'status' }, tekst, el('div', { class: 'postep-tor' }, pasek));
  return {
    el: korzen,
    ustaw(opis, ulamek = null) {
      korzen.hidden = false;
      tekst.textContent = opis;
      tekst.classList.remove('komunikat');
      pasek.style.width = ulamek === null ? '100%' : `${Math.max(0, Math.min(1, ulamek)) * 100}%`;
      pasek.style.opacity = ulamek === null ? '0.35' : '1';
    },
    blad(opis) {
      korzen.hidden = false;
      tekst.textContent = opis;
      tekst.classList.add('komunikat');
      pasek.style.width = '0';
    },
    ukryj() { korzen.hidden = true; },
  };
}

/* --- Wyniki --------------------------------------------------------------------- */

export function rozmiar(bajty) {
  if (bajty < 1024) return `${bajty} B`;
  if (bajty < 1024 * 1024) return `${(bajty / 1024).toLocaleString('pl-PL', { maximumFractionDigits: bajty < 10240 ? 1 : 0 })} KB`;
  return `${(bajty / 1048576).toLocaleString('pl-PL', { maximumFractionDigits: bajty < 104857600 ? 1 : 0 })} MB`;
}

/** Opis „przed → po (−63%)” z kolorem zależnym od kierunku. */
export function przedPo(przed, po) {
  const zmiana = przed > 0 ? Math.round((po / przed - 1) * 100) : 0;
  const znak = zmiana > 0 ? '+' : zmiana < 0 ? '−' : '';
  return [`${rozmiar(przed)} → ${rozmiar(po)} `, el('span', { class: zmiana <= 0 ? 'mniej' : 'wiecej', text: `(${znak}${Math.abs(zmiana)}%)` })];
}

/** Polska odmiana po liczebniku: odmiana(2, 'strona', 'strony', 'stron') → '2 strony'. */
export function odmiana(n, jeden, kilka, wiele) {
  const d = n % 10, s = n % 100;
  const forma = n === 1 ? jeden : (d >= 2 && d <= 4 && !(s >= 12 && s <= 14)) ? kilka : wiele;
  return `${n} ${forma}`;
}

export function bezRozszerzenia(nazwa) { return nazwa.replace(/\.[A-Za-z0-9]{1,5}$/, ''); }
export function rozszerzenie(nazwa) { const m = /\.([A-Za-z0-9]{1,5})$/.exec(nazwa); return m ? m[1].toLowerCase() : ''; }

export function pobierz(blob, nazwa) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nazwa });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Lista wyników z przyciskami pobierania i opcjonalnym „Pobierz wszystko (ZIP)”. */
export function listaWynikow({ nazwaZip = 'przybornik.zip' } = {}) {
  const ul = el('ul', { class: 'wyniki', hidden: true });
  const przyciskZip = el('button', { type: 'button', class: 'przycisk przycisk-cichy', hidden: true, text: 'Pobierz wszystko (ZIP)' });
  const przyciskCzysc = el('button', { type: 'button', class: 'link', hidden: true, text: 'Wyczyść listę' });
  const akcje = el('div', { class: 'akcje' }, przyciskZip, przyciskCzysc);
  const korzen = el('div', {}, ul, akcje);
  const pliki = [];
  const adresy = [];
  const odswiez = () => {
    ul.hidden = ul.children.length === 0;
    przyciskZip.hidden = pliki.length < 2;
    przyciskCzysc.hidden = ul.children.length === 0;
  };
  przyciskZip.addEventListener('click', async () => {
    przyciskZip.disabled = true;
    try { pobierz(await zip(pliki), nazwaZip); } finally { przyciskZip.disabled = false; }
  });
  const api = {
    el: korzen,
    pliki,
    dodaj({ nazwa, opis = '', blob = null, miniatura = null, blad = false, szczegoly = null }) {
      const li = el('li', { class: 'wynik' + (miniatura ? ' z-miniatura' : '') + (blad ? ' blad' : '') });
      if (miniatura) {
        const adres = typeof miniatura === 'string' ? miniatura : URL.createObjectURL(miniatura);
        if (typeof miniatura !== 'string') adresy.push(adres);
        li.append(el('img', { class: 'miniatura', src: adres, alt: '', loading: 'lazy' }));
      }
      const srodek = el('div', {}, el('div', { class: 'wynik-nazwa', text: nazwa }), el('div', { class: 'wynik-opis' }, opis));
      if (szczegoly && szczegoly.length) srodek.append(el('ul', { class: 'wynik-lista' }, szczegoly.map((s) => el('li', { text: s }))));
      li.append(srodek);
      if (blob) {
        pliki.push({ nazwa, blob });
        li.append(el('button', { type: 'button', class: 'przycisk przycisk-maly', text: 'Pobierz', onclick: () => pobierz(blob, nazwa) }));
      }
      ul.append(li);
      odswiez();
      return li;
    },
    wyczysc() {
      ul.replaceChildren();
      pliki.length = 0;
      adresy.splice(0).forEach((a) => URL.revokeObjectURL(a));
      odswiez();
    },
  };
  przyciskCzysc.addEventListener('click', () => api.wyczysc());
  return api;
}

/* --- ZIP (fflate) -------------------------------------------------------------- */

let fflate = null;
export async function wezFflate() {
  fflate ??= await import(`${LIB}fflate/browser.js`);
  return fflate;
}

/** pliki: [{nazwa, blob}] → Blob ZIP. Nazwy powtórzone dostają numer. */
export async function zip(pliki) {
  const { zipSync } = await wezFflate();
  const wpisy = {};
  for (const { nazwa, blob } of pliki) {
    let n = nazwa;
    for (let i = 2; n in wpisy; i++) n = `${bezRozszerzenia(nazwa)}-${i}.${rozszerzenie(nazwa)}`;
    // obrazy, PDF i wideo są już skompresowane: pakujemy bez ponownej kompresji
    wpisy[n] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(wpisy)], { type: 'application/zip' });
}

/* --- Serwer ---------------------------------------------------------------------- */

/** POST api.php?akcja=…; pola to wartości proste, obiekty (JSON) albo pliki. Zwraca {blob, info}. */
export async function api(akcja, pola) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(pola)) {
    if (v instanceof Blob) fd.append(k, v, v.name || 'plik');
    else if (v !== null && typeof v === 'object') fd.append(k, JSON.stringify(v));
    else fd.append(k, String(v));
  }
  let odp;
  try {
    odp = await fetch(`api.php?akcja=${encodeURIComponent(akcja)}`, { method: 'POST', body: fd, headers: { 'X-Przybornik': ZETON }, credentials: 'same-origin' });
  } catch {
    throw new Error('Brak połączenia z serwerem.');
  }
  if (!odp.ok) {
    let komunikat = `Serwer odpowiedział błędem ${odp.status}.`;
    try { const j = await odp.json(); if (j.blad) komunikat = j.blad; } catch { /* odpowiedź nie była JSON-em */ }
    throw new Error(komunikat);
  }
  const blob = await odp.blob();
  let info = {};
  const naglowek = odp.headers.get('X-Przybornik-Info');
  if (naglowek) {
    try { info = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(naglowek), (c) => c.charCodeAt(0)))); } catch { /* bez informacji */ }
  }
  return { blob, info };
}

/* --- Obrazy ------------------------------------------------------------------------ */

/**
 * Dekoduje plik obrazu do ImageBitmap z uwzględnieniem obrotu EXIF. Gdy przeglądarka
 * nie zna formatu (HEIC w Chrome), prosi serwer o JPEG. $bok ogranicza dłuższy bok
 * tylko przy drodze przez serwer.
 */
export async function naBitmape(plik, { bok = 8000 } = {}) {
  try {
    return await createImageBitmap(plik, { imageOrientation: 'from-image' });
  } catch {
    const { blob } = await api('podglad', { plik, bok, jakosc: 92 });
    return await createImageBitmap(blob);
  }
}

/** Jak naBitmape, ale zwraca plik JPEG/PNG, który przeglądarka i pdf-lib na pewno przeczytają. */
export async function naZwyklyObraz(plik) {
  const typ = plik.type || '';
  if (typ === 'image/jpeg' || typ === 'image/png') return plik;
  try {
    const bitmapa = await createImageBitmap(plik, { imageOrientation: 'from-image' });
    const plotno = plotnoZ(bitmapa);
    bitmapa.close?.();
    return await naBlob(plotno, 'image/jpeg', 0.92);
  } catch {
    const { blob } = await api('podglad', { plik, bok: 8000, jakosc: 92 });
    return blob;
  }
}

export function nowePlotno(szer, wys) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(szer));
  c.height = Math.max(1, Math.round(wys));
  return c;
}

export function plotnoZ(zrodlo, szer = zrodlo.width, wys = zrodlo.height) {
  const c = nowePlotno(szer, wys);
  const k = c.getContext('2d');
  k.imageSmoothingQuality = 'high';
  k.drawImage(zrodlo, 0, 0, c.width, c.height);
  return c;
}

export function naBlob(plotno, typ = 'image/png', jakosc = 0.92) {
  return new Promise((ok, zle) => plotno.toBlob((b) => (b ? ok(b) : zle(new Error('Przeglądarka nie zapisała obrazu.'))), typ, jakosc));
}

/** Wczytuje klasyczny skrypt (biblioteki bez modułów ES), jeden raz. */
const skrypty = new Map();
export function wczytajSkrypt(adres) {
  if (!skrypty.has(adres)) {
    skrypty.set(adres, new Promise((ok, zle) => {
      const s = el('script', { src: adres });
      s.addEventListener('load', ok);
      s.addEventListener('error', () => zle(new Error(`Nie wczytałem ${adres}`)));
      document.head.append(s);
    }));
  }
  return skrypty.get(adres);
}

/** Kolory marki do wyboru tła i podobnych. */
export const KOLORY = [
  ['#F6F1EA', 'Papier'],
  ['#FCFAF5', 'Jasny papier'],
  ['#701828', 'Oxblood'],
  ['#4E0F1B', 'Ciemny oxblood'],
  ['#141013', 'Ciemny'],
  ['#161310', 'Atrament'],
];

/** Zamienia wyjątek na zdanie dla człowieka. */
export function opisBledu(e) {
  const t = (e && e.message) ? e.message : String(e);
  return t.length > 300 ? t.slice(0, 300) + '…' : t;
}
