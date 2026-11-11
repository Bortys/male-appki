// § 02 Kadrownik · jedno zdjęcie, komplet formatów. Podgląd liczy przeglądarka,
// ostateczne kadry z oryginału robi serwer (Imagick, filtr Lanczos).
import { el, pole, lista, suwak, strefa, postep, pobierz, rozmiar, odmiana, api, opisBledu, bezRozszerzenia } from '../wspolne.js';

export const FORMATY = [
  { id: 'pion-4x5', nazwa: 'Instagram i LinkedIn, pion 4:5', w: 1080, h: 1350 },
  { id: 'kwadrat-1x1', nazwa: 'Kwadrat 1:1', w: 1080, h: 1080 },
  { id: 'story-9x16', nazwa: 'Story, Reels, TikTok 9:16', w: 1080, h: 1920 },
  { id: 'linkedin-link', nazwa: 'LinkedIn, grafika linku', w: 1200, h: 627 },
  { id: 'facebook-link', nazwa: 'Facebook, grafika linku', w: 1200, h: 630 },
  { id: 'x-16x9', nazwa: 'X 16:9', w: 1600, h: 900 },
  { id: 'youtube', nazwa: 'Miniatura YouTube', w: 1280, h: 720 },
];

/** Ta sama arytmetyka co prostokat_kadru() w obrazy.php. */
export function prostokatKadru(W, H, szer, wys, fx, fy, zoom) {
  const proporcje = szer / wys;
  let kw, kh;
  if (W / H > proporcje) { kh = H; kw = H * proporcje; } else { kw = W; kh = W / proporcje; }
  zoom = Math.max(1, Math.min(4, zoom));
  kw /= zoom; kh /= zoom;
  const x = Math.max(0, Math.min(W - kw, fx * W - kw / 2));
  const y = Math.max(0, Math.min(H - kh, fy * H - kh / 2));
  return [x, y, kw, kh];
}

