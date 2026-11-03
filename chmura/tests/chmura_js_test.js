#!/usr/bin/env node
// Rysowanie chmury na atrapie przeglądarki. Uruchomienie: node tests/chmura_js_test.js [ścieżka do chmura.js]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plik = process.argv[2] || path.join(__dirname, '..', 'public_html', 'chmura', 'zasoby', 'chmura.js');

function element() {
  const el = {
    style: {}, className: '', textContent: '', title: '', dzieci: [], rodzic: null, clientWidth: 1200, clientHeight: 700,
    appendChild(d) { d.rodzic = el; el.dzieci.push(d); },
    remove() { if (el.rodzic) { el.rodzic.dzieci.splice(el.rodzic.dzieci.indexOf(el), 1); } },
    querySelector() { return null; },
    getContext() { return { font: '', measureText: (t) => ({ width: t.length * 12 }) }; },
  };
  return el;
}

const swiat = { document: { createElement: element }, requestAnimationFrame: (f) => f(), Math, Object, window: {} };
vm.runInNewContext(fs.readFileSync(plik, 'utf8'), swiat);
const { Chmura } = swiat.window;

let bledy = 0;
function sprawdz(opis, slowa, opcje) {
  const kontener = element();
  try {
    Chmura.rysuj(kontener, slowa, opcje || {});
    const widoczne = kontener.dzieci.map((d) => d.textContent);
    const brak = slowa.map((s) => s.w).filter((w) => !widoczne.includes(w));
    if (brak.length) { throw new Error('brakuje słów: ' + brak.join(', ')); }
    console.log('ok   ' + opis);
  } catch (e) {
    bledy++;
    console.log('BŁĄD ' + opis + ': ' + e.message);
  }
}

sprawdz('zwykłe słowa', [{ w: 'pomoc', n: 3 }, { w: 'wsparcie', n: 2 }, { w: 'analiza', n: 1 }]);
sprawdz('słowo „constructor” w środku rankingu', [{ w: 'pomoc', n: 3 }, { w: 'constructor', n: 2 }, { w: 'analiza', n: 1 }]);
sprawdz('słowo „constructor” na szczycie', [{ w: 'constructor', n: 30 }, { w: 'pomoc', n: 3 }]);
sprawdz('„constructor” wśród słów tej osoby', [{ w: 'pomoc', n: 3 }, { w: 'analiza', n: 1 }], { twoje: ['constructor'] });
process.exit(bledy ? 1 : 0);
