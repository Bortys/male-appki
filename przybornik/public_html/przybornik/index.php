<?php
/* =========================================================================
   PRZYBORNIK · strona z narzędziami. Domyślnie otwarta, bez hasła.
   Hasło jest opcją: /przybornik/?haslo pokaże treść pliku konfiguracja.php,
   a gdy ten plik trafi na serwer, strona zacznie wymagać logowania.
   ========================================================================= */
declare(strict_types=1);

require __DIR__ . '/wspolne.php';

naglowki_bezpieczenstwa();
header('Content-Type: text/html; charset=utf-8');

$metoda = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$komunikat = '';

/* --- Ustawianie hasła (opcja): strona tylko liczy skrót hasła ---------------- */
if (!skonfigurowane() && isset($_GET['haslo'])) {
    $wiersze_konfiguracji = '';
    if ($metoda === 'POST') {
        $haslo = (string) ($_POST['nowe_haslo'] ?? '');
        if (strlen($haslo) < 12) {
            $komunikat = 'Hasło musi mieć co najmniej 12 znaków.';
        } else {
            $wiersze_konfiguracji = "<?php\nconst HASLO_HASH = '" . password_hash($haslo, PASSWORD_DEFAULT) . "';\n"
                . "const SEKRET = '" . bin2hex(random_bytes(32)) . "';\n";
        }
    }
    naglowek_strony('Ustaw hasło');
    ?>
    <main class="waska">
      <p class="bs-eyebrow">Przybornik · opcja</p>
      <h1 class="tytul">Ustaw hasło</h1>
      <?php if ($wiersze_konfiguracji !== ''): ?>
        <p>Zapisz poniższą treść na serwerze jako plik <code>przybornik/konfiguracja.php</code>. Od tej chwili strona będzie wymagać logowania.</p>
        <pre class="kod"><?= e($wiersze_konfiguracji) ?></pre>
        <p class="bs-small">Hasło nie jest nigdzie zapisane. W pliku jest tylko jego skrót i losowy sekret do podpisywania sesji. Żeby wrócić do pracy bez hasła, usuń ten plik z serwera.</p>
      <?php else: ?>
        <p>Przybornik działa teraz bez hasła. Jeśli chcesz go zamknąć, podaj hasło. Strona pokaże gotową treść pliku konfiguracji do wgrania na serwer.</p>
        <form method="post" action="?haslo" class="formularz" autocomplete="off">
          <label class="pole"><span class="etykieta">Nowe hasło (min. 12 znaków)</span>
            <input type="password" name="nowe_haslo" minlength="12" required autocomplete="new-password"></label>
          <?php if ($komunikat !== ''): ?><p class="komunikat" role="alert"><?= e($komunikat) ?></p><?php endif; ?>
          <button class="przycisk" type="submit">Pokaż treść konfiguracji</button>
        </form>
      <?php endif; ?>
      <p><a href="./">wróć do narzędzi</a></p>
    </main>
    <?php
    stopka_strony();
    exit;
}

if (skonfigurowane()) {
    /* --- Wylogowanie --------------------------------------------------------- */
    if ($metoda === 'POST' && isset($_POST['wyloguj'])) {
        if (zeton_poprawny((string) ($_POST['zeton'] ?? ''))) { wyloguj(); }
        header('Location: ' . katalog_aplikacji() . '/', true, 303);
        exit;
    }

    /* --- Logowanie ----------------------------------------------------------- */
    if (!zalogowany()) {
        if ($metoda === 'POST') {
            if (logowanie_zablokowane()) {
                $komunikat = 'Za dużo nieudanych prób. Spróbuj ponownie za 15 minut.';
            } elseif (password_verify((string) ($_POST['haslo'] ?? ''), (string) HASLO_HASH)) {
                wyczysc_proby_adresu();
                zaloguj();
                header('Location: ' . katalog_aplikacji() . '/', true, 303);
                exit;
            } else {
                zapisz_nieudana_probe();
                usleep(400000);
                $komunikat = 'Hasło się nie zgadza.';
            }
        }
        naglowek_strony('Logowanie');
        ?>
        <main class="waska">
          <p class="bs-eyebrow">Przybornik</p>
          <h1 class="tytul">Zaloguj się</h1>
          <form method="post" class="formularz">
            <label class="pole"><span class="etykieta">Hasło</span>
              <input type="password" name="haslo" required autofocus autocomplete="current-password"></label>
            <?php if ($komunikat !== ''): ?><p class="komunikat" role="alert"><?= e($komunikat) ?></p><?php endif; ?>
            <button class="przycisk" type="submit">Wejdź</button>
          </form>
        </main>
        <?php
        stopka_strony();
        exit;
    }
    if (termin_sesji() - time() < WAZNOSC_SESJI / 2) { zaloguj(); }   // odnawiamy w połowie ważności
}

