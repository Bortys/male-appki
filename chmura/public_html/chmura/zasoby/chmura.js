/* Chmura słów – układ spiralny bez zewnętrznych bibliotek.
   Chmura.rysuj(kontener, slowa, { twoje: [...], maksFont: 140 })
   slowa: [{ w: 'słowo', n: 3 }, …] posortowane malejąco po n. */
(function () {
  'use strict';

  var FONT = '"BS Serif", "EB Garamond", Georgia, serif';
  var ctx = document.createElement('canvas').getContext('2d');
  var PALETA = ['k-ink', 'k-oxsoft', 'k-ink2', 'k-mute'];

  function zmierz(tekst, rozmiar, waga) {
    ctx.font = waga + ' ' + rozmiar + 'px ' + FONT;
    return ctx.measureText(tekst).width;
  }

  // Stały „losowy” kąt startowy dla słowa: ten sam wynik przy każdym odświeżeniu.
  function hasz(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }

  function nachodzi(a, lista) {
    for (var i = 0; i < lista.length; i++) {
      var b = lista[i];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) { return true; }
    }
    return false;
  }

  function uloz(slowa, W, H, opcje) {
    var n = slowa.length;
    if (!n || W < 40 || H < 40) { return []; }
    var maxN = slowa[0].n, minN = slowa[n - 1].n;
    var cx = W / 2, cy = H / 2;
    var proporcja = Math.sqrt(Math.min(3, Math.max(0.4, W / H)));
    var skala = 1, ostatni = [];

    for (var proba = 0; proba < 12; proba++) {
      var maksF = Math.min(H * 0.3, W * 0.17, opcje.maksFont || 150) * skala;
      if (n === 1) { maksF = Math.min(maksF, W * 0.22); }
      var minF = Math.max(opcje.minFont || 13, maksF * 0.2);
      var postawione = [], wynik = [], pominiete = 0, porazka = false;

      for (var i = 0; i < n; i++) {
        var s = slowa[i];
        var t = maxN === minN ? (n > 6 ? 0.45 : 0.8) : Math.sqrt((s.n - minN) / (maxN - minN));
        var f = Math.max(minF, Math.round(minF + (maksF - minF) * t));
        var waga = i < 3 && t > 0.5 ? 600 : 500;
        var pad = Math.max(3, f * 0.12);
        var tekst = s.e || s.w;
        var szer = Math.ceil(zmierz(tekst, f, waga) + pad * 2);
        var wys = Math.ceil(f * 1.08 + pad * 0.4);
        if (szer > W) { if (i < 3) { porazka = true; break; } pominiete++; continue; }

        var kat0 = (hasz(s.w) % 628) / 100;
        var krok = Math.max(1.2, f * 0.06);
        var miejsce = null;
        for (var k = 0; k < 5000; k++) {
          var kat = k * 0.11;
          var r = krok * kat;
          var x = cx + r * Math.cos(kat + kat0) * proporcja - szer / 2;
          var y = cy + r * Math.sin(kat + kat0) / proporcja - wys / 2;
          if (r > Math.max(W, H)) { break; }
          if (x < 0 || y < 0 || x + szer > W || y + wys > H) { continue; }
          var pudelko = { x: x, y: y, w: szer, h: wys };
          if (!nachodzi(pudelko, postawione)) { miejsce = pudelko; break; }
        }
        if (!miejsce) {
          if (i < 4) { porazka = true; break; }
          pominiete++;
          continue;
        }
        postawione.push(miejsce);
        wynik.push({ w: s.w, t: tekst, n: s.n, f: f, waga: waga, x: miejsce.x, y: miejsce.y, sz: szer, wy: wys, ranga: i });
      }

      ostatni = wynik;
      if (!porazka && pominiete <= Math.max(1, n * 0.08)) { return wynik; }
      skala *= 0.86;
    }
    return ostatni;
  }

  function rysuj(kontener, slowa, opcje) {
    opcje = opcje || {};
    var W = kontener.clientWidth, H = kontener.clientHeight;
    // Słowa są kluczami, więc obiekty bez prototypu: „constructor” w zwykłym {} wywracał rysowanie.
    var twoje = Object.create(null);
    (opcje.twoje || []).forEach(function (w) { twoje[w] = true; });

    var mapa = kontener._mapa || (kontener._mapa = Object.create(null));
    var pusty = kontener.querySelector('.chmura-pusta');

    if (!slowa.length) {
      Object.keys(mapa).forEach(function (k) { mapa[k].remove(); delete mapa[k]; });
      if (!pusty) {
        pusty = document.createElement('p');
        pusty.className = 'chmura-pusta';
        pusty.textContent = opcje.pustyTekst || 'Tu pojawią się odpowiedzi.';
        kontener.appendChild(pusty);
      }
      return;
    }
    if (pusty) { pusty.remove(); }

    var uklad = uloz(slowa, W, H, opcje);
    var widoczne = Object.create(null);

    uklad.forEach(function (u) {
      widoczne[u.w] = true;
      var el = mapa[u.w];
      var nowy = !el;
      if (nowy) {
        el = document.createElement('span');
        el.className = 'slowo';
        el.textContent = u.t;
        el.style.opacity = '0';
        kontener.appendChild(el);
        mapa[u.w] = el;
      }
      var kolor = u.ranga < 3 ? 'k-ox' : PALETA[hasz(u.w) % PALETA.length];
      el.className = 'slowo ' + kolor + (twoje[u.w] ? ' twoje' : '');
      if (el.textContent !== u.t) { el.textContent = u.t; }
      el.title = u.t + ' – ' + u.n;
      el.style.fontSize = u.f + 'px';
      el.style.fontWeight = u.waga;
      el.style.width = u.sz + 'px';
      el.style.height = u.wy + 'px';
      el.style.lineHeight = u.wy + 'px';
      el.style.transform = 'translate(' + Math.round(u.x) + 'px,' + Math.round(u.y) + 'px)';
      if (nowy) {
        requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.opacity = '1'; }); });
      }
    });

    Object.keys(mapa).forEach(function (k) {
      if (!widoczne[k]) { mapa[k].remove(); delete mapa[k]; }
    });
  }

  function lista(ol, slowa) {
    if (!ol) { return; }
    ol.textContent = '';
    slowa.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = (s.e || s.w) + ' – ' + s.n;
      ol.appendChild(li);
    });
  }

  function fontyGotowe() {
    if (!document.fonts || !document.fonts.load) { return Promise.resolve(); }
    return Promise.all([
      document.fonts.load('500 40px "BS Serif"'),
      document.fonts.load('600 40px "BS Serif"')
    ]).catch(function () {});
  }

  window.Chmura = { rysuj: rysuj, lista: lista, fontyGotowe: fontyGotowe };
})();
