<?php
/* Strona ankiety: formularz + chmura słów na żywo.
   Adres:      /chmura/?a=<klucz>
   Osadzanie:  /chmura/?a=<klucz>&osadz=1   (bez nagłówka i stopki, do <iframe>) */

require __DIR__ . '/wspolne.php';
naglowki_bezpieczenstwa();
usun_stare_ciasteczko();

$klucz   = ankieta_klucz();
$ankieta = ANKIETY[$klucz];
$stan    = czytaj_stan($klucz);
posprzataj_limity($klucz, $stan);
$otwarta = czy_otwarta($klucz, $stan);
$osadz   = !empty($_GET['osadz']);
?><!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($ankieta['pytanie']) ?> · Bartosz Sokoliński</title>
<meta name="description" content="<?= e($ankieta['opis']) ?>">
<meta property="og:title" content="<?= e($ankieta['pytanie']) ?>">
<meta property="og:description" content="<?= e($ankieta['opis']) ?>">
<link rel="preload" href="zasoby/fonty/EBGaramond-500.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="zasoby/ankieta.css">
</head>
<body class="strona<?= $osadz ? ' osadzona' : '' ?>"
      data-ankieta="<?= e($klucz) ?>"
      data-limit="<?= (int)SLOW_NA_OSOBE ?>"
      data-runda="<?= e((string)$stan['runda']) ?>">

<?php if (!$osadz): ?>
<header class="pasek">
  <a class="marka" href="/"><img src="zasoby/logo-bs.png" alt="" width="28" height="28"><span>Bartosz Sokoliński</span></a>
  <span class="bs-eyebrow">Ankieta</span>
</header>
<?php endif; ?>

<main class="uklad">
  <section class="pytanie-blok">
    <p class="bs-eyebrow">Pytanie</p>
    <h1 class="pytanie"><?= e($ankieta['pytanie']) ?></h1>
    <p class="opis"><?= e($ankieta['opis']) ?></p>

    <form id="formularz" class="formularz"<?= $otwarta ? '' : ' hidden' ?> autocomplete="off" novalidate>
      <input type="hidden" name="a" value="<?= e($klucz) ?>">
      <input type="hidden" name="t" value="<?= time() ?>">
      <div class="pulapka" aria-hidden="true">
        <label>Strona www <input type="text" name="strona_www" tabindex="-1"></label>
      </div>
      <?php for ($i = 1; $i <= SLOW_NA_OSOBE; $i++): ?>
      <label class="pole">
        <span class="pole-nr bs-mono"><?= $i ?></span>
        <input type="text" name="slowa[]" maxlength="<?= (int)MAKS_DLUGOSC ?>"
               placeholder="<?= $i === 1 ? 'Pierwsze słowo' : ($i === 2 ? 'Drugie (opcjonalnie)' : 'Kolejne (opcjonalnie)') ?>"
               <?= $i === 1 ? 'required' : '' ?> enterkeyhint="<?= $i < SLOW_NA_OSOBE ? 'next' : 'send' ?>">
      </label>
      <?php endfor; ?>
      <div class="akcje">
        <button type="submit" class="przycisk">Dodaj do chmury</button>
        <p class="komunikat" id="komunikat" role="status" aria-live="polite"></p>
      </div>
    </form>

    <div id="podziekowanie" class="podziekowanie" hidden>
      <p class="bs-lede">Dziękuję. Twoje słowa są już w chmurze.</p>
      <p class="bs-small" id="twoje-slowa"></p>
    </div>

    <p id="zamknieta" class="zamknieta"<?= $otwarta ? ' hidden' : '' ?>>Ankieta jest zamknięta. Poniżej wynik.</p>
  </section>

  <section class="chmura-blok" aria-labelledby="chmura-tytul">
    <div class="chmura-naglowek">
      <h2 id="chmura-tytul" class="bs-eyebrow">Chmura odpowiedzi</h2>
      <span class="licznik bs-mono" id="licznik"></span>
    </div>
    <div class="chmura" id="chmura" role="img" aria-label="Chmura słów z odpowiedzi"></div>
    <ol class="tylko-czytnik" id="lista-slow"></ol>
  </section>
</main>

<footer class="stopka">
  <?php if (!$osadz): ?><span>sokolinski.com</span><?php endif; ?>
  <span>Odpowiedzi są anonimowe i widoczne w chmurze: zapisuję słowa i godzinę wysłania. Ciasteczko i skrót adresu IP służą tylko do limitu wysyłek, a twoje słowa zostają w tej przeglądarce.</span>
</footer>

<script src="zasoby/chmura.js?v=2"></script>
<script src="zasoby/strona.js"></script>
</body>
</html>
