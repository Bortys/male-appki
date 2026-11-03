<?php
/* Widok na rzutnik: duża chmura, kod QR do formularza, licznik osób.
   Adres: /chmura/ekran.php?a=<klucz>      (jasny)
          /chmura/ekran.php?a=<klucz>&ciemny=1   (ciemny, do sal z rzutnikiem)
   Klawisz F – pełny ekran. */

require __DIR__ . '/wspolne.php';
naglowki_bezpieczenstwa();

$klucz   = ankieta_klucz();
$ankieta = ANKIETY[$klucz];
$adres   = adres_ankiety($klucz);
$krotki  = preg_replace('#^https?://(www\.)?#', '', $adres);
$ciemny  = !empty($_GET['ciemny']);
?><!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ekran · <?= e($ankieta['pytanie']) ?></title>
<link rel="stylesheet" href="zasoby/ankieta.css">
</head>
<body class="ekran<?= $ciemny ? ' ciemny' : '' ?>" data-ankieta="<?= e($klucz) ?>" data-adres="<?= e($adres) ?>">

<header class="ekran-gora">
  <div>
    <p class="bs-eyebrow">Pytanie</p>
    <h1 class="ekran-pytanie"><?= e($ankieta['pytanie']) ?></h1>
  </div>
  <img class="ekran-logo" src="zasoby/logo-bs.png" alt="BS" width="56" height="56">
</header>

<main class="ekran-chmura chmura" id="chmura" role="img" aria-label="Chmura słów z odpowiedzi"></main>

<footer class="ekran-dol">
  <div class="ekran-qr">
    <img id="qr" alt="Kod QR do ankiety" width="132" height="132">
    <div>
      <p class="bs-eyebrow">Odpowiedz z telefonu</p>
      <p class="ekran-adres bs-mono"><?= e($krotki) ?></p>
    </div>
  </div>
  <div class="ekran-licznik">
    <span class="ekran-liczba bs-mono" id="liczba">0</span>
    <span class="bs-eyebrow" id="liczba-opis">osób odpowiedziało</span>
  </div>
  <button type="button" class="przycisk przycisk-cichy" id="pelny">Pełny ekran</button>
</footer>

<script src="zasoby/qrcode.js"></script>
<script src="zasoby/chmura.js?v=2"></script>
<script src="zasoby/ekran.js"></script>
</body>
</html>
