# Przybornik (sokolinski.com/przybornik)

Dwanaście małych narzędzi w jednej stronie: zdjęcia, PDF, wideo, dźwięk, kod QR i podgląd wpisów do sociali. Strona jest otwarta, bez hasła (hasło jest opcją), i ukryta przed wyszukiwarkami. Działa na zwykłym hostingu z PHP (Zenbox), bez bazy danych, bez builda i bez zewnętrznych usług. Wygląd: system marki BS (oxblood na papierze, EB Garamond, Carlito, Inconsolata).

| § | Narzędzie | Co robi | Gdzie pracuje |
|---|---|---|---|
| 01 | Ściskacz | zdjęcie do zadanego rozmiaru pliku (KB), także z HEIC; metadane znikają | serwer (Imagick) |
| 02 | Kadrownik | jedno zdjęcie, siedem formatów na kanały, punkt kadru, ZIP | podgląd w przeglądarce, kadry na serwerze |
| 03 | Ładny zrzut | zrzut ekranu z tłem, marginesem, cieniem, zamazanymi polami | przeglądarka |
| 04 | Odchudzacz PDF | trzy poziomy: mail, ekran, druk; tekst zostaje tekstem | przeglądarka (Ghostscript jako WebAssembly) |
| 05 | Stół montażowy | łączenie, dzielenie, kolejność, obrót, usuwanie stron; zdjęcia jako strony | przeglądarka (pdf.js, pdf-lib) |
| 06 | Karuzela | PDF albo grafiki jako strony 4:5, 1:1, 9:16, 16:9; PDF na LinkedIn albo ZIP obrazów | przeglądarka |
| 07 | PDF z tekstem | zdjęcia kartek i skany jako PDF z warstwą tekstu (OCR po polsku) plus TXT | przeglądarka (Tesseract) |
| 08 | Pion do sociali | film w formacie kanału, przycięty, w limicie MB, z wypalonymi napisami SRT | przeglądarka (WebCodecs, Mediabunny) |
| 09 | MP4 do MP3 | dźwięk z filmów jako MP3 (128, 192 albo 320 kb/s), kilka plików naraz, ZIP | przeglądarka (WebCodecs, LAME jako WebAssembly) |
| 10 | Czyściciel | usuwa metadane ze zdjęć, PDF-ów i plików Office, pokazuje, co znalazł | przeglądarka; HEIC, WebP i TIFF na serwerze |
| 11 | QR z logo | kod QR w kolorach marki, PNG i SVG | przeglądarka |
| 12 | Podgląd wpisu | gdzie LinkedIn utnie wpis na „…więcej” (telefon i komputer), ile znaków policzy X (próg 250 albo 280), limity LinkedIn, X, Instagram | przeglądarka |
| 13 | Chmura słów | odnośniki do ankiety z chmurą słów: formularz, rzutnik, panel | osobna aplikacja |
| 14 | Skracacz linków | odnośnik do panelu skracacza go.sokolinski.com | osobna aplikacja |

Grupa „Moje aplikacje” (§ 13 i 14) to tylko odnośniki: chmura słów i skracacz działają osobno, z własnymi panelami i hasłami (kod w katalogach [`chmura/`](../chmura/) i [`skracacz/`](../skracacz/) tego repozytorium). Listę odnośników można zmienić stałą `APLIKACJE` w konfiguracji.

Serwer robi tylko to, w czym jest lepszy: czyta HEIC i dobiera jakość JPG z dokładnością do punktu. Na Zenboxie PHP nie może uruchamiać programów (`exec` wyłączone), więc Ghostscript, Tesseract i kodowanie wideo działają w przeglądarce. Pliki obrabiane w przeglądarce nie opuszczają komputera; pliki wysłane do Ściskacza i Kadrownika serwer przerabia w pamięci i niczego nie zapisuje.

## Układ repozytorium

- `public_html/przybornik/` odpowiada `public_html/przybornik` na serwerze
  - `index.php` (strona, opcjonalne logowanie), `api.php` (obróbka zdjęć), `wspolne.php`, `obrazy.php`
  - `zasoby/` styl, fonty, moduły narzędzi (`narzedzia/*.js`), robotnik Ghostscripta
  - `lib/` biblioteki przeglądarkowe (38 MB). Nie są w repozytorium: odtwarza je `scripts/biblioteki.sh`
  - `dane/` licznik żądań i nieudanych logowań (tylko na serwerze)
- `konfiguracja.example.php` wzór opcjonalnego `konfiguracja.php` (hasło, limity)
- `scripts/biblioteki.sh` pobiera biblioteki w przypiętych wersjach, `scripts/paczka.sh` buduje paczkę do wgrania
- `tests/` testy
- `CHANGELOG.md` co, dlaczego, z datą

## Pierwsza instalacja

1. `scripts/biblioteki.sh` (raz, potrzebny npm), potem `scripts/paczka.sh`. Powstaje `dist/przybornik-<wersja>.zip`.
2. Rozpakuj paczkę w `public_html` strony. Powstanie katalog `przybornik/`.
3. Wejdź na `sokolinski.com/przybornik/`. Narzędzia działają od razu, bez konfiguracji.
4. Katalog `przybornik/dane` musi mieć prawo zapisu (755 wystarcza na Zenboxie). Bez tego działa wszystko poza limitem żądań i blokadą po błędnych hasłach.

Hasło (opcja): `sokolinski.com/przybornik/?haslo` przyjmie hasło (min. 12 znaków) i pokaże treść pliku `konfiguracja.php`. Gdy ten plik trafi na serwer jako `przybornik/konfiguracja.php`, strona zacznie wymagać logowania. Usunięcie pliku przywraca tryb otwarty.

