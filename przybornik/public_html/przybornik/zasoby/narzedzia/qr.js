// § 10 QR z logo · kod QR w kolorach marki, PNG i SVG. Biblioteka: qrcode-generator (MIT).
import { el, pole, lista, zetony, suwak, postep, pobierz, naBlob, wczytajSkrypt, LIB } from '../wspolne.js';

const KOLORY_KODU = [['#161310', 'Atrament'], ['#701828', 'Oxblood'], ['#4E0F1B', 'Ciemny oxblood']];
const KOLORY_TLA = [['#FFFFFF', 'Biały'], ['#FCFAF5', 'Jasny papier'], ['#F6F1EA', 'Papier'], ['przezroczyste', 'Przezroczyste']];

/** Macierz modułów: tablica wierszy z wartościami true/false. */
export function macierz(qrcode, tekst, korekcja) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, korekcja);
  qr.addData(tekst);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, w) => Array.from({ length: n }, (_, k) => qr.isDark(w, k)));
}

/** SVG z jedną ścieżką na wszystkie ciemne moduły (sąsiednie w wierszu łączone). */
export function naSvg(m, { rozmiar, margines, kolor, tlo, logo = null, udzialLogo = 0.22 }) {
  const n = m.length, calosc = n + 2 * margines;
  let d = '';
  for (let w = 0; w < n; w++) {
    for (let k = 0; k < n; k++) {
      if (!m[w][k]) continue;
      let dl = 1;
      while (k + dl < n && m[w][k + dl]) dl++;
      d += `M${k + margines} ${w + margines}h${dl}v1h-${dl}z`;
      k += dl - 1;
    }
  }
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${calosc} ${calosc}" width="${rozmiar}" height="${rozmiar}" shape-rendering="crispEdges">`;
  if (tlo !== 'przezroczyste') svg += `<rect width="${calosc}" height="${calosc}" fill="${tlo}"/>`;
  svg += `<path fill="${kolor}" d="${d}"/>`;
  if (logo) {
    const bok = n * udzialLogo, pole = bok * 1.18;
    const srodek = calosc / 2;
    svg += `<rect x="${srodek - pole / 2}" y="${srodek - pole / 2}" width="${pole}" height="${pole}" fill="${tlo === 'przezroczyste' ? '#FFFFFF' : tlo}"/>`;
    svg += `<image href="${logo}" x="${srodek - bok / 2}" y="${srodek - bok / 2}" width="${bok}" height="${bok}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return svg + '</svg>';
}

const naDataUrl = (blob) => new Promise((ok, zle) => { const c = new FileReader(); c.onload = () => ok(c.result); c.onerror = zle; c.readAsDataURL(blob); });

export async function start(korzen) {
  await wczytajSkrypt(`${LIB}qrcode/qrcode.js`);
  const qrcode = window.qrcode;

  const tekst = el('textarea', { placeholder: 'https://sokolinski.com/…', rows: 2 });
  const rozmiar = lista([[512, '512 px'], [1024, '1024 px'], [2048, '2048 px']], 1024);
  const kolor = zetony(KOLORY_KODU, KOLORY_KODU[0][0], { kolory: true });
  const wlasnyKolor = el('input', { type: 'color', value: '#161310', title: 'Własny kolor kodu (musi być ciemny)' });
  let kolorKodu = KOLORY_KODU[0][0];
  const tlo = zetony(KOLORY_TLA.slice(0, 3), '#FFFFFF', { kolory: true });
  const przezroczyste = el('button', { type: 'button', class: 'zeton', text: 'bez tła', 'aria-pressed': 'false' });
  const margines = suwak(1, 8, 1, 4, (v) => `${v} moduły`);
  const znak = lista([['brak', 'bez logo'], ['bs', 'logo BS'], ['wlasne', 'własny plik…']], 'bs');
  const plikLogo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml', hidden: true });
  const plotno = el('canvas', { width: 1024, height: 1024 });
  const podglad = el('div', { class: 'podglad' }, plotno);
  const opis = el('p', { class: 'podpis' });
  const stan = postep();
  const akcje = el('div', { class: 'akcje' });

  let kolorTla = '#FFFFFF';
  let logoBs = null, logoWlasne = null;     // {url, obraz}
  let biezacy = null;                        // {m, opcje}

  try {
    const blob = await (await fetch(new URL('../logo-bs.png', import.meta.url))).blob();
    logoBs = { url: await naDataUrl(blob), obraz: await createImageBitmap(blob) };
  } catch { znak.value = 'brak'; }

  tlo.addEventListener('zmiana', () => { kolorTla = tlo.wartosc; przezroczyste.setAttribute('aria-pressed', 'false'); rysuj(); });
  przezroczyste.addEventListener('click', () => { kolorTla = 'przezroczyste'; tlo.ustaw(''); przezroczyste.setAttribute('aria-pressed', 'true'); rysuj(); });
  kolor.addEventListener('zmiana', () => { kolorKodu = kolor.wartosc; rysuj(); });
  wlasnyKolor.addEventListener('input', () => { kolorKodu = wlasnyKolor.value; kolor.ustaw(''); rysuj(); });
  tekst.addEventListener('input', rysuj);
  rozmiar.addEventListener('change', rysuj);
  margines.pole.addEventListener('input', rysuj);
  znak.addEventListener('change', () => { if (znak.value === 'wlasne' && !logoWlasne) plikLogo.click(); else rysuj(); });
  plikLogo.addEventListener('change', async () => {
    const p = plikLogo.files[0];
    if (!p) { znak.value = logoBs ? 'bs' : 'brak'; return rysuj(); }
    try {
      const obraz = await new Promise((ok, zle) => { const i = new Image(); i.onload = () => ok(i); i.onerror = zle; i.src = URL.createObjectURL(p); });
      logoWlasne = { url: await naDataUrl(p), obraz };
    } catch { znak.value = 'brak'; stan.blad('Nie udało się wczytać logo.'); }
    rysuj();
  });

  function rysuj() {
    const tresc = tekst.value.trim();
    akcje.hidden = !tresc;
    podglad.hidden = !tresc;
    if (!tresc) { opis.textContent = 'Wpisz adres albo tekst, kod pojawi się od razu.'; biezacy = null; return; }
    const logo = znak.value === 'bs' ? logoBs : znak.value === 'wlasne' ? logoWlasne : null;
    let m;
    try {
      m = macierz(qrcode, tresc, logo ? 'H' : 'M');   // z logo najwyższa korekcja błędów (30%)
    } catch (e) {
      stan.blad('Tekst jest za długi na kod QR. Skróć go albo użyj krótkiego linku.');
      podglad.hidden = true; akcje.hidden = true; biezacy = null;
      return;
    }
    stan.ukryj();
    const n = m.length, mar = margines.wartosc, calosc = n + 2 * mar;
    const skala = Math.max(1, Math.floor(Number(rozmiar.value) / calosc));
    const bok = skala * calosc;
    plotno.width = bok; plotno.height = bok;
    const k = plotno.getContext('2d');
    k.clearRect(0, 0, bok, bok);
    if (kolorTla !== 'przezroczyste') { k.fillStyle = kolorTla; k.fillRect(0, 0, bok, bok); }
    k.fillStyle = kolorKodu;
    for (let w = 0; w < n; w++) for (let c = 0; c < n; c++) if (m[w][c]) k.fillRect((c + mar) * skala, (w + mar) * skala, skala, skala);
    if (logo) {
      const b = n * 0.22 * skala, p = b * 1.18, s = bok / 2;
      k.fillStyle = kolorTla === 'przezroczyste' ? '#FFFFFF' : kolorTla;
      k.fillRect(s - p / 2, s - p / 2, p, p);
      k.imageSmoothingQuality = 'high';
      const prop = logo.obraz.width / logo.obraz.height;
      const lw = prop >= 1 ? b : b * prop, lh = prop >= 1 ? b / prop : b;
      k.drawImage(logo.obraz, s - lw / 2, s - lh / 2, lw, lh);
    }
    biezacy = { m, opcje: { rozmiar: bok, margines: mar, kolor: kolorKodu, tlo: kolorTla, logo: logo?.url || null } };
    opis.textContent = `${bok}×${bok} px · ${n}×${n} modułów · korekcja błędów ${logo ? '30%' : '15%'}. Przed drukiem sprawdź kod telefonem.`;
  }

  akcje.append(
    el('button', { type: 'button', class: 'przycisk', text: 'Pobierz PNG', onclick: async () => pobierz(await naBlob(plotno, 'image/png'), 'kod-qr.png') }),
    el('button', { type: 'button', class: 'przycisk przycisk-cichy', text: 'Pobierz SVG', onclick: () => { if (biezacy) pobierz(new Blob([naSvg(biezacy.m, biezacy.opcje)], { type: 'image/svg+xml' }), 'kod-qr.svg'); } }));

  korzen.append(
    el('div', { class: 'dwie-kolumny' },
      el('div', { class: 'opcje' },
        pole('Adres albo tekst', tekst, { szerokie: true }),
        pole('Kolor kodu', el('div', { class: 'rzad' }, kolor, wlasnyKolor)),
        pole('Tło', el('div', { class: 'rzad' }, tlo, przezroczyste)),
        pole('Logo w środku', el('div', {}, znak, plikLogo)),
        pole('Rozmiar PNG', rozmiar),
        pole('Margines wokół kodu', margines)),
      el('div', {}, podglad, opis)),
    stan.el, akcje);
  rysuj();
}