export async function start(korzen) {
  let plik = null;       // oryginał
  let obraz = null;      // ImageBitmap podglądu
  let wymiary = null;    // wymiary oryginału
  let fx = 0.5, fy = 0.5;
  let aktywny = null;    // format, którego ramkę pokazujemy na dużym podglądzie

  const plotno = el('canvas', { width: 800, height: 500 });
  const podglad = el('div', { class: 'podglad klikalny' }, plotno);
  const opisPodgladu = el('p', { class: 'podpis', text: 'Kliknij albo przeciągnij po zdjęciu, żeby wskazać, co ma zostać w kadrze.' });
  const przyblizenie = suwak(1, 3, 0.05, 1, (v) => `${Math.round(v * 100)}%`);
  const jakosc = lista([[95, 'najwyższa (95)'], [90, 'wysoka (90)'], [82, 'średnia (82)']], 90);
  const nazwa = el('input', { type: 'text', placeholder: 'nazwa plików' });
  const kafle = el('ul', { class: 'kafle' });
  const przycisk = el('button', { type: 'button', class: 'przycisk', text: 'Pobierz komplet (ZIP)', disabled: true });
  const stan = postep();
  const robocze = el('div', { hidden: true });

  const karty = FORMATY.map((f) => {
    const miniatura = el('canvas', { width: 300, height: Math.round(300 * f.h / f.w) });
    const pudelko = el('input', { type: 'checkbox', checked: true });
    const li = el('li', { class: 'kafel zaznaczony' },
      el('div', { class: 'kafel-ramka' }, miniatura),
      el('label', { class: 'wybor kafel-opis' }, pudelko, el('span', {}, f.nazwa, el('br'), el('span', { class: 'bs-mono', text: `${f.w}×${f.h}` }))));
    pudelko.addEventListener('change', () => { li.classList.toggle('zaznaczony', pudelko.checked); odswiezPrzycisk(); });
    li.addEventListener('pointerenter', () => { aktywny = f; rysujGlowny(); });
    li.addEventListener('pointerleave', () => { aktywny = null; rysujGlowny(); });
    kafle.append(li);
    return { f, miniatura, pudelko };
  });

  function odswiezPrzycisk() { przycisk.disabled = !plik || !karty.some((k) => k.pudelko.checked); }

  function rysujGlowny() {
    if (!obraz) return;
    const k = plotno.getContext('2d');
    k.drawImage(obraz, 0, 0, plotno.width, plotno.height);
    const skala = plotno.width / 800;
    if (aktywny) {
      const [x, y, w, h] = prostokatKadru(plotno.width, plotno.height, aktywny.w, aktywny.h, fx, fy, przyblizenie.wartosc);
      k.lineWidth = 6 * skala; k.strokeStyle = '#F6F1EA'; k.strokeRect(x, y, w, h);
      k.lineWidth = 2.5 * skala; k.strokeStyle = '#701828'; k.strokeRect(x, y, w, h);
    }
    const px = fx * plotno.width, py = fy * plotno.height, r = 13 * skala;
    for (const [grubosc, kolor] of [[6 * skala, '#F6F1EA'], [2.5 * skala, '#701828']]) {
      k.lineWidth = grubosc; k.strokeStyle = kolor;
      k.beginPath(); k.moveTo(px - r, py); k.lineTo(px + r, py); k.moveTo(px, py - r); k.lineTo(px, py + r); k.stroke();
    }
  }

  function rysujMiniatury() {
    if (!obraz) return;
    for (const { f, miniatura } of karty) {
      const [x, y, w, h] = prostokatKadru(obraz.width, obraz.height, f.w, f.h, fx, fy, przyblizenie.wartosc);
      const k = miniatura.getContext('2d');
      k.imageSmoothingQuality = 'high';
      k.drawImage(obraz, x, y, w, h, 0, 0, miniatura.width, miniatura.height);
    }
  }

  function rysuj() { rysujGlowny(); rysujMiniatury(); }

  function wskaz(zdarzenie) {
    const r = plotno.getBoundingClientRect();
    fx = Math.max(0, Math.min(1, (zdarzenie.clientX - r.left) / r.width));
    fy = Math.max(0, Math.min(1, (zdarzenie.clientY - r.top) / r.height));
    rysuj();
  }
  plotno.addEventListener('pointerdown', (z) => { if (!obraz) return; plotno.setPointerCapture(z.pointerId); wskaz(z); });
  plotno.addEventListener('pointermove', (z) => { if (obraz && z.buttons) wskaz(z); });
  przyblizenie.pole.addEventListener('input', rysuj);

  async function wczytaj([nowy]) {
    stan.ustaw(`Przygotowuję podgląd: ${nowy.name}`);
    try {
      const { blob, info } = await api('podglad', { plik: nowy, bok: 1600 });
      obraz?.close?.();
      obraz = await createImageBitmap(blob);
      plik = nowy;
      wymiary = info;
      fx = 0.5; fy = 0.5;
      plotno.width = obraz.width; plotno.height = obraz.height;
      nazwa.value = bezRozszerzenia(nowy.name);
      robocze.hidden = false;
      const male = FORMATY.filter((f) => info.szer < f.w || info.wys < f.h).length;
      opisPodgladu.textContent = `Oryginał ${info.szer}×${info.wys} px, ${rozmiar(nowy.size)}. Kliknij albo przeciągnij po zdjęciu, żeby wskazać, co ma zostać w kadrze.`
        + (male ? ' Zdjęcie jest mniejsze niż część formatów, te kadry będą powiększone.' : '');
      rysuj();
      stan.ukryj();
    } catch (e) {
      stan.blad(opisBledu(e));
    }
    odswiezPrzycisk();
  }

  przycisk.addEventListener('click', async () => {
    const formaty = karty.filter((k) => k.pudelko.checked).map(({ f }) => ({ id: f.id, w: f.w, h: f.h }));
    przycisk.disabled = true;
    stan.ustaw(`Kadruję z oryginału: ${odmiana(formaty.length, 'format', 'formaty', 'formatów')}…`);
    try {
      const { blob, info } = await api('kadruj', { plik, formaty, fx, fy, zoom: przyblizenie.wartosc, jakosc: jakosc.value, nazwa: nazwa.value || plik.name });
      pobierz(blob, info.nazwa || 'kadry.zip');
      stan.ustaw(`Gotowe: ${odmiana(formaty.length, 'plik', 'pliki', 'plików')}, ${rozmiar(blob.size)}.`, 1);
    } catch (e) {
      stan.blad(opisBledu(e));
    }
    odswiezPrzycisk();
  });

  robocze.append(
    el('div', { class: 'dwie-kolumny' },
      el('div', {}, podglad, opisPodgladu),
      el('div', { class: 'opcje ciasne' },
        pole('Przybliżenie kadru', przyblizenie, { szerokie: true }),
        pole('Jakość JPG', jakosc),
        pole('Nazwa plików', nazwa))),
    kafle,
    el('div', { class: 'akcje' }, przycisk));

  korzen.append(
    strefa({ tytul: 'Upuść zdjęcie albo kliknij, żeby wybrać', opis: 'JPG, PNG, HEIC, WebP, AVIF. Jedno zdjęcie naraz.', accept: 'image/*,.heic,.heif,.avif', naPliki: wczytaj }),
    stan.el, robocze);
}
