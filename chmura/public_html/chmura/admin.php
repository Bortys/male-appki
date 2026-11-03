<?php
/* Panel ankiety: moderacja słów, scalanie odmian, otwieranie i zamykanie,
   eksport CSV, czyszczenie wyników. Hasło ustawiasz w konfiguracja.php. */

require __DIR__ . '/wspolne.php';
naglowki_bezpieczenstwa();
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const HASLO_DOMYSLNE = 'zmien-mnie-2026'; // opublikowane w starej instrukcji, nigdy nie wpuszcza
const OKNO_LOGOWANIA = 900;               // okno liczenia błędnych haseł, w sekundach
const PROBY_NA_ADRES = 5;                 // błędne hasła z jednego adresu w oknie
const PROBY_LACZNIE = 50;                 // od tylu prób łącznie (atak z wielu adresów) każdy adres ma tylko jedną
const BEZCZYNNOSC = 7200;                 // wylogowanie po 2 godzinach bezczynności

if ($_SERVER['REQUEST_METHOD'] === 'POST' && obce_zrodlo()) {
    http_response_code(403);
    exit;
}

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_name('ankieta_admin');
session_set_cookie_params(['lifetime' => 0, 'path' => katalog_aplikacji() . '/', 'httponly' => true, 'samesite' => 'Strict',
    'secure' => czy_https()]);
session_start();

if (!empty($_SESSION['zalogowany']) && time() - ($_SESSION['aktywnosc'] ?? 0) > BEZCZYNNOSC) {
    $_SESSION = [];
    session_regenerate_id(true);
}
if (!empty($_SESSION['zalogowany'])) { $_SESSION['aktywnosc'] = time(); }

if (empty($_SESSION['token'])) { $_SESSION['token'] = bin2hex(random_bytes(16)); }
$token = $_SESSION['token'];

function wroc(string $klucz, string $info = ''): void {
    if ($info !== '') { $_SESSION['info'] = $info; }
    header('Location: admin.php?a=' . rawurlencode($klucz));
    exit;
}

function haslo_jako_hash(): bool {
    return ustawienie('ADMIN_HASLO_HASH', '') !== '';
}

function haslo_ustawione(): bool {
    return haslo_jako_hash() || !in_array(ustawienie('ADMIN_HASLO', ''), ['', HASLO_DOMYSLNE], true);
}

function haslo_poprawne(string $podane): bool {
    if (haslo_jako_hash()) { return password_verify($podane, ADMIN_HASLO_HASH); }
    return haslo_ustawione() && hash_equals(ADMIN_HASLO, $podane);
}

/* Licznik błędnych haseł. Działa na skrótach adresów i nie zależy od sesji,
   którą atakujący może zaczynać od nowa przy każdej próbie. */
function proby_logowania(callable $zmiana) {
    return zmien_plik(KATALOG_DANYCH . '/_logowania.php', function (array &$proby) use ($zmiana) {
        $granica = time() - OKNO_LOGOWANIA;
        foreach ($proby as $kto => $czasy) {
            $czasy = array_values(array_filter($czasy, function ($t) use ($granica) { return $t > $granica; }));
            if ($czasy) { $proby[$kto] = $czasy; } else { unset($proby[$kto]); }
        }
        return $zmiana($proby, skrot_ip());
    });
}

/* --- Logowanie ---------------------------------------------------------- */
if (isset($_POST['haslo']) && is_string($_POST['haslo'])) {
    /* Próba liczy się przed sprawdzeniem hasła, żeby równoległe żądania nie przeszły limitu.
       Przy ataku z wielu adresów adres bez nieudanych prób ma jedną szansę, więc właściciel nadal wejdzie. */
    $blokada = proby_logowania(function (array &$proby, string $kto) {
        $moje = count($proby[$kto] ?? []);
        if ($moje >= PROBY_NA_ADRES || ($moje > 0 && array_sum(array_map('count', $proby)) >= PROBY_LACZNIE)) { return true; }
        $proby[$kto][] = time();
        return false;
    });
    if ($blokada) {
        http_response_code(429);
        header('Retry-After: ' . OKNO_LOGOWANIA);
        $blad_logowania = 'Za dużo nieudanych prób. Spróbuj ponownie za 15 minut.';
    } elseif (haslo_poprawne($_POST['haslo'])) {
        proby_logowania(function (array &$proby, string $kto) { unset($proby[$kto]); });
        session_regenerate_id(true);
        $_SESSION['zalogowany'] = true;
        $_SESSION['aktywnosc'] = time();
        wroc(ankieta_klucz());
    } else {
        $blad_logowania = 'Złe hasło.';
    }
}

