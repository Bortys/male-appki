<?php
// Router serwera deweloperskiego (php -S). Naśladuje to, co na produkcji robi .htaccess:
// blokuje pliki pomocnicze i podaje typy MIME, których wbudowany serwer PHP nie zna.
$sciezka = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('~/(wspolne|obrazy|konfiguracja)\.php$|/dane/|\.(md|bak|log)$~', $sciezka)) {
    http_response_code(403);
    exit;
}
$plik = $_SERVER['DOCUMENT_ROOT'] . $sciezka;
if (is_file($plik)) {
    $typy = [
        'mjs' => 'text/javascript', 'wasm' => 'application/wasm', 'gz' => 'application/gzip',
        'ttf' => 'font/ttf', 'pfb' => 'application/octet-stream', 'icc' => 'application/vnd.iccprofile',
    ];
    $roz = strtolower(pathinfo($plik, PATHINFO_EXTENSION));
    if (isset($typy[$roz])) {
        header('Content-Type: ' . $typy[$roz]);
        header('Content-Length: ' . filesize($plik));
        readfile($plik);
        return true;
    }
}
return false;
