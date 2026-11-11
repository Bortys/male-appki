<?php
/* =========================================================================
   PRZYBORNIK · obróbka zdjęć przez Imagick (Ściskacz, Kadrownik, podglądy).
   Plik nie jest dostępny z zewnątrz (.htaccess). Zgodny z PHP 8.1–8.4.
   ========================================================================= */
declare(strict_types=1);

const MAKS_MEGAPIKSELI = 200;
const MIN_JAKOSC = 35;
const MAKS_JAKOSC = 92;

class BladObrazu extends RuntimeException {}

/**
 * Rozpoznaje format po pierwszych bajtach pliku. Zwraca nazwę kodera Imagick
 * albo null. Imagick dostaje potem jawny koder, więc nie zgaduje po treści
 * (SVG, MVG, EPS i podobne nigdy do niego nie trafią).
 */
function rozpoznaj_format(string $sciezka): ?string {
    $u = @fopen($sciezka, 'rb');
    if ($u === false) { return null; }
    $b = (string) fread($u, 32);
    fclose($u);
    if (strncmp($b, "\xFF\xD8\xFF", 3) === 0) { return 'jpeg'; }
    if (strncmp($b, "\x89PNG\r\n\x1A\n", 8) === 0) { return 'png'; }
    if (strncmp($b, 'GIF87a', 6) === 0 || strncmp($b, 'GIF89a', 6) === 0) { return 'gif'; }
    if (strncmp($b, 'RIFF', 4) === 0 && substr($b, 8, 4) === 'WEBP') { return 'webp'; }
    if (strncmp($b, "II*\x00", 4) === 0 || strncmp($b, "MM\x00*", 4) === 0) { return 'tiff'; }
    if (strncmp($b, 'BM', 2) === 0) { return 'bmp'; }
    if (substr($b, 4, 4) === 'ftyp') {
        $marka = substr($b, 8, 4);
        if (in_array($marka, ['avif', 'avis'], true)) { return 'avif'; }
        if (in_array($marka, ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'], true)) {
            // mif1 bywa i HEIC, i AVIF: zgodne marki stoją dalej w nagłówku
            return (strpos($b, 'avif') !== false) ? 'avif' : 'heic';
        }
    }
    return null;
}

function wymagaj_imagick(): void {
    if (!class_exists('Imagick')) {
        throw new BladObrazu('Na serwerze brakuje biblioteki Imagick.');
    }
    static $ustawione = false;
    if (!$ustawione) {
        $ustawione = true;
        try {
            Imagick::setResourceLimit(Imagick::RESOURCETYPE_MEMORY, 384 * 1024 * 1024);
            Imagick::setResourceLimit(Imagick::RESOURCETYPE_MAP, 768 * 1024 * 1024);
            Imagick::setResourceLimit(Imagick::RESOURCETYPE_TIME, 80);
        } catch (Throwable $e) { /* limity ustawia wtedy hosting */ }
    }
}

/**
 * Wczytuje pierwszą klatkę obrazu, obraca ją według EXIF i zdejmuje metadane.
 * Profil kolorów zostaje, bo bez niego zdjęcia z iPhone'a (Display P3) blakną.
 * $podpowiedz_boku przyspiesza wczytanie JPEG, gdy potrzebna jest tylko miniatura.
 */
function wczytaj_obraz(string $sciezka, int $podpowiedz_boku = 0): Imagick {
    wymagaj_imagick();
    $format = rozpoznaj_format($sciezka);
    if ($format === null) {
        throw new BladObrazu('Nie rozpoznaję tego pliku jako zdjęcia. Obsługuję JPG, PNG, HEIC, WebP, AVIF, TIFF, GIF i BMP.');
    }
    $zrodlo = $format . ':' . $sciezka . '[0]';
    try {
        $ping = new Imagick();
        $ping->pingImage($zrodlo);
        $piksele = $ping->getImageWidth() * $ping->getImageHeight();
        $ping->clear();
        if ($piksele > MAKS_MEGAPIKSELI * 1000000) {
            throw new BladObrazu('Zdjęcie ma ponad ' . MAKS_MEGAPIKSELI . ' megapikseli. Tak dużego nie przerobię.');
        }
        $im = new Imagick();
        if ($podpowiedz_boku > 0 && $format === 'jpeg') {
            $im->setOption('jpeg:size', ($podpowiedz_boku * 2) . 'x' . ($podpowiedz_boku * 2));
        }
        $im->readImage($zrodlo);
    } catch (ImagickException $e) {
        throw new BladObrazu('Nie udało się otworzyć zdjęcia (' . $format . '). Plik może być uszkodzony.');
    }

    // Obrót według EXIF, zanim metadane znikną
    if (method_exists($im, 'autoOrient')) {
        $im->autoOrient();
    } else {
        obroc_wedlug_exif($im);
    }
    $im->setImageOrientation(Imagick::ORIENTATION_TOPLEFT);
    $im->setImagePage(0, 0, 0, 0);

    $profil = null;
    if ($im->getImageColorspace() === Imagick::COLORSPACE_CMYK) {
        $im->transformImageColorspace(Imagick::COLORSPACE_SRGB);
    } else {
        try { $profil = $im->getImageProfile('icc'); } catch (ImagickException $e) { $profil = null; }
    }
    $im->stripImage();
    if ($profil !== null && $profil !== '') {
        try { $im->profileImage('icc', $profil); } catch (ImagickException $e) { /* bez profilu też zadziała */ }
    }
    return $im;
}

function obroc_wedlug_exif(Imagick $im): void {
    $tlo = new ImagickPixel('#ffffff');
    switch ($im->getImageOrientation()) {
        case Imagick::ORIENTATION_TOPRIGHT:    $im->flopImage(); break;
        case Imagick::ORIENTATION_BOTTOMRIGHT: $im->rotateImage($tlo, 180); break;
        case Imagick::ORIENTATION_BOTTOMLEFT:  $im->flipImage(); break;
        case Imagick::ORIENTATION_LEFTTOP:     $im->flopImage(); $im->rotateImage($tlo, -90); break;
        case Imagick::ORIENTATION_RIGHTTOP:    $im->rotateImage($tlo, 90); break;
        case Imagick::ORIENTATION_RIGHTBOTTOM: $im->flopImage(); $im->rotateImage($tlo, 90); break;
        case Imagick::ORIENTATION_LEFTBOTTOM:  $im->rotateImage($tlo, -90); break;
    }
}

/** Kładzie przezroczystość na białym tle (JPEG nie ma kanału alfa). */
function splaszcz(Imagick $im): void {
    if (!$im->getImageAlphaChannel()) { return; }
    $im->setImageBackgroundColor(new ImagickPixel('#ffffff'));
    if (defined('Imagick::ALPHACHANNEL_REMOVE')) {
        $im->setImageAlphaChannel(Imagick::ALPHACHANNEL_REMOVE);
    } else {
        $plaski = $im->mergeImageLayers(Imagick::LAYERMETHOD_FLATTEN);
        $im->setImage($plaski);
        $plaski->clear();
    }
}

/** Zmniejsza obraz tak, żeby dłuższy bok miał najwyżej $bok pikseli. Nie powiększa. */
function ogranicz_bok(Imagick $im, int $bok): void {
    $w = $im->getImageWidth();
    $h = $im->getImageHeight();
    $dluzszy = max($w, $h);
    if ($bok <= 0 || $dluzszy <= $bok) { return; }
    $skala = $bok / $dluzszy;
    $im->resizeImage(max(1, (int) round($w * $skala)), max(1, (int) round($h * $skala)), Imagick::FILTER_LANCZOS, 1);
}

/** Koduje obraz do pamięci. $format: jpeg, webp albo png. */
function koduj(Imagick $im, string $format, int $jakosc): string {
    $k = clone $im;
    if ($format === 'jpeg') {
        splaszcz($k);
        $k->setImageFormat('jpeg');
        $k->setInterlaceScheme(Imagick::INTERLACE_PLANE);
        $k->setSamplingFactors($jakosc >= 90 ? ['1x1', '1x1', '1x1'] : ['2x2', '1x1', '1x1']);
    } else {
        $k->setImageFormat($format);
    }
    $k->setImageCompressionQuality($jakosc);
    $dane = $k->getImageBlob();
    $k->clear();
    return $dane;
}

/**
 * Szuka najwyższej jakości, przy której plik mieści się w limicie. Gdy nawet
 * najniższa jakość nie wystarcza, zmniejsza wymiary i próbuje ponownie
 * (albo zwraca null, jeśli $wolno_zmniejszac jest wyłączone).
 * Zwraca [dane, informacje].
 */
function sciskaj_do_limitu(Imagick $im, int $limit_bajtow, string $format, bool $wolno_zmniejszac = true): ?array {
    $zmniejszono = false;
    for ($runda = 0; $runda < 8; $runda++) {
        $dane = koduj($im, $format, MAKS_JAKOSC);
        $jakosc = MAKS_JAKOSC;
        if (strlen($dane) > $limit_bajtow) {
            $najlepsze = null;
            $dol = MIN_JAKOSC;
            $gora = MAKS_JAKOSC - 1;
            while ($dol <= $gora) {
                $srodek = intdiv($dol + $gora, 2);
                $proba = koduj($im, $format, $srodek);
                if (strlen($proba) <= $limit_bajtow) {
                    $najlepsze = [$proba, $srodek];
                    $dol = $srodek + 1;
                } else {
                    $gora = $srodek - 1;
                }
            }
            if ($najlepsze === null) {
                if (!$wolno_zmniejszac) { return null; }
                // Najniższa jakość wciąż za duża: zmniejszamy wymiary proporcjonalnie do nadmiaru
                $rozmiar_min = strlen(koduj($im, $format, MIN_JAKOSC));
                $skala = max(0.3, min(0.9, sqrt($limit_bajtow / $rozmiar_min) * 0.95));
                $w = max(1, (int) round($im->getImageWidth() * $skala));
                $h = max(1, (int) round($im->getImageHeight() * $skala));
                if (max($w, $h) < 64) { break; }
                $im->resizeImage($w, $h, Imagick::FILTER_LANCZOS, 1);
                $zmniejszono = true;
                continue;
            }
            [$dane, $jakosc] = $najlepsze;
        }
        return [$dane, [
            'jakosc' => $jakosc,
            'szer' => $im->getImageWidth(),
            'wys' => $im->getImageHeight(),
            'bajty' => strlen($dane),
            'zmniejszono' => $zmniejszono,
        ]];
    }
    throw new BladObrazu('Nie da się zejść do tak małego rozmiaru. Podaj większy limit.');
}

/**
 * Prostokąt kadru o proporcjach $szer_cel:$wys_cel wokół punktu ($fx, $fy)
 * podanego jako ułamek szerokości i wysokości. Ta sama arytmetyka działa
 * w przeglądarce (podgląd), więc wynik zgadza się z tym, co widać.
 */
function prostokat_kadru(int $w, int $h, int $szer_cel, int $wys_cel, float $fx, float $fy, float $zoom): array {
    $proporcje = $szer_cel / $wys_cel;
    if ($w / $h > $proporcje) {
        $kh = (float) $h;
        $kw = $h * $proporcje;
    } else {
        $kw = (float) $w;
        $kh = $w / $proporcje;
    }
    $zoom = max(1.0, min(4.0, $zoom));
    $kw /= $zoom;
    $kh /= $zoom;
    $x = max(0.0, min($w - $kw, $fx * $w - $kw / 2));
    $y = max(0.0, min($h - $kh, $fy * $h - $kh / 2));
    return [(int) round($x), (int) round($y), max(1, (int) round($kw)), max(1, (int) round($kh))];
}

function kadruj(Imagick $im, int $szer_cel, int $wys_cel, float $fx, float $fy, float $zoom): Imagick {
    [$x, $y, $kw, $kh] = prostokat_kadru($im->getImageWidth(), $im->getImageHeight(), $szer_cel, $wys_cel, $fx, $fy, $zoom);
    $k = clone $im;
    $k->cropImage($kw, $kh, $x, $y);
    $k->setImagePage(0, 0, 0, 0);
    $k->resizeImage($szer_cel, $wys_cel, Imagick::FILTER_LANCZOS, 1);
    return $k;
}

/** Nazwa pliku bez rozszerzenia i bez znaków, które psują pobieranie. */
function czysta_nazwa(string $nazwa, string $domyslna = 'plik'): string {
    $nazwa = (string) preg_replace('/\.[A-Za-z0-9]{1,5}$/', '', basename($nazwa));
    $nazwa = (string) preg_replace('/[^\p{L}\p{N}_-]+/u', '-', $nazwa);
    $nazwa = trim($nazwa, '-_');
    if (function_exists('mb_substr')) { $nazwa = mb_substr($nazwa, 0, 80); }
    return $nazwa !== '' ? $nazwa : $domyslna;
}
