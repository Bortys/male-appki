<?php
/* =========================================================================
   PRZYBORNIK · funkcje wspólne: konfiguracja, opcjonalne logowanie, nagłówki.
   Bez pliku konfiguracja.php (albo bez hasła w nim) strona jest otwarta.
   Plik nie jest dostępny z zewnątrz (.htaccess). Zgodny z PHP 8.1–8.4.
   ========================================================================= */
declare(strict_types=1);

const WERSJA = '1.4.0';
const CIASTECZKO = 'przybornik';
const WAZNOSC_SESJI = 30 * 86400;      // logowanie pamiętane 30 dni
const PROBY_OKNO = 900;                // 15 minut
const PROBY_NA_ADRES = 5;
const PROBY_LACZNIE = 50;
const DOMYSLNY_LIMIT_NA_ADRES = 400;   // żądań API na godzinę z jednego adresu (LIMIT_NA_ADRES w konfiguracji)
const DOMYSLNY_LIMIT_LACZNIE = 3000;   // żądań API na godzinę łącznie (LIMIT_LACZNIE w konfiguracji)

if (is_file(__DIR__ . '/konfiguracja.php')) {
    require __DIR__ . '/konfiguracja.php';
}

function ustawienie(string $nazwa, $domyslnie) {
    return defined($nazwa) ? constant($nazwa) : $domyslnie;
}