## Bezpieczeństwo

Od wersji 1.1.0 strona jest domyślnie otwarta: kto zna adres, może korzystać z narzędzi. Większość z nich działa w przeglądarce gościa i serwera nie obciąża. Serwer pracuje tylko dla Ściskacza, Kadrownika i podglądów, i to on jest chroniony:

- Limit żądań API: 400 na godzinę z jednego adresu i 3000 łącznie (`LIMIT_NA_ADRES`, `LIMIT_LACZNIE` w konfiguracji). Po przekroczeniu odpowiedź 429. Adres IP jest zapisywany jako skrót zmieniany codziennie.
- API przyjmuje tylko POST z własnej strony: wymaga nagłówka `X-Przybornik`, którego obca witryna nie doda bez zgody CORS, i odrzuca żądania z innym `Origin` albo `Sec-Fetch-Site`.
- Strona ma `noindex` i nie prowadzi do niej żaden odnośnik.

Tryb z hasłem (opcja):

- W konfiguracji leży tylko skrót hasła (`password_hash`) i losowy sekret.
- Sesja to podpisane ciasteczko (HMAC-SHA256, 30 dni, `HttpOnly`, `SameSite=Strict`, ścieżka `/przybornik/`). Bez plików sesji, bo hosting kasuje je po kilkudziesięciu minutach. Zmiana hasła albo sekretu wylogowuje wszystkie urządzenia.
- Po 5 błędnych hasłach z jednego adresu logowanie z niego jest zablokowane na 15 minut; po 50 próbach łącznie blokada obejmuje wszystkich.
- Żeton API jest wtedy związany z sesją.

W obu trybach:

- Format zdjęcia rozpoznawany jest po pierwszych bajtach, a Imagick dostaje jawny koder, więc SVG, MVG czy EPS nigdy do niego nie trafią. Limit 200 megapikseli i 100 MB na plik (`MAKS_PLIK_MB`).
- Ścisła polityka CSP (tylko własne zasoby, WebAssembly dozwolony), `noindex`, pliki pomocnicze i `dane/` zablokowane w `.htaccess`.

## Wymagania serwera

PHP 8.1 do 8.4 z rozszerzeniami Imagick (z obsługą HEIC) i zip. Stan Zenboxa z 11.11.2026: PHP 8.1.34, ImageMagick 7.1.2, limit wysyłki 512 MB, 90 s na żądanie.

Przeglądarka: aktualny Chrome, Edge albo Safari. Pion do sociali wymaga WebCodecs z kodowaniem H.264 (Chrome, Edge, Safari 17 i nowsze). MP4 do MP3 potrzebuje dekodera dźwięku WebCodecs (sprawdzone w Chrome, Safari jeszcze nie); MP3 koduje LAME w WebAssembly, więc przeglądarka nie musi umieć zapisywać MP3. Gdy przeglądarka nie odczyta dźwięku, narzędzie mówi to przy pliku.

Podgląd wpisu: LinkedIn nie podaje, gdzie ucina wpis, więc narzędzie mierzy 3 linijki tekstu w czcionce systemowej, w kolumnie szerokiej jak kanał w telefonie (361 px, 15 px) i na komputerze (504 px, 14 px). Polski tekst daje wtedy ok. 130–140 i 210–225 znaków, tyle, ile podaje większość zestawień. X liczy się według reguł biblioteki twitter-text (konfiguracja v3): znaki spoza podstawowych zakresów i emoji ważą 2, link 23. Szkic zostaje w `localStorage` przeglądarki, na serwer nic nie idzie.

## Testy

```bash
python3 tests/uruchom.py            # serwer: logowanie, blokady, Ściskacz, Kadrownik (Docker, PHP 8.4 z Imagick)
PHP=8.1 python3 tests/uruchom.py    # to samo na wersji z serwera
node --test tests/js/*.test.mjs     # funkcje przeglądarkowe: Czyściciel, kadry, napisy, nazwy MP3, QR, liczenie wpisu
tests/htaccess_test.sh              # .htaccess na Apache z macOS: blokady, typy plików, CSP
```

Podgląd lokalny: `docker run --rm -p 18111:8000 -v "$PWD":/repo przybornik-test:8.4 php -S 0.0.0.0:8000 -t /repo/public_html /repo/tests/router.php`, potem `http://localhost:18111/przybornik/`.

## Licencje

Kod aplikacji: MIT ([`../LICENSE`](../LICENSE)), autor Bartosz Sokoliński; przy rozpowszechnianiu kodu albo jego istotnej części trzeba dołączyć informację o autorstwie i treść licencji. Licencja nie obejmuje logo BS (`zasoby/logo-bs.png`). Biblioteki zachowują swoje licencje, lista w [`../NOTICE`](../NOTICE) i na stronie `przybornik/licencje.html`. Biblioteki przeglądarkowe nie są częścią tego repozytorium: `scripts/biblioteki.sh` pobiera je z npm w przypiętych wersjach, razem z ich plikami licencji.

Uwaga na Ghostscript (Odchudzacz PDF): jest na licencji GNU AGPL-3.0 i zostaje osobnym składnikiem w `lib/gs`, a nie częścią kodu na MIT. Kto wystawia Przybornik publicznie, przekazuje gościom program Ghostscript, więc musi im też wskazać jego licencję i źródła. Robi to strona `przybornik/licencje.html` i plik `lib/gs/LICENSE`. Jeśli zmienisz Ghostscripta, musisz udostępnić także swoje zmiany.
