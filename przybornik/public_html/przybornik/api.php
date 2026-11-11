<?php
/* =========================================================================
   PRZYBORNIK · API obróbki zdjęć. Tylko POST z własnej strony, z nagłówkiem żetonu
   i w limicie godzinowym; w trybie z hasłem dodatkowo tylko dla zalogowanego.
   Akcje: podglad, sciskaj, kadruj, oczysc. Jeden plik na żądanie, nic nie
   zostaje na serwerze po odpowiedzi.
   ========================================================================= */
declare(strict_types=1);

require __DIR__ . '/wspolne.php';
require __DIR__ . '/obrazy.php';

naglowki_bezpieczenstwa();

function blad(int $kod, string $komunikat): void {
    http_response_code($kod);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['blad' => $komunikat], JSON_UNESCAPED_UNICODE);
    exit;
}

function wyslij(string $dane, string $typ, string $nazwa, array $info): void {
    header('Content-Type: ' . $typ);
    header('Content-Length: ' . strlen($dane));
    header('Content-Disposition: attachment; filename="plik"; filename*=UTF-8\'\'' . rawurlencode($nazwa));
    header('X-Przybornik-Info: ' . base64_encode((string) json_encode($info + ['nazwa' => $nazwa], JSON_UNESCAPED_UNICODE)));
    echo $dane;
    exit;
}

function liczba(string $pole, float $domyslna, float $min, float $max): float {
    $w = $_POST[$pole] ?? null;
    if (!is_string($w) || !is_numeric($w)) { return $domyslna; }
    return max($min, min($max, (float) $w));
}