function e(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function czy_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function katalog_aplikacji(): string {
    return rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
}

/* --- Nagłówki ------------------------------------------------------------ */

function polityka_csp(): string {
    // wasm-unsafe-eval: Ghostscript, Tesseract i pdf.js działają jako WebAssembly.
    // blob: wyniki pracy (podglądy, pliki do pobrania) żyją tylko w przeglądarce.
    return "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; "
        . "img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob: data:; "
        . "style-src 'self'; font-src 'self' data: blob:; object-src 'none'; "
        . "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
}

function naglowki_bezpieczenstwa(): void {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store');
    header('Content-Security-Policy: ' . polityka_csp());
}

/* --- Logowanie (opcjonalne) ------------------------------------------------
   Hasło jest wyłączone, dopóki w konfiguracja.php nie ma HASLO_HASH i SEKRET.
   Sesja to podpisane ciasteczko (termin ważności + HMAC), bez plików sesji
   na serwerze: hosting kasuje je po kilkudziesięciu minutach bezczynności.
   Zmiana hasła albo sekretu unieważnia wszystkie ciasteczka.
   ------------------------------------------------------------------------- */

/** Czy strona jest zamknięta hasłem. */
function skonfigurowane(): bool {
    $hash = (string) ustawienie('HASLO_HASH', '');
    $sekret = (string) ustawienie('SEKRET', '');
    return $hash !== '' && strlen($sekret) >= 32;
}

function klucz_podpisu(): string {
    return hash('sha256', ustawienie('SEKRET', '') . '|' . ustawienie('HASLO_HASH', ''), true);
}

function podpis(string $tresc): string {
    return hash_hmac('sha256', $tresc, klucz_podpisu());
}

/** Zwraca termin ważności z poprawnego ciasteczka albo 0. */
function termin_sesji(): int {
    if (!skonfigurowane()) { return 0; }
    $c = (string) ($_COOKIE[CIASTECZKO] ?? '');
    if (!preg_match('/^(\d{10})\.([0-9a-f]{64})$/', $c, $m)) { return 0; }
    $termin = (int) $m[1];
    if ($termin < time()) { return 0; }
    return hash_equals(podpis('sesja|' . $termin), $m[2]) ? $termin : 0;
}

function zalogowany(): bool {
    return termin_sesji() > 0;
}

/** Czy bieżący gość może korzystać z narzędzi: zawsze w trybie otwartym, po zalogowaniu w trybie z hasłem. */
function dostep(): bool {
    return !skonfigurowane() || zalogowany();
}

function ustaw_ciasteczko(string $wartosc, int $wygasa): void {
    setcookie(CIASTECZKO, $wartosc, [
        'expires' => $wygasa,
        'path' => katalog_aplikacji() . '/',
        'secure' => czy_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function zaloguj(): int {
    $termin = time() + WAZNOSC_SESJI;
    $wartosc = $termin . '.' . podpis('sesja|' . $termin);
    ustaw_ciasteczko($wartosc, $termin);
    $_COOKIE[CIASTECZKO] = $wartosc;
    return $termin;
}

function wyloguj(): void {
    ustaw_ciasteczko('', time() - 86400);
    unset($_COOKIE[CIASTECZKO]);
}

/**
 * Żeton do żądań API. W trybie z hasłem związany z bieżącym ciasteczkiem. W trybie otwartym
 * to stałe słowo: sam wymóg własnego nagłówka wystarcza, żeby obca strona nie mogła
 * wysłać żądania z cudzej przeglądarki (przeglądarka zablokuje je bez zgody CORS).
 */
function zeton(): string {
    return skonfigurowane() ? podpis('zeton|' . termin_sesji()) : 'otwarte';
}

function zeton_poprawny(string $podany): bool {
    if (!skonfigurowane()) { return $podany !== ''; }
    return zalogowany() && $podany !== '' && hash_equals(zeton(), $podany);
}

/** Żądanie wysłane z innej witryny (nagłówki Sec-Fetch-Site i Origin ustawia przeglądarka). */
function obce_zrodlo(): bool {
    $miejsce = (string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
    if ($miejsce !== '' && $miejsce !== 'same-origin' && $miejsce !== 'none') { return true; }
    $zrodlo = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($zrodlo === '') { return false; }
    $host = (string) parse_url($zrodlo, PHP_URL_HOST);
    $port = parse_url($zrodlo, PHP_URL_PORT);
    $nasz = (string) ($_SERVER['HTTP_HOST'] ?? '');
    return strcasecmp($host . ($port ? ':' . $port : ''), $nasz) !== 0 && strcasecmp($host, $nasz) !== 0;
}

/* --- Limit prób logowania --------------------------------------------------
   Plik dane/proby.json.php: skrót adresu => lista czasów nieudanych prób.
   ------------------------------------------------------------------------- */

function plik_prob(): string {
    return __DIR__ . '/dane/proby.json.php';
}

/** Skrót adresu IP zmieniany codziennie; sam adres nigdzie nie jest zapisywany. */
function skrot_adresu(): string {
    return substr(hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '?') . '|' . gmdate('Y-m-d'), klucz_podpisu()), 0, 16);
}

/** Otwiera plik prób z blokadą i woła $zmiana(array &$proby). Zwraca wynik $zmiana. */
function zmien_proby(callable $zmiana) {
    $plik = plik_prob();
    $uchwyt = @fopen($plik, 'c+');
    if ($uchwyt === false) { $proby = []; return $zmiana($proby); }
    flock($uchwyt, LOCK_EX);
    $tresc = stream_get_contents($uchwyt);
    $json = $tresc === false ? '' : (string) preg_replace('/^<\?php[^\n]*\n/', '', $tresc);
    $proby = json_decode($json, true);
    if (!is_array($proby)) { $proby = []; }
    $od = time() - PROBY_OKNO;
    foreach ($proby as $kto => $czasy) {
        $czasy = array_values(array_filter((array) $czasy, static function ($t) use ($od) { return $t > $od; }));
        if ($czasy) { $proby[$kto] = $czasy; } else { unset($proby[$kto]); }
    }
    $wynik = $zmiana($proby);
    ftruncate($uchwyt, 0);
    rewind($uchwyt);
    fwrite($uchwyt, "<?php http_response_code(404); exit; ?>\n" . json_encode($proby));
    fflush($uchwyt);
    flock($uchwyt, LOCK_UN);
    fclose($uchwyt);
    return $wynik;
}

function logowanie_zablokowane(): bool {
    return (bool) zmien_proby(static function (array &$proby) {
        $moje = count($proby[skrot_adresu()] ?? []);
        $wszystkie = array_sum(array_map('count', $proby));
        return $moje >= PROBY_NA_ADRES || $wszystkie >= PROBY_LACZNIE;
    });
}

function zapisz_nieudana_probe(): void {
    zmien_proby(static function (array &$proby) {
        $proby[skrot_adresu()][] = time();
        return null;
    });
}

function wyczysc_proby_adresu(): void {
    zmien_proby(static function (array &$proby) {
        unset($proby[skrot_adresu()]);
        return null;
    });
}

/* --- Limit żądań API ---------------------------------------------------------
   Strona bez hasła nie może dać się zamęczyć: obróbka zdjęć kosztuje procesor.
   Plik dane/limity.json.php: bieżąca godzina, licznik łączny i liczniki adresów.
   Bez prawa zapisu do dane/ limit po prostu nie działa.
   ------------------------------------------------------------------------- */

/** Zlicza żądanie. Zwraca false, gdy adres albo cała strona przekroczyły limit godzinowy. */
function limit_zadan(): bool {
    $uchwyt = @fopen(__DIR__ . '/dane/limity.json.php', 'c+');
    if ($uchwyt === false) { return true; }
    flock($uchwyt, LOCK_EX);
    $tresc = stream_get_contents($uchwyt);
    $stan = json_decode($tresc === false ? '' : (string) preg_replace('/^<\?php[^\n]*\n/', '', $tresc), true);
    $godzina = intdiv(time(), 3600);
    if (!is_array($stan) || ($stan['g'] ?? 0) !== $godzina) {
        $stan = ['g' => $godzina, 'w' => 0, 'a' => []];
    }
    $kto = skrot_adresu();
    $na_adres = (int) ustawienie('LIMIT_NA_ADRES', DOMYSLNY_LIMIT_NA_ADRES);
    $lacznie = (int) ustawienie('LIMIT_LACZNIE', DOMYSLNY_LIMIT_LACZNIE);
    $wolno = ($stan['a'][$kto] ?? 0) < $na_adres && $stan['w'] < $lacznie;
    if ($wolno) {
        $stan['a'][$kto] = ($stan['a'][$kto] ?? 0) + 1;
        $stan['w']++;
        ftruncate($uchwyt, 0);
        rewind($uchwyt);
        fwrite($uchwyt, "<?php http_response_code(404); exit; ?>\n" . json_encode($stan));
        fflush($uchwyt);
    }
    flock($uchwyt, LOCK_UN);
    fclose($uchwyt);
    return $wolno;
}

/* --- Lista narzędzi (nawigacja i sekcje strony) -------------------------- */

function narzedzia(): array {
    return [
        'Zdjęcia' => [
            'sciskacz'   => ['Ściskacz', 'Zmniejsza zdjęcia do zadanego rozmiaru pliku. Czyta też HEIC z iPhone\'a.'],
            'kadrownik'  => ['Kadrownik', 'Jedno zdjęcie, komplet formatów na wszystkie kanały.'],
            'zrzut'      => ['Ładny zrzut', 'Zrzut ekranu jako grafika do wpisu: tło, margines, cień, zamazane pola.'],
        ],
        'PDF' => [
            'odchudzacz' => ['Odchudzacz PDF', 'Zmniejsza plik PDF. Tekst zostaje tekstem.'],
            'stol'       => ['Stół montażowy', 'Łączenie, dzielenie, kolejność, obrót i usuwanie stron.'],
            'karuzela'   => ['Karuzela', 'PDF albo grafiki jako strony do karuzeli na LinkedIn i Instagram.'],
            'ocr'        => ['PDF z tekstem', 'Zdjęcia kartek i skany jako PDF, w którym działa wyszukiwanie.'],
        ],
        'Wideo i inne' => [
            'wideo'      => ['Pion do sociali', 'Film w formacie 9:16, 1:1 albo 4:5, przycięty i zmieszczony w limicie.'],
            'mp3'        => ['MP4 do MP3', 'Wyciąga dźwięk z filmu do pliku MP3. Kilka filmów naraz.'],
            'czysciciel' => ['Czyściciel', 'Usuwa metadane ze zdjęć, PDF-ów i plików Office.'],
            'qr'         => ['QR z logo', 'Kod QR w kolorach marki, jako PNG i SVG.'],
            'wpis'       => ['Podgląd wpisu', 'Pokazuje, gdzie LinkedIn utnie wpis na „…więcej” i ile znaków policzy X.'],
        ],
        'Moje aplikacje' => [
            'chmura'     => ['Chmura słów', 'Ankieta, której odpowiedzi rosną na żywo w chmurę słów. Z widokiem na rzutnik i kodem QR.'],
            'skracacz'   => ['Skracacz linków', 'Krótkie linki z własnej domeny, ze statystykami dziennymi i API.'],
        ],
    ];
}

/**
 * Osobne aplikacje, do których Przybornik prowadzi odnośnikami (każda ma własny panel
 * i własne hasło). Klucz to identyfikator narzędzia z narzedzia(). Stała APLIKACJE
 * w konfiguracja.php zastępuje tę listę, np. przy instalacji pod inną domeną.
 * Każdy wpis: [etykieta, adres, opis].
 */
function aplikacje(): array {
    return (array) ustawienie('APLIKACJE', [
        'chmura' => [
            ['Formularz z chmurą', 'https://sokolinski.com/chmura/', 'Strona, na której ludzie wpisują słowa i widzą chmurę.'],
            ['Rzutnik', 'https://sokolinski.com/chmura/ekran.php', 'Pełny ekran z kodem QR do formularza. Klawisz F włącza pełny ekran.'],
            ['Rzutnik ciemny', 'https://sokolinski.com/chmura/ekran.php?ciemny=1', 'To samo na ciemnym tle, do jasnych sal.'],
            ['Panel', 'https://sokolinski.com/chmura/admin.php', 'Ankiety, ukrywanie i scalanie słów, eksport CSV. Wymaga hasła.'],
        ],
        'skracacz' => [
            ['Panel', 'https://go.sokolinski.com/admin', 'Skracanie, własne aliasy, notatki, statystyki z 60 dni. Wymaga hasła.'],
        ],
    ]);
}
