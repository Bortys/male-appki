/* Strona ankiety: wysyłka formularza, odświeżanie chmury co kilka sekund. */
(function () {
  'use strict';

  var body = document.body;
  var klucz = body.getAttribute('data-ankieta');
  var osadzona = body.classList.contains('osadzona');
  var formularz = document.getElementById('formularz');
  var komunikat = document.getElementById('komunikat');
  var podziekowanie = document.getElementById('podziekowanie');
  var twojeEl = document.getElementById('twoje-slowa');
  var zamknieta = document.getElementById('zamknieta');
  var chmura = document.getElementById('chmura');
  var listaSlow = document.getElementById('lista-slow');
  var licznik = document.getElementById('licznik');

  var KLUCZ_PAMIECI = 'ankieta:' + klucz;
  var runda = body.getAttribute('data-runda') || '0';
  var dane = { slowa: [], osoby: 0, wersja: '' };
  var twoje = [];

  function pamiecCzytaj() {
    try { return JSON.parse(localStorage.getItem(KLUCZ_PAMIECI) || 'null'); } catch (e) { return null; }
  }
  function pamiecZapisz(w) {
    try { localStorage.setItem(KLUCZ_PAMIECI, JSON.stringify(w)); } catch (e) { /* tryb prywatny */ }
  }

  function odmianaOsob(n) {
    if (n === 1) { return '1 osoba'; }
    var r10 = n % 10, r100 = n % 100;
    if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) { return n + ' osoby'; }
    return n + ' osób';
  }

  function pokazPodziekowanie(slowa) {
    twoje = slowa || [];
    if (formularz) { formularz.hidden = true; }
    podziekowanie.hidden = false;
    twojeEl.textContent = twoje.length ? 'Twoje słowa: ' + twoje.join(', ') : '';
  }

  function narysuj() {
    Chmura.rysuj(chmura, dane.slowa, { twoje: twoje, maksFont: 120 });
    Chmura.lista(listaSlow, dane.slowa);
    licznik.textContent = dane.osoby ? odmianaOsob(dane.osoby) : '';
    zglosWysokosc();
  }

  function przyjmij(d) {
    if (!d || !d.slowa) { return; }
    var zmiana = d.wersja !== dane.wersja;
    if (d.runda && d.runda !== runda) {
      runda = d.runda;
      twoje = [];
      if (formularz && d.otwarta) {
        formularz.reset();
        formularz.querySelector('button').disabled = false;
        formularz.querySelector('input[name="t"]').value = String(Math.floor(Date.now() / 1000));
        formularz.hidden = false;
        podziekowanie.hidden = true;
      }
    }
    dane = d;
    if (!d.otwarta && formularz && !formularz.hidden) {
      formularz.hidden = true;
      zamknieta.hidden = false;
    }
    if (zmiana) { narysuj(); }
  }

  function pobierz() {
    return fetch('api.php?a=' + encodeURIComponent(klucz), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(przyjmij)
      .catch(function () {});
  }

  if (formularz) {
    var pola = formularz.querySelectorAll('input[name="slowa[]"]');
    Array.prototype.forEach.call(pola, function (pole, i) {
      pole.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && i < pola.length - 1 && pole.value.trim() && !pola[i + 1].value.trim()) {
          ev.preventDefault();
          pola[i + 1].focus();
        }
      });
    });

    formularz.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var wpisane = Array.prototype.filter.call(pola, function (p) { return p.value.trim(); });
      if (!wpisane.length) {
        komunikat.textContent = 'Wpisz przynajmniej jedno słowo.';
        pola[0].focus();
        return;
      }
      var przycisk = formularz.querySelector('button');
      przycisk.disabled = true;
      komunikat.textContent = 'Wysyłam…';

      fetch('api.php', { method: 'POST', body: new FormData(formularz), credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (w) {
          if (!w.ok || w.j.blad) {
            komunikat.textContent = w.j.blad || 'Coś poszło nie tak. Spróbuj ponownie.';
            przycisk.disabled = false;
            return;
          }
          komunikat.textContent = '';
          pamiecZapisz({ runda: w.j.runda || runda, slowa: w.j.twoje || [] });
          pokazPodziekowanie(w.j.twoje || []);
          dane.wersja = '';
          przyjmij(w.j);
        })
        .catch(function () {
          komunikat.textContent = 'Brak połączenia. Spróbuj ponownie.';
          przycisk.disabled = false;
        });
    });
  }

  // Po wyczyszczeniu wyników w panelu zmienia się „runda” i formularz wraca.
  var zapamietane = pamiecCzytaj();
  if (zapamietane && zapamietane.runda === runda && formularz && !formularz.hidden) {
    pokazPodziekowanie(zapamietane.slowa);
  }

  function zglosWysokosc() {
    if (!osadzona || window.parent === window) { return; }
    window.parent.postMessage({ typ: 'ankieta-wysokosc', ankieta: klucz, h: Math.ceil(document.body.getBoundingClientRect().height) }, '*');
  }

  var czasomierz;
  window.addEventListener('resize', function () {
    clearTimeout(czasomierz);
    czasomierz = setTimeout(narysuj, 150);
  });

  setInterval(function () { if (!document.hidden) { pobierz(); } }, 5000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { pobierz(); } });

  Chmura.fontyGotowe().then(pobierz);
})();
