<?php
/* API ankiety.
   GET  api.php?a=<klucz>              → pytanie i słowa do chmury (JSON)
   POST api.php  a=<klucz> slowa[]=…   → zapis odpowiedzi, w odpowiedzi nowa chmura */

require __DIR__ . '/wspolne.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function odpowiedz(array $dane, int $kod = 200): void {
    http_response_code($kod);
    echo json_encode($dane, JSON_UNESCAPED_UNICODE);
    exit;
}

function chmura(string $klucz, array $stan): array {
    $slowa = policz($stan);
    $osoby = count($stan['odpowiedzi']);
    return [
        'ankieta'  => $klucz,
        'pytanie'  => ANKIETY[$klucz]['pytanie'],
        'otwarta'  => czy_otwarta($klucz, $stan),
        'osoby'    => $osoby,
        'slowa'    => array_slice($slowa, 0, 150),
        'runda'    => (string)$stan['runda'],
        'wersja'   => substr(md5(json_encode($slowa) . $osoby . $stan['runda']), 0, 10),
    ];
}

$klucz = ankieta_klucz();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stan = czytaj_stan($klucz);
    posprzataj_limity($klucz, $stan);
    odpowiedz(chmura($klucz, $stan));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    odpowiedz(['blad' => 'Nieobsługiwana metoda.'], 405);
}

/* Wysyłać można tylko z tej strony. */
if (obce_zrodlo()) {
    odpowiedz(['blad' => 'Odpowiedź można wysłać tylko ze strony ankiety.'], 403);
}

/* Pułapki na boty: ukryte pole i zbyt szybkie wysłanie formularza. */
if (!empty($_POST['strona_www'])) {
    odpowiedz(['ok' => true] + chmura($klucz, czytaj_stan($klucz)));
}
$start = (int)($_POST['t'] ?? 0);
$uplynelo = time() - $start;
if ($start <= 0 || ($uplynelo >= 0 && $uplynelo < 2)) {
    odpowiedz(['blad' => 'Za szybko. Spróbuj jeszcze raz za chwilę.'], 429);
}

$surowe = $_POST['slowa'] ?? [];
if (!is_array($surowe)) { $surowe = [$surowe]; }

$slowa = [];
$etykiety = [];
$odrzucone = 0;
foreach (array_slice($surowe, 0, SLOW_NA_OSOBE) as $s) {
    if (!is_string($s)) { continue; }
    $n = normalizuj($s);
    if ($n === '' || dlugosc($n) < 2) { continue; }
    if (na_czarnej_liscie($n)) { $odrzucone++; continue; }
    if (!in_array($n, $slowa, true)) {
        $slowa[] = $n;
        $et = etykieta($s, $n);
        if ($et !== null) { $etykiety[$n] = $et; }
    }
}

if (!$slowa) {
    odpowiedz(['blad' => $odrzucone ? 'Tego słowa nie dodam do chmury.' : 'Wpisz przynajmniej jedno słowo.'], 422);
}

$urzadzenie = id_urzadzenia();
$ip = skrot_ip();

try {
    $wynik = zmien_stan($klucz, function (array &$stan) use ($klucz, $slowa, $etykiety, $urzadzenie, $ip) {
        if (!czy_otwarta($klucz, $stan)) { return 'zamknieta'; }
        if (count($stan['odpowiedzi']) >= ustawienie('MAKS_ODPOWIEDZI', 5000)) { return 'pelna'; }

        $teraz = time();
        wyczysc_limity($stan, $teraz);
        $u = 'u:' . $urzadzenie;
        $i = 'i:' . $ip;
        if (count($stan['limity'][$u] ?? []) >= LIMIT_NA_GODZINE) { return 'limit'; }
        if (count($stan['limity'][$i] ?? []) >= ustawienie('LIMIT_NA_SIEC', LIMIT_NA_GODZINE * 30)) { return 'limit-sieci'; }

        $stan['limity'][$u][] = $teraz;
        $stan['limity'][$i][] = $teraz;
        // czas do minuty: dokładna sekunda pozwoliłaby połączyć odpowiedź ze skrótem adresu w limitach
        $stan['odpowiedzi'][] = ['t' => $teraz - $teraz % 60, 's' => $slowa];
        foreach ($etykiety as $k => $et) {
            if (!isset($stan['etykiety'][$k])) { $stan['etykiety'][$k] = $et; }
        }
        return 'ok';
    });
} catch (Throwable $e) {
    error_log('chmura: ' . $e->getMessage());
    odpowiedz(['blad' => 'Nie udało się zapisać odpowiedzi. Spróbuj ponownie.'], 500);
}

if ($wynik === 'zamknieta') { odpowiedz(['blad' => 'Ankieta jest już zamknięta.'], 403); }
if ($wynik === 'pelna') { odpowiedz(['blad' => 'Ankieta zebrała już komplet odpowiedzi.'], 403); }
if ($wynik === 'limit') { odpowiedz(['blad' => 'Ta przeglądarka wysłała już odpowiedź. Dziękuję.'], 429); }
if ($wynik === 'limit-sieci') { odpowiedz(['blad' => 'Z tej sieci przyszło już dużo odpowiedzi. Spróbuj ponownie za jakiś czas.'], 429); }

$stan = czytaj_stan($klucz);
odpowiedz(['ok' => true, 'twoje' => $slowa] + chmura($klucz, $stan));