/* Pierwsze uruchomienie albo hasło domyślne: generator wiersza do konfiguracja.php. */
$nowy_hash = '';
if (isset($_POST['nowe_haslo']) && is_string($_POST['nowe_haslo'])
    && (!haslo_ustawione() || (!empty($_SESSION['zalogowany']) && hash_equals($token, (string)($_POST['token'] ?? ''))))) {
    if (dlugosc($_POST['nowe_haslo']) >= 12) {
        $nowy_hash = password_hash($_POST['nowe_haslo'], PASSWORD_DEFAULT);
    } else {
        $blad_hasla = 'Hasło musi mieć co najmniej 12 znaków.';
    }
}

if (isset($_GET['wyloguj'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: admin.php');
    exit;
}

$zalogowany = !empty($_SESSION['zalogowany']);
$klucz = ankieta_klucz();
$info = $_SESSION['info'] ?? '';
unset($_SESSION['info']);

/* --- Eksport CSV -------------------------------------------------------- */
if ($zalogowany && isset($_GET['csv'])) {
    $stan = czytaj_stan($klucz);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="ankieta-' . $klucz . '-' . date('Y-m-d') . '.csv"');
    $wy = fopen('php://output', 'w');
    fwrite($wy, "\xEF\xBB\xBF"); // BOM, żeby Excel poprawnie pokazał polskie znaki
    $tryb = $_GET['csv'] === 'slowa' ? 'slowa' : 'odpowiedzi';
    if ($tryb === 'slowa') {
        fputcsv($wy, ['słowo', 'liczba', 'ukryte'], ';');
        foreach (policz($stan, true) as $w) { fputcsv($wy, [$w['w'], $w['n'], $w['ukryte'] ? 'tak' : ''], ';'); }
    } else {
        fputcsv($wy, ['data i godzina', 'słowa'], ';');
        foreach ($stan['odpowiedzi'] as $o) { fputcsv($wy, [date('Y-m-d H:i', $o['t']), implode(', ', $o['s'])], ';'); }
    }
    exit;
}

/* --- Akcje ---------------------------------------------------------------- */
if ($zalogowany && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['akcja'])) {
    if (!hash_equals($token, (string)($_POST['token'] ?? ''))) { wroc($klucz, 'Sesja wygasła, spróbuj ponownie.'); }
    $_SESSION['aktywnosc'] = time();
    $akcja = (string)$_POST['akcja'];
    $slowo = normalizuj((string)($_POST['slowo'] ?? ''));
    $cel   = normalizuj((string)($_POST['cel'] ?? ''));
    $info  = '';

    zmien_stan($klucz, function (array &$stan) use ($akcja, $slowo, $cel, $klucz, &$info) {
        if ($akcja === 'ukryj' && $slowo !== '') {
            if (!in_array($slowo, $stan['ukryte'], true)) { $stan['ukryte'][] = $slowo; }
            $info = 'Ukryto: ' . $slowo;
        } elseif ($akcja === 'pokaz') {
            $stan['ukryte'] = array_values(array_diff($stan['ukryte'], [$slowo]));
            $info = 'Przywrócono: ' . $slowo;
        } elseif ($akcja === 'scal' && $slowo !== '' && $cel !== '' && $slowo !== $cel) {
            $stan['scal'][$slowo] = $cel;
            $info = 'Scalono „' . $slowo . '” z „' . $cel . '”';
        } elseif ($akcja === 'rozdziel') {
            unset($stan['scal'][$slowo]);
            $info = 'Cofnięto scalenie: ' . $slowo;
        } elseif ($akcja === 'status') {
            $stan['otwarta'] = !empty($_POST['otwarta']);
            $info = $stan['otwarta'] ? 'Ankieta otwarta.' : 'Ankieta zamknięta.';
        } elseif ($akcja === 'odblokuj') {
            $stan['limity'] = [];
            $info = 'Limity wysyłek wyzerowane.';
        } elseif ($akcja === 'usun-ostatnie') {
            $minuty = max(1, min(1440, (int)($_POST['minuty'] ?? 0)));
            $granica = time() - $minuty * 60;
            $przed = count($stan['odpowiedzi']);
            $stan['odpowiedzi'] = array_values(array_filter($stan['odpowiedzi'], function ($o) use ($granica) { return $o['t'] < $granica; }));
            $info = 'Usunięto odpowiedzi z ostatnich ' . $minuty . ' min: ' . ($przed - count($stan['odpowiedzi'])) . '.';
        } elseif ($akcja === 'wyczysc') {
            if (($_POST['potwierdz'] ?? '') === $klucz) {
                $stan['odpowiedzi'] = []; $stan['ukryte'] = []; $stan['scal'] = []; $stan['limity'] = []; $stan['etykiety'] = [];
                $stan['runda'] = bin2hex(random_bytes(4)); // przeglądarki znów pokażą formularz
                $info = 'Wyniki wyczyszczone.';
            } else {
                $info = 'Nie wyczyszczono: wpisz klucz ankiety, żeby potwierdzić.';
            }
        }
    });
    wroc($klucz, $info);
}

$stan = $zalogowany ? czytaj_stan($klucz) : pusty_stan();
$slowa = $zalogowany ? policz($stan, true) : [];
$pokazane = array_slice($slowa, 0, 500); // przy zalewie spamem panel musi się dalej otwierać
?><!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Panel ankiety</title>
<link rel="stylesheet" href="zasoby/ankieta.css">
</head>
<body class="panel">

<header class="pasek">
  <a class="marka" href="admin.php"><img src="zasoby/logo-bs.png" alt="" width="28" height="28"><span>Panel ankiet</span></a>
  <?php if ($zalogowany): ?><a class="bs-eyebrow" href="admin.php?wyloguj=1">Wyloguj</a><?php endif; ?>
</header>

<main class="panel-tresc">
<?php if (!$zalogowany && !haslo_ustawione()): ?>
  <form method="post" class="logowanie">
    <h1 class="bs-h3">Ustaw hasło do panelu</h1>
    <?php if ($nowy_hash !== ''): ?>
      <p class="bs-small">W pliku <code>konfiguracja.php</code> usuń linię z <code>ADMIN_HASLO</code> i wpisz tę poniżej. Potem odśwież stronę.</p>
      <pre class="kod">const ADMIN_HASLO_HASH = '<?= e($nowy_hash) ?>';</pre>
    <?php else: ?>
      <p class="bs-small">Hasło domyślne nie otwiera panelu. Wpisz nowe, co najmniej 12 znaków, a panel pokaże wiersz do wklejenia.</p>
      <label class="pole pole-pelne"><input type="password" name="nowe_haslo" placeholder="Nowe hasło" minlength="12" autofocus required></label>
      <?php if (!empty($blad_hasla)): ?><p class="komunikat"><?= e($blad_hasla) ?></p><?php endif; ?>
      <button class="przycisk" type="submit">Generuj</button>
    <?php endif; ?>
  </form>
<?php elseif (!$zalogowany): ?>
  <form method="post" class="logowanie">
    <h1 class="bs-h3">Panel ankiet</h1>
    <label class="pole pole-pelne"><input type="password" name="haslo" placeholder="Hasło" autofocus required></label>
    <?php if (!empty($blad_logowania)): ?><p class="komunikat"><?= e($blad_logowania) ?></p><?php endif; ?>
    <button class="przycisk" type="submit">Zaloguj</button>
  </form>
<?php else: ?>

  <?php if ($info !== ''): ?><p class="info"><?= e($info) ?></p><?php endif; ?>


  <nav class="zakladki" aria-label="Ankiety">
    <?php foreach (ANKIETY as $k => $a): ?>
      <a href="admin.php?a=<?= e(rawurlencode($k)) ?>"<?= $k === $klucz ? ' aria-current="page"' : '' ?>><?= e($k) ?></a>
    <?php endforeach; ?>
  </nav>

  <section class="panel-karta">
    <p class="bs-eyebrow">Ankieta „<?= e($klucz) ?>”</p>
    <h1 class="bs-h3"><?= e(ANKIETY[$klucz]['pytanie']) ?></h1>
    <p class="bs-small"><?= count($stan['odpowiedzi']) ?> odpowiedzi · <?= count($slowa) ?> różnych słów · <?= count($stan['ukryte']) ?> ukrytych</p>

    <div class="panel-akcje">
      <form method="post">
        <input type="hidden" name="token" value="<?= e($token) ?>">
        <input type="hidden" name="a" value="<?= e($klucz) ?>">
        <input type="hidden" name="akcja" value="status">
        <?php if (czy_otwarta($klucz, $stan)): ?>
          <button class="przycisk przycisk-cichy" type="submit">Zamknij ankietę</button>
        <?php else: ?>
          <input type="hidden" name="otwarta" value="1">
          <button class="przycisk" type="submit">Otwórz ankietę</button>
        <?php endif; ?>
      </form>
      <a class="przycisk przycisk-cichy" href="./?a=<?= e(rawurlencode($klucz)) ?>" target="_blank" rel="noopener">Formularz</a>
      <a class="przycisk przycisk-cichy" href="ekran.php?a=<?= e(rawurlencode($klucz)) ?>" target="_blank" rel="noopener">Ekran na rzutnik</a>
      <a class="przycisk przycisk-cichy" href="admin.php?a=<?= e(rawurlencode($klucz)) ?>&amp;csv=odpowiedzi">CSV odpowiedzi</a>
      <a class="przycisk przycisk-cichy" href="admin.php?a=<?= e(rawurlencode($klucz)) ?>&amp;csv=slowa">CSV słów</a>
    </div>

    <p class="bs-eyebrow">Adres do rozesłania</p>
    <p class="bs-mono kod"><?= e(adres_ankiety($klucz)) ?></p>
  </section>

  <section class="panel-karta">
    <h2 class="bs-eyebrow">Słowa</h2>
    <?php if (!$slowa): ?>
      <p class="bs-small">Jeszcze nikt nie odpowiedział.</p>
    <?php else: ?>
    <datalist id="lista-celow">
      <?php foreach ($pokazane as $w): ?><option value="<?= e($w['w']) ?>"><?php endforeach; ?>
    </datalist>
    <table class="tabela">
      <thead><tr><th>Słowo</th><th class="liczba">Ile</th><th>Ukryj</th><th>Scal z innym słowem</th></tr></thead>
      <tbody>
      <?php foreach ($pokazane as $w): ?>
        <tr class="<?= $w['ukryte'] ? 'ukryty' : '' ?>">
          <td><?= e($w['w']) ?></td>
          <td class="liczba bs-mono"><?= (int)$w['n'] ?></td>
          <td>
            <form method="post">
              <input type="hidden" name="token" value="<?= e($token) ?>">
              <input type="hidden" name="a" value="<?= e($klucz) ?>">
              <input type="hidden" name="slowo" value="<?= e($w['w']) ?>">
              <input type="hidden" name="akcja" value="<?= $w['ukryte'] ? 'pokaz' : 'ukryj' ?>">
              <button class="link" type="submit"><?= $w['ukryte'] ? 'Przywróć' : 'Ukryj' ?></button>
            </form>
          </td>
          <td>
            <form method="post" class="scal">
              <input type="hidden" name="token" value="<?= e($token) ?>">
              <input type="hidden" name="a" value="<?= e($klucz) ?>">
              <input type="hidden" name="slowo" value="<?= e($w['w']) ?>">
              <input type="hidden" name="akcja" value="scal">
              <input type="text" name="cel" list="lista-celow" placeholder="np. automatyzacja" aria-label="Scal „<?= e($w['w']) ?>” z">
              <button class="link" type="submit">Scal</button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <?php if (count($slowa) > count($pokazane)): ?>
      <p class="bs-small">Pokazuję <?= count($pokazane) ?> najczęstszych z <?= count($slowa) ?> słów. Wszystkie są w pliku „CSV słów”.</p>
    <?php endif; ?>
    <?php endif; ?>
  </section>

  <?php if ($stan['scal']): ?>
  <section class="panel-karta">
    <h2 class="bs-eyebrow">Scalenia</h2>
    <table class="tabela">
      <tbody>
      <?php foreach ($stan['scal'] as $z => $do): ?>
        <tr>
          <td><?= e((string)$z) ?> → <?= e((string)$do) ?></td>
          <td>
            <form method="post">
              <input type="hidden" name="token" value="<?= e($token) ?>">
              <input type="hidden" name="a" value="<?= e($klucz) ?>">
              <input type="hidden" name="slowo" value="<?= e((string)$z) ?>">
              <input type="hidden" name="akcja" value="rozdziel">
              <button class="link" type="submit">Cofnij</button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </section>
  <?php endif; ?>

  <section class="panel-karta">
    <h2 class="bs-eyebrow">Osadzenie na stronie</h2>
    <p class="bs-small">Wklej w dowolne miejsce strony. Ramka sama dopasuje wysokość do chmury.</p>
<pre class="kod"><?= e('<iframe src="' . katalog_aplikacji() . '/?a=' . $klucz . '&osadz=1" title="Ankieta" style="width:100%;border:0;min-height:480px" data-ankieta="' . $klucz . '"></iframe>
<script>
addEventListener("message", function (e) {
  if (e.origin !== location.origin || !e.data || e.data.typ !== "ankieta-wysokosc") return;
  var f = document.querySelector("iframe[data-ankieta=\"" + e.data.ankieta + "\"]");
  if (f) f.style.height = e.data.h + "px";
});
</script>') ?></pre>
  </section>

  <section class="panel-karta">
    <h2 class="bs-eyebrow">Gdy ktoś zalewa ankietę</h2>
    <p class="bs-small">Wyzeruj limity, jeśli wspólna sieć sali trafiła na blokadę. Usuń odpowiedzi z ostatnich minut, żeby pozbyć się serii spamu bez kasowania całej ankiety.</p>
    <div class="panel-akcje">
      <form method="post">
        <input type="hidden" name="token" value="<?= e($token) ?>">
        <input type="hidden" name="a" value="<?= e($klucz) ?>">
        <input type="hidden" name="akcja" value="odblokuj">
        <button class="przycisk przycisk-cichy" type="submit">Wyzeruj limity wysyłek</button>
      </form>
    </div>
    <form method="post" class="wyczysc">
      <input type="hidden" name="token" value="<?= e($token) ?>">
      <input type="hidden" name="a" value="<?= e($klucz) ?>">
      <input type="hidden" name="akcja" value="usun-ostatnie">
      <label class="pole"><input type="number" name="minuty" min="1" max="1440" value="10" aria-label="Liczba minut"></label>
      <button class="przycisk przycisk-cichy" type="submit">Usuń odpowiedzi z ostatnich minut</button>
    </form>
  </section>

  <section class="panel-karta">
    <h2 class="bs-eyebrow">Hasło do panelu</h2>
    <?php if ($nowy_hash !== ''): ?>
      <p class="bs-small">W pliku <code>konfiguracja.php</code> usuń dotychczasową linię z hasłem i wpisz tę poniżej. Pokazuję ją tylko raz.</p>
      <pre class="kod">const ADMIN_HASLO_HASH = '<?= e($nowy_hash) ?>';</pre>
    <?php else: ?>
      <?php if (!haslo_jako_hash()): ?>
        <p class="ostrzezenie">Hasło leży w pliku konfiguracja.php jawnym tekstem. Wpisz nowe, a panel pokaże jego skrót do wklejenia.</p>
      <?php else: ?>
        <p class="bs-small">Żeby zmienić hasło, wpisz nowe. Panel pokaże jego skrót do wklejenia w <code>konfiguracja.php</code>.</p>
      <?php endif; ?>
      <?php if (!empty($blad_hasla)): ?><p class="komunikat"><?= e($blad_hasla) ?></p><?php endif; ?>
      <form method="post" class="wyczysc">
        <input type="hidden" name="token" value="<?= e($token) ?>">
        <input type="hidden" name="a" value="<?= e($klucz) ?>">
        <label class="pole"><input type="password" name="nowe_haslo" placeholder="Nowe hasło, min. 12 znaków" minlength="12" required autocomplete="new-password"></label>
        <button class="przycisk przycisk-cichy" type="submit">Generuj</button>
      </form>
    <?php endif; ?>
  </section>

  <section class="panel-karta">
    <h2 class="bs-eyebrow">Wyczyść wyniki</h2>
    <form method="post" class="wyczysc">
      <input type="hidden" name="token" value="<?= e($token) ?>">
      <input type="hidden" name="a" value="<?= e($klucz) ?>">
      <input type="hidden" name="akcja" value="wyczysc">
      <label class="pole"><input type="text" name="potwierdz" placeholder="Wpisz: <?= e($klucz) ?>"></label>
      <button class="przycisk przycisk-cichy" type="submit">Usuń wszystkie odpowiedzi</button>
    </form>
  </section>

<?php endif; ?>
</main>
</body>
</html>
