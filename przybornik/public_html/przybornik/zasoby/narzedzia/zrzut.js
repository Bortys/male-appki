// § 03 Ładny zrzut · zrzut ekranu jako grafika do wpisu. Wszystko rysuje przeglądarka.
import { el, pole, lista, zetony, wybor, suwak, strefa, postep, pobierz, naBitmape, naBlob, nowePlotno, bezRozszerzenia, KOLORY, opisBledu } from '../wspolne.js';

const ROZMIARY = [
  ['auto', 'jak zrzut, z marginesem'],
  ['1080x1350', '4:5 · 1080×1350'],
  ['1080x1080', '1:1 · 1080×1080'],
  ['1200x627', 'LinkedIn link · 1200×627'],
  ['1600x900', '16:9 · 1600×900'],
  ['1080x1920', '9:16 · 1080×1920'],
];

/** Zwraca kopię obrazu z zamazanymi (mozaika) prostokątami. Pola to ułamki szerokości i wysokości. */
export function zamaz(obraz, pola) {
  const c = nowePlotno(obraz.width, obraz.height);
  const k = c.getContext('2d');
  k.drawImage(obraz, 0, 0);
  const kostka = Math.max(10, Math.round(Math.max(obraz.width, obraz.height) / 80));
  for (const p of pola) {
    const x = Math.round(p.x * c.width), y = Math.round(p.y * c.height);
    const w = Math.max(1, Math.round(p.w * c.width)), h = Math.max(1, Math.round(p.h * c.height));
    const maly = nowePlotno(Math.max(1, Math.ceil(w / kostka)), Math.max(1, Math.ceil(h / kostka)));
    const km = maly.getContext('2d');
    km.imageSmoothingQuality = 'high';
    km.drawImage(c, x, y, w, h, 0, 0, maly.width, maly.height);
    k.imageSmoothingEnabled = false;
    k.drawImage(maly, 0, 0, maly.width, maly.height, x, y, w, h);
    k.imageSmoothingEnabled = true;
  }
  return c;
}

/** Gdzie na płótnie wyląduje zrzut: {W, H, x, y, w, h, margines}. */
export function uklad(szerObrazu, wysObrazu, rozmiar, marginesProc) {
  if (rozmiar === 'auto') {
    const m = Math.round(Math.max(szerObrazu, wysObrazu) * marginesProc / 100);
    return { W: szerObrazu + 2 * m, H: wysObrazu + 2 * m, x: m, y: m, w: szerObrazu, h: wysObrazu, margines: m };
  }
  const [W, H] = rozmiar.split('x').map(Number);
  const m = Math.round(Math.min(W, H) * marginesProc / 100);
  const skala = Math.min((W - 2 * m) / szerObrazu, (H - 2 * m) / wysObrazu, 2);
  const w = Math.round(szerObrazu * skala), h = Math.round(wysObrazu * skala);
  return { W, H, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, margines: m };
}

