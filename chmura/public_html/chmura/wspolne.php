<?php
/* Funkcje wspólne: odczyt i zapis danych, normalizacja słów, liczenie chmury.
   Nie wymaga bazy danych – każda ankieta to jeden plik w katalogu dane/. */

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

ini_set('display_errors', '0');
date_default_timezone_set('Europe/Warsaw');

require __DIR__ . '/konfiguracja.php';

const KATALOG_DANYCH = __DIR__ . '/dane';
const NAGLOWEK_PLIKU = "<?php exit; ?>\n"; // plik danych nie wyświetli się nawet bez .htaccess

/* Ustawienia dodane później: starsza konfiguracja.php na serwerze ich nie ma. */
function ustawienie(string $nazwa, $domyslnie) {
    return defined($nazwa) ? constant($nazwa) : $domyslnie;
}

function ankieta_klucz(): string {
    $klucz = $_GET['a'] ?? $_POST['a'] ?? '';
    if (!is_string($klucz) || $klucz === '' || !isset(ANKIETY[$klucz])) {
        $klucz = array_key_first_compat(ANKIETY);
    }
    return $klucz;
}

function array_key_first_compat(array $t) {
    foreach ($t as $k => $_) { return $k; }
    return null;
}

function sciezka_danych(string $klucz): string {
    return KATALOG_DANYCH . '/' . preg_replace('/[^a-z0-9\-_]/i', '', $klucz) . '.json.php';
}

function pusty_stan(): array {
    return ['odpowiedzi' => [], 'ukryte' => [], 'scal' => [], 'otwarta' => null, 'limity' => [], 'etykiety' => [], 'runda' => '0'];
}

function czytaj_stan(string $klucz): array {
    $plik = sciezka_danych($klucz);
    if (!is_file($plik)) { return pusty_stan(); }
    $tresc = (string)@file_get_contents($plik);
    return dekoduj_stan($tresc);
}

function bez_naglowka(string $tresc): string {
    return strpos($tresc, NAGLOWEK_PLIKU) === 0 ? substr($tresc, strlen(NAGLOWEK_PLIKU)) : $tresc;
}

function dekoduj_stan(string $tresc): array {
    $stan = json_decode(bez_naglowka($tresc), true);
    return is_array($stan) ? array_merge(pusty_stan(), $stan) : pusty_stan();
}

/* Odczyt, zmiana i zapis pod blokadą, żeby dwie osoby wysyłające w tej samej sekundzie
   nie nadpisały sobie danych. Zapis idzie przez plik tymczasowy i rename: czytelnik
   widzi stary albo nowy stan, nigdy pusty czy urwany plik. */
