/* Widok na rzutnik: odświeżanie co 3 sekundy, kod QR, pełny ekran. */
(function () {
  'use strict';

  var body = document.body;
  var klucz = body.getAttribute('data-ankieta');
  var adres = body.getAttribute('data-adres');
  var chmura = document.getElementById('chmura');
  var liczba = document.getElementById('liczba');
  var liczbaOpis = document.getElementById('liczba-opis');
  var dane = { slowa: [], osoby: 0, wersja: null };

  try {
    var qr = qrcode(0, 'M');
    qr.addData(adres);
    qr.make();
    document.getElementById('qr').src = qr.createDataURL(6, 2);
  } catch (e) { /* bez QR ekran dalej działa */ }

  function opisOsob(n) {
    if (n === 1) { return 'osoba odpowiedziała'; }
    var r10 = n % 10, r100 = n % 100;
    if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) { return 'osoby odpowiedziały'; }
    return 'osób odpowiedziało';
  }

  function narysuj() {
    Chmura.rysuj(chmura, dane.slowa, { maksFont: 220, minFont: 18, pustyTekst: 'Czekam na pierwsze odpowiedzi.' });
    liczba.textContent = String(dane.osoby);
    liczbaOpis.textContent = opisOsob(dane.osoby);
  }

  function pobierz() {
    fetch('api.php?a=' + encodeURIComponent(klucz), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.slowa) { return; }
        var zmiana = d.wersja !== dane.wersja;
        dane = d;
        if (zmiana) { narysuj(); }
      })
      .catch(function () {});
  }

  function przelaczPelny() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
  document.getElementById('pelny').addEventListener('click', przelaczPelny);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'f' || ev.key === 'F') { przelaczPelny(); }
  });

  var czasomierz;
  window.addEventListener('resize', function () {
    clearTimeout(czasomierz);
    czasomierz = setTimeout(narysuj, 150);
  });

  Chmura.fontyGotowe().then(pobierz);
  setInterval(pobierz, 3000);
})();