export async function start(korzen) {
  let obraz = null;        // ImageBitmap zrzutu
  let nazwaPliku = 'zrzut';
  let pola = [];           // zamazane prostokąty
  let rysowane = null;     // prostokąt w trakcie przeciągania
  let logo = null;
  let ostatniUklad = null;

  const rozmiar = lista(ROZMIARY, 'auto');
  const tlo = zetony(KOLORY, KOLORY[0][0], { kolory: true });
  const wlasneTlo = el('input', { type: 'color', value: '#F6F1EA', title: 'Własny kolor tła' });
  const margines = suwak(0, 20, 1, 8, (v) => `${v}%`);
  const rogi = suwak(0, 24, 1, 4, (v) => `${v} px`);
  const cien = lista([['brak', 'brak'], ['lekki', 'lekki'], ['mocny', 'mocny']], 'lekki');
  const zLogo = wybor('Logo BS w dolnym marginesie');
  const plotno = el('canvas', { width: 1200, height: 750 });
  const podglad = el('div', { class: 'podglad klikalny' }, plotno);
  const stan = postep();
  const robocze = el('div', { hidden: true });
  const licznik = el('span', { class: 'wartosc' });
  let kolorTla = KOLORY[0][0];

  tlo.addEventListener('zmiana', () => { kolorTla = tlo.wartosc; rysuj(); });
  wlasneTlo.addEventListener('input', () => { kolorTla = wlasneTlo.value; tlo.ustaw(''); rysuj(); });
  for (const k of [rozmiar, cien, zLogo.pole]) k.addEventListener('change', rysuj);
  for (const k of [margines.pole, rogi.pole]) k.addEventListener('input', rysuj);

  function rysuj() {
    if (!obraz) return;
    const u = uklad(obraz.width, obraz.height, rozmiar.value, margines.wartosc);
    ostatniUklad = u;
    plotno.width = u.W; plotno.height = u.H;
    const k = plotno.getContext('2d');
    k.fillStyle = kolorTla;
    k.fillRect(0, 0, u.W, u.H);
    const promien = rogi.wartosc * (u.w / obraz.width);
    const sciezka = () => { k.beginPath(); k.roundRect(u.x, u.y, u.w, u.h, promien); };
    if (cien.value !== 'brak') {
      const baza = Math.min(u.W, u.H);
      k.save();
      k.shadowColor = cien.value === 'mocny' ? 'rgba(22, 19, 16, 0.38)' : 'rgba(22, 19, 16, 0.22)';
      k.shadowBlur = baza * (cien.value === 'mocny' ? 0.06 : 0.035);
      k.shadowOffsetY = baza * (cien.value === 'mocny' ? 0.025 : 0.012);
      k.fillStyle = '#FCFAF5';
      sciezka(); k.fill();
      k.restore();
    }
    k.save();
    sciezka(); k.clip();
    k.imageSmoothingQuality = 'high';
    k.drawImage(pola.length ? zamaz(obraz, pola) : obraz, u.x, u.y, u.w, u.h);
    k.restore();
    if (rysowane) {
      const r = prostokat(rysowane);
      k.lineWidth = Math.max(2, u.W / 400); k.strokeStyle = '#701828';
      k.strokeRect(u.x + r.x * u.w, u.y + r.y * u.h, r.w * u.w, r.h * u.h);
    }
    if (zLogo.pole.checked && logo) {
      const miejsce = u.H - (u.y + u.h);
      const bok = Math.min(miejsce * 0.6, Math.min(u.W, u.H) * 0.07);
      if (bok >= 20) k.drawImage(logo, u.x + u.w - bok, u.y + u.h + (miejsce - bok) / 2, bok, bok);
    }
    licznik.textContent = `${u.W}×${u.H} px` + (pola.length ? ` · zamazane pola: ${pola.length}` : '');
  }

  const prostokat = (r) => ({ x: Math.min(r.x0, r.x1), y: Math.min(r.y0, r.y1), w: Math.abs(r.x1 - r.x0), h: Math.abs(r.y1 - r.y0) });

  function naObrazie(zdarzenie) {
    const r = plotno.getBoundingClientRect();
    const u = ostatniUklad;
    const cx = (zdarzenie.clientX - r.left) * (plotno.width / r.width);
    const cy = (zdarzenie.clientY - r.top) * (plotno.height / r.height);
    return [Math.max(0, Math.min(1, (cx - u.x) / u.w)), Math.max(0, Math.min(1, (cy - u.y) / u.h))];
  }
  plotno.addEventListener('pointerdown', (z) => {
    if (!obraz) return;
    plotno.setPointerCapture(z.pointerId);
    const [x, y] = naObrazie(z);
    rysowane = { x0: x, y0: y, x1: x, y1: y };
  });
  plotno.addEventListener('pointermove', (z) => {
    if (!rysowane) return;
    [rysowane.x1, rysowane.y1] = naObrazie(z);
    rysuj();
  });
  const koniec = () => {
    if (!rysowane) return;
    const r = prostokat(rysowane);
    rysowane = null;
    if (r.w > 0.005 && r.h > 0.005) pola.push(r);
    rysuj();
  };
  plotno.addEventListener('pointerup', koniec);
  plotno.addEventListener('pointercancel', koniec);

  async function wczytaj(plik) {
    stan.ustaw('Wczytuję zrzut…');
    try {
      const nowy = await naBitmape(plik);
      obraz?.close?.();
      obraz = nowy;
      nazwaPliku = bezRozszerzenia(plik.name || 'zrzut');
      pola = [];
      robocze.hidden = false;
      rysuj();
      stan.ukryj();
    } catch (e) {
      stan.blad(opisBledu(e));
    }
  }

  // Wklejanie ze schowka działa, gdy to narzędzie jest na ekranie
  document.addEventListener('paste', (z) => {
    if (korzen.closest('.narzedzie')?.hidden) return;
    const obrazek = [...(z.clipboardData?.files || [])].find((p) => p.type.startsWith('image/'));
    if (obrazek) { z.preventDefault(); wczytaj(obrazek); }
  });

  async function eksport(typ) {
    rysowane = null; rysuj();
    const blob = await naBlob(plotno, typ, 0.93);
    return blob;
  }
  const doSchowka = el('button', { type: 'button', class: 'przycisk przycisk-cichy', text: 'Kopiuj do schowka' });
  doSchowka.addEventListener('click', async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': eksport('image/png') })]);
      stan.ustaw('Grafika jest w schowku.', 1);
    } catch (e) {
      stan.blad('Przeglądarka nie pozwoliła zapisać do schowka. Pobierz plik.');
    }
  });

  try {
    const odp = await fetch(new URL('../logo-bs.png', import.meta.url));
    logo = await createImageBitmap(await odp.blob());
  } catch { /* bez logo też działa */ }

  robocze.append(
    el('div', { class: 'opcje' },
      pole('Rozmiar grafiki', rozmiar),
      pole('Tło', el('div', { class: 'rzad' }, tlo, wlasneTlo)),
      pole('Margines', margines),
      pole('Zaokrąglenie rogów', rogi),
      pole('Cień', cien),
      pole('Znak', zLogo)),
    podglad,
    el('p', { class: 'podpis' }, 'Przeciągnij po zrzucie, żeby zamazać fragment (adres, nazwisko, kwotę). ', licznik),
    el('div', { class: 'akcje' },
      el('button', { type: 'button', class: 'przycisk', text: 'Pobierz PNG', onclick: async () => pobierz(await eksport('image/png'), `${nazwaPliku}-grafika.png`) }),
      el('button', { type: 'button', class: 'przycisk przycisk-cichy', text: 'Pobierz JPG', onclick: async () => pobierz(await eksport('image/jpeg'), `${nazwaPliku}-grafika.jpg`) }),
      doSchowka,
      el('button', { type: 'button', class: 'link', text: 'Cofnij zamazanie', onclick: () => { pola.pop(); rysuj(); } }),
      el('button', { type: 'button', class: 'link', text: 'Usuń zamazania', onclick: () => { pola = []; rysuj(); } })));

  korzen.append(
    strefa({ tytul: 'Upuść zrzut ekranu, kliknij albo wklej ze schowka (⌘V)', opis: 'PNG, JPG, HEIC, WebP.', accept: 'image/*,.heic,.heif', naPliki: ([p]) => wczytaj(p) }),
    stan.el, robocze);
}