function zmien_plik(string $plik, callable $zmiana) {
    if (!is_dir(KATALOG_DANYCH)) { @mkdir(KATALOG_DANYCH, 0755, true); }
    $blokada = @fopen($plik . '.blokada', 'c');
    if (!$blokada) { throw new RuntimeException('Brak zapisu w katalogu dane/.'); }
    flock($blokada, LOCK_EX);
    try {
        $tresc = is_file($plik) ? (string)file_get_contents($plik) : '';
        $dane = json_decode(bez_naglowka($tresc), true);
        if ($tresc !== '' && !is_array($dane)) { // nie nadpisuj danych, których nie umiemy przeczytać
            throw new RuntimeException('Uszkodzony plik danych: ' . basename($plik));
        }
        $dane = is_array($dane) ? $dane : [];
        $wynik = $zmiana($dane);
        $nowa = NAGLOWEK_PLIKU . json_encode($dane, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if ($nowa !== $tresc) { // odrzucona wysyłka nie przepisuje całego pliku
            $tymczasowy = $plik . '.' . bin2hex(random_bytes(4)) . '.tmp';
            if (file_put_contents($tymczasowy, $nowa) !== strlen($nowa) || !rename($tymczasowy, $plik)) {
                @unlink($tymczasowy);
                throw new RuntimeException('Nie udało się zapisać: ' . basename($plik));
            }
        }
        return $wynik;
    } finally {
        flock($blokada, LOCK_UN);
        fclose($blokada);
    }
}

function zmien_stan(string $klucz, callable $zmiana) {
    return zmien_plik(sciezka_danych($klucz), function (array &$dane) use ($zmiana) {
        $dane = array_merge(pusty_stan(), $dane);
        return $zmiana($dane);
    });
}

function wyczysc_limity(array &$stan, int $teraz): void {
    foreach ($stan['limity'] as $k => $czasy) {
        $czasy = array_values(array_filter($czasy, function ($t) use ($teraz) { return $t > $teraz - 3600; }));
        if ($czasy) { $stan['limity'][$k] = $czasy; } else { unset($stan['limity'][$k]); }
    }
}

function sa_stare_limity(array $stan, int $teraz): bool {
    foreach ($stan['limity'] as $czasy) {
        foreach ($czasy as $t) {
            if ($t <= $teraz - 3600) { return true; }
        }
    }
    return false;
}

/* Skróty adresów nie leżą dłużej niż trzeba, także gdy nikt już nic nie wysyła. */
function posprzataj_limity(string $klucz, array $stan): void {
    if (!sa_stare_limity($stan, time())) { return; }
    try {
        zmien_stan($klucz, function (array &$s) { wyczysc_limity($s, time()); });
    } catch (Throwable $e) {
        error_log('chmura: ' . $e->getMessage());
    }
}

function czy_otwarta(string $klucz, array $stan): bool {
    if ($stan['otwarta'] !== null) { return (bool)$stan['otwarta']; }
    return !empty(ANKIETY[$klucz]['otwarta']);
}

function male(string $s): string {
    return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
}

function dlugosc(string $s): int {
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

/* „  Sztuczna   Inteligencja!! ” → „sztuczna inteligencja” */
function normalizuj(string $s): string {
    $s = male(trim($s));
    $s = preg_replace('/[^\p{L}\p{N}\s\-\'’]/u', ' ', $s);
    $s = preg_replace('/\s+/u', ' ', (string)$s);
    $s = trim((string)$s, " -'’");
    if (dlugosc($s) > MAKS_DLUGOSC) {
        $s = function_exists('mb_substr') ? mb_substr($s, 0, MAKS_DLUGOSC, 'UTF-8') : substr($s, 0, MAKS_DLUGOSC);
        $s = trim($s);
    }
    return $s;
}

/* Zachowuje wielkie litery tylko w nazwach typu „ChatGPT” czy „AI Act”.
   „Automatyzacja” z wielkiej litery na początku zdania wraca do małych. */
function etykieta(string $oryginal, string $klucz): ?string {
    $czysty = preg_replace('/\s+/u', ' ', trim((string)preg_replace('/[^\p{L}\p{N}\s\-\'’]/u', ' ', $oryginal)));
    if (male((string)$czysty) !== $klucz) { return null; }
    $bez_pierwszej = function_exists('mb_substr') ? mb_substr((string)$czysty, 1, null, 'UTF-8') : substr((string)$czysty, 1);
    return preg_match('/\p{Lu}/u', $bez_pierwszej) ? (string)$czysty : null;
}

function bez_ogonkow(string $s): string {
    return strtr($s, ['ą'=>'a','ć'=>'c','ę'=>'e','ł'=>'l','ń'=>'n','ó'=>'o','ś'=>'s','ź'=>'z','ż'=>'z']);
}

/* Krótkie rdzenie liczą się tylko od początku wyrazu. Inaczej „principal” odpada
   przez „cipa”, a „podsłuchuj” przez „chuj”. Dłuższe wpisy łapią też przedrostki. */
function na_czarnej_liscie(string $slowo): bool {
    $proste = bez_ogonkow($slowo);
    foreach (CZARNA_LISTA as $zle) {
        $zle = bez_ogonkow(male($zle));
        if ($zle === '') { continue; }
        $wzor = preg_quote($zle, '/');
        if (dlugosc($zle) < 6) { $wzor = '(?<![\p{L}\p{N}])' . $wzor; }
        if (preg_match('/' . $wzor . '/u', $proste)) { return true; }
    }
    return false;
}

/* Zlicza słowa po scaleniach i ukryciach. Zwraca listę [w => słowo, n => liczba]. */
function policz(array $stan, bool $z_ukrytymi = false): array {
    $licznik = [];
    foreach ($stan['odpowiedzi'] as $o) {
        foreach ($o['s'] as $s) {
            $cel = $s;
            $krok = 0;
            while (isset($stan['scal'][$cel]) && $krok++ < 10) { $cel = $stan['scal'][$cel]; }
            $licznik[$cel] = ($licznik[$cel] ?? 0) + 1;
        }
    }
    $wynik = [];
    foreach ($licznik as $w => $n) {
        $ukryte = in_array((string)$w, $stan['ukryte'], true);
        if ($ukryte && !$z_ukrytymi) { continue; }
        $wiersz = ['w' => (string)$w, 'n' => $n];
        if (!empty($stan['etykiety'][$w])) { $wiersz['e'] = $stan['etykiety'][$w]; }
        if ($z_ukrytymi) { $wiersz['ukryte'] = $ukryte; }
        $wynik[] = $wiersz;
    }
    usort($wynik, function ($a, $b) {
        return $b['n'] <=> $a['n'] ?: strcmp($a['w'], $b['w']);
    });
    return $wynik;
}

function sol(): string {
    $plik = KATALOG_DANYCH . '/_sol.php';
    if (is_file($plik)) { return trim(substr((string)file_get_contents($plik), strlen(NAGLOWEK_PLIKU))); }
    $sol = bin2hex(random_bytes(16));
    @file_put_contents($plik, NAGLOWEK_PLIKU . $sol);
    return $sol;
}

function skrot_ip(): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0';
    // adresu IP nie zapisujemy wprost, a data sprawia, że skrótów z różnych dni nie da się połączyć
    return substr(hash_hmac('sha256', date('Y-m-d') . '|' . $ip, sol()), 0, 16);
}

function czy_https(): bool {
    return !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
}

function katalog_aplikacji(): string {
    return rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
}

/* Ciasteczko do limitu wysyłek: tylko w tym katalogu i tylko po wysłaniu odpowiedzi. */
function id_urzadzenia(): string {
    $id = $_COOKIE['ankieta_u'] ?? '';
    if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/', $id)) {
        $id = bin2hex(random_bytes(16));
    }
    setcookie('ankieta_u', $id, [
        'expires' => time() + 2 * 3600, 'path' => katalog_aplikacji() . '/', 'httponly' => true,
        'samesite' => 'Lax', 'secure' => czy_https(),
    ]);
    return $id;
}

/* Starsza wersja zostawiała u gości roczne ciasteczko na całą domenę. */
function usun_stare_ciasteczko(): void {
    if (isset($_COOKIE['ankieta_id'])) {
        setcookie('ankieta_id', '', ['expires' => 1, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => czy_https()]);
    }
}

/* Żądanie wysłane z innej strony, np. spam z cudzej witryny albo cudze próby logowania. */
function obce_zrodlo(): bool {
    $zrodlo = $_SERVER['HTTP_ORIGIN'] ?? '';
    return $zrodlo !== '' && parse_url($zrodlo, PHP_URL_HOST) !== parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
}

function naglowki_bezpieczenstwa(): void {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
}

function e(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

function adres_ankiety(string $klucz): string {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if (!preg_match('/^[a-z0-9.-]+(:\d+)?$/i', $host)) { $host = 'localhost'; }
    return (czy_https() ? 'https' : 'http') . '://' . $host . katalog_aplikacji() . '/?a=' . rawurlencode($klucz);
}