function wgrany_plik(): array {
    $p = $_FILES['plik'] ?? null;
    if (!is_array($p) || is_array($p['error'] ?? null)) {
        blad(400, 'Brakuje pliku.');
    }
    if ($p['error'] === UPLOAD_ERR_INI_SIZE || $p['error'] === UPLOAD_ERR_FORM_SIZE) {
        blad(413, 'Plik jest za duży dla serwera.');
    }
    if ($p['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($p['tmp_name'])) {
        blad(400, 'Plik nie dotarł w całości. Spróbuj jeszcze raz.');
    }
    $limit = (int) ustawienie('MAKS_PLIK_MB', 100) * 1024 * 1024;
    if ($p['size'] > $limit) {
        blad(413, 'Plik ma ponad ' . (int) ustawienie('MAKS_PLIK_MB', 100) . ' MB.');
    }
    return $p;
}

if (!dostep()) {
    blad(401, 'Sesja wygasła. Odśwież stronę i zaloguj się ponownie.');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    blad(405, 'Tylko POST.');
}
if (obce_zrodlo()) {
    blad(403, 'Żądanie z obcej strony.');
}
if (!zeton_poprawny((string) ($_SERVER['HTTP_X_PRZYBORNIK'] ?? ''))) {
    blad(403, 'Nieważny żeton. Odśwież stronę.');
}
if (!limit_zadan()) {
    blad(429, 'Za dużo żądań w tej godzinie. Spróbuj ponownie później.');
}
if (empty($_FILES) && empty($_POST) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    blad(413, 'Plik jest za duży dla serwera.');
}

if (function_exists('set_time_limit')) { @set_time_limit(90); }

$akcja = (string) ($_GET['akcja'] ?? '');

try {
    switch ($akcja) {

        /* Podgląd JPEG do pokazania w przeglądarce (także z HEIC). */
        case 'podglad': {
            $plik = wgrany_plik();
            $bok = (int) liczba('bok', 1600, 64, 8000);
            $jakosc = (int) liczba('jakosc', 82, 40, 95);
            $im = wczytaj_obraz($plik['tmp_name'], $bok);
            // jpeg:size mógł już zmniejszyć obraz, więc prawdziwe wymiary bierzemy z osobnego odczytu nagłówka
            $ping = new Imagick();
            $ping->pingImage(rozpoznaj_format($plik['tmp_name']) . ':' . $plik['tmp_name'] . '[0]');
            $w0 = $ping->getImageWidth();
            $h0 = $ping->getImageHeight();
            $obrocony = in_array($ping->getImageOrientation(), [
                Imagick::ORIENTATION_LEFTTOP, Imagick::ORIENTATION_RIGHTTOP,
                Imagick::ORIENTATION_RIGHTBOTTOM, Imagick::ORIENTATION_LEFTBOTTOM,
            ], true);
            $ping->clear();
            if ($obrocony) { [$w0, $h0] = [$h0, $w0]; }
            ogranicz_bok($im, $bok);
            $dane = koduj($im, 'jpeg', $jakosc);
            wyslij($dane, 'image/jpeg', czysta_nazwa($plik['name'], 'podglad') . '.jpg', [
                'szer' => $w0, 'wys' => $h0,
                'szer_podgladu' => $im->getImageWidth(), 'wys_podgladu' => $im->getImageHeight(),
            ]);
        }

        /* Ściskacz: plik nie większy niż limit_kb. */
        case 'sciskaj': {
            $plik = wgrany_plik();
            $limit = (int) liczba('limit_kb', 500, 10, 100000) * 1024;
            $bok = (int) liczba('maks_bok', 0, 0, 20000);
            $format = (($_POST['format'] ?? 'jpg') === 'webp') ? 'webp' : 'jpeg';
            $im = wczytaj_obraz($plik['tmp_name']);
            $w0 = $im->getImageWidth();
            $h0 = $im->getImageHeight();
            ogranicz_bok($im, $bok);
            $wynik = null;
            if (rozpoznaj_format($plik['tmp_name']) === $format && $plik['size'] <= $limit) {
                // Plik w tym samym formacie już mieści się w limicie: po zdjęciu metadanych
                // nie może wyjść większy, niż był. Wymiarów w tym celu nie ruszamy.
                $wynik = sciskaj_do_limitu($im, (int) $plik['size'], $format, false);
            }
            if ($wynik === null) {
                $wynik = sciskaj_do_limitu($im, $limit, $format);
            }
            [$dane, $info] = $wynik;
            $info += ['szer_przed' => $w0, 'wys_przed' => $h0, 'bajty_przed' => (int) $plik['size']];
            $roz = $format === 'webp' ? 'webp' : 'jpg';
            wyslij($dane, 'image/' . $format, czysta_nazwa($plik['name'], 'zdjecie') . '.' . $roz, $info);
        }

        /* Kadrownik: komplet kadrów w jednym ZIP-ie. */
        case 'kadruj': {
            $plik = wgrany_plik();
            if (!class_exists('ZipArchive')) { blad(500, 'Na serwerze brakuje obsługi ZIP.'); }
            $formaty = json_decode((string) ($_POST['formaty'] ?? ''), true);
            if (!is_array($formaty) || !$formaty || count($formaty) > 12) {
                blad(400, 'Zaznacz od 1 do 12 formatów.');
            }
            $fx = liczba('fx', 0.5, 0, 1);
            $fy = liczba('fy', 0.5, 0, 1);
            $zoom = liczba('zoom', 1, 1, 4);
            $jakosc = (int) liczba('jakosc', 90, 50, 95);
            $im = wczytaj_obraz($plik['tmp_name']);
            $baza = czysta_nazwa((string) ($_POST['nazwa'] ?? $plik['name']), 'kadr');

            $tmp = tempnam(sys_get_temp_dir(), 'prz');
            if ($tmp === false) { blad(500, 'Serwer nie pozwala zapisać pliku tymczasowego.'); }
            $zip = new ZipArchive();
            if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) { @unlink($tmp); blad(500, 'Nie udało się utworzyć ZIP-a.'); }
            $lista = [];
            foreach ($formaty as $f) {
                $id = is_array($f) ? (string) ($f['id'] ?? '') : '';
                $sw = is_array($f) ? (int) ($f['w'] ?? 0) : 0;
                $sh = is_array($f) ? (int) ($f['h'] ?? 0) : 0;
                if (!preg_match('/^[a-z0-9-]{1,40}$/', $id) || $sw < 16 || $sh < 16 || $sw > 8000 || $sh > 8000) {
                    $zip->close();
                    @unlink($tmp);
                    blad(400, 'Nieprawidłowy format kadru.');
                }
                $k = kadruj($im, $sw, $sh, $fx, $fy, $zoom);
                $nazwa = $baza . '_' . $id . '_' . $sw . 'x' . $sh . '.jpg';
                $zip->addFromString($nazwa, koduj($k, 'jpeg', $jakosc));
                $k->clear();
                $lista[] = $nazwa;
            }
            $zip->close();
            $dane = (string) file_get_contents($tmp);
            @unlink($tmp);
            wyslij($dane, 'application/zip', $baza . '_kadry.zip', ['pliki' => $lista]);
        }

        /* Czyściciel dla formatów, których przeglądarka nie przepisze sama. */
        case 'oczysc': {
            $plik = wgrany_plik();
            $wejscie = rozpoznaj_format($plik['tmp_name']);
            $im = wczytaj_obraz($plik['tmp_name']);   // zdejmuje metadane, zostawia profil kolorów
            if ($wejscie === 'webp') {
                $dane = koduj($im, 'webp', 90);
                wyslij($dane, 'image/webp', czysta_nazwa($plik['name'], 'zdjecie') . '.webp', ['format' => 'webp']);
            }
            if ($wejscie === 'png' || $wejscie === 'gif' || $wejscie === 'bmp') {
                $dane = koduj($im, 'png', 90);
                wyslij($dane, 'image/png', czysta_nazwa($plik['name'], 'zdjecie') . '.png', ['format' => 'png']);
            }
            $dane = koduj($im, 'jpeg', 92);
            wyslij($dane, 'image/jpeg', czysta_nazwa($plik['name'], 'zdjecie') . '.jpg', ['format' => 'jpeg']);
        }

        default:
            blad(404, 'Nieznana akcja.');
    }
} catch (BladObrazu $e) {
    blad(422, $e->getMessage());
} catch (ImagickException $e) {
    blad(500, 'Imagick nie poradził sobie z tym plikiem.');
} catch (Throwable $e) {
    error_log('przybornik: ' . $e->getMessage());
    blad(500, 'Błąd serwera. Szczegóły są w logu.');
}
