/* Panel skracacza: kopiowanie linku i potwierdzenie usunięcia.
   W osobnym pliku, bo polityka CSP blokuje skrypty wpisane w HTML. */
document.addEventListener('click', function (ev) {
  var przycisk = ev.target.closest('[data-copy]');
  if (!przycisk) { return; }
  navigator.clipboard.writeText(przycisk.getAttribute('data-copy')).then(function () {
    przycisk.textContent = 'Skopiowano';
  }, function () {
    przycisk.textContent = 'Nie udało się skopiować';
  });
});

document.addEventListener('submit', function (ev) {
  var pytanie = ev.target.getAttribute('data-confirm');
  if (pytanie && !confirm(pytanie)) { ev.preventDefault(); }
});