/* --- Aplikacja ------------------------------------------------------------- */
$narzedzia = narzedzia();
$aplikacje = aplikacje();
naglowek_strony('Przybornik', true);
?>
<div class="uklad">
  <nav class="spis" aria-label="Narzędzia">
    <?php $nr = 0; foreach ($narzedzia as $grupa => $lista): ?>
      <p class="bs-eyebrow spis-grupa"><?= e($grupa) ?></p>
      <ul>
        <?php foreach ($lista as $id => [$nazwa, $opis]): $nr++; ?>
          <li><a href="#<?= e($id) ?>" data-narzedzie="<?= e($id) ?>"><span class="nr"><?= sprintf('%02d', $nr) ?></span><?= e($nazwa) ?></a></li>
        <?php endforeach; ?>
      </ul>
    <?php endforeach; ?>
  </nav>

  <main class="warsztat" id="warsztat">
    <?php $nr = 0; foreach ($narzedzia as $grupa => $lista): foreach ($lista as $id => [$nazwa, $opis]): $nr++; ?>
      <section class="narzedzie" id="n-<?= e($id) ?>" data-id="<?= e($id) ?>"<?= isset($aplikacje[$id]) ? ' data-statyczne="1"' : '' ?> hidden>
        <p class="bs-eyebrow naglowek-sekcji"><span class="kreska"></span>§ <?= sprintf('%02d', $nr) ?> · <?= e($grupa) ?></p>
        <h1 class="tytul"><?= e($nazwa) ?></h1>
        <p class="bs-lede"><?= e($opis) ?></p>
        <?php if (isset($aplikacje[$id])): ?>
          <ul class="odnosniki">
            <?php foreach ($aplikacje[$id] as [$etykieta, $adres, $objasnienie]): ?>
              <li class="odnosnik">
                <a class="przycisk" href="<?= e($adres) ?>" target="_blank" rel="noopener"><?= e($etykieta) ?> ↗</a>
                <div><span class="bs-mono adres"><?= e(preg_replace('~^https?://~', '', $adres)) ?></span><p class="bs-small"><?= e($objasnienie) ?></p></div>
              </li>
            <?php endforeach; ?>
          </ul>
          <p class="bs-small">Aplikacja działa osobno, z własnym panelem i hasłem. Otwiera się w nowej karcie.</p>
        <?php else: ?>
          <div class="tresc"><p class="bs-small">Wczytuję narzędzie…</p></div>
        <?php endif; ?>
      </section>
    <?php endforeach; endforeach; ?>
    <noscript><p>Przybornik wymaga włączonego JavaScriptu.</p></noscript>
  </main>
</div>
<?php
stopka_strony(true);

/* --- Szablon ---------------------------------------------------------------- */

function naglowek_strony(string $tytul, bool $aplikacja = false): void {
    $v = rawurlencode(WERSJA);
    ?><!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title><?= e($tytul) ?> · Bartosz Sokoliński</title>
  <link rel="icon" href="zasoby/logo-bs.png">
  <link rel="stylesheet" href="zasoby/styl.css?v=<?= $v ?>">
  <?php if ($aplikacja): ?>
    <meta name="przybornik-zeton" content="<?= e(zeton()) ?>">
    <meta name="przybornik-wersja" content="<?= e(WERSJA) ?>">
    <script type="module" src="zasoby/app.js?v=<?= $v ?>"></script>
  <?php endif; ?>
</head>
<body>
<div class="gorna-kreska"></div>
<header class="pasek">
  <a class="marka" href="./"><img src="zasoby/logo-bs.png" width="28" height="28" alt=""><span>Przybornik</span></a>
  <?php if ($aplikacja && skonfigurowane()): ?>
    <form method="post" class="wyloguj">
      <input type="hidden" name="zeton" value="<?= e(zeton()) ?>">
      <button class="link" type="submit" name="wyloguj" value="1">Wyloguj</button>
    </form>
  <?php endif; ?>
</header>
<?php
}

function stopka_strony(bool $aplikacja = false): void {
    ?>
<footer class="stopka">
  <span>Bartosz Sokoliński · AI dla dorosłych</span>
  <span class="bs-mono">Przybornik <?= e(WERSJA) ?><?php if ($aplikacja): ?> · <a href="licencje.html">licencje bibliotek</a><?php if (!skonfigurowane()): ?> · <a href="?haslo">ustaw hasło</a><?php endif; endif; ?></span>
</footer>
</body>
</html>
<?php
}
