# Dziennik zmian

## 1.3.0 (2026-11-12)

- Nowe narzędzie „MP4 do MP3” (grupa „Wideo i inne”, § 09): wyciąga dźwięk z filmów (MP4, MOV, M4A, WebM, MKV, WAV) do plików MP3 w jakości 128, 192 albo 320 kb/s. Kilka plików naraz, „Pobierz wszystko (ZIP)”, przerwanie w trakcie. Tytuł i inne tagi z filmu przechodzą do MP3. Pliki bez ścieżki dźwiękowej dostają czytelny komunikat zamiast błędu.
- Działa w przeglądarce, bo PHP na Zenboxie nie uruchomi ffmpeg. Przeglądarki nie mają własnego kodera MP3, dlatego koduje LAME 3.100 jako WebAssembly z dodatku `@mediabunny/mp3-encoder` 1.65.2 (0,5 MB, w osobnym wątku). Dekoduje WebCodecs przez Mediabunny, tak jak w Pionie do sociali.
- `scripts/biblioteki.sh` pobiera dodatek i podmienia w nim import `mediabunny` na ścieżkę do pliku obok. Przeglądarka bez mapy importów nie zna nazwy pakietu, a ten sam adres modułu sprawia, że zarejestrowany koder widzi ta sama kopia Mediabunny, której używa narzędzie.
- Numery w spisie od Czyściciela w dół przesunęły się o jeden.
- Licencja kodu: MIT zamiast Apache 2.0, razem z pozostałymi małymi appkami. Logo BS nadal poza licencją, biblioteki zachowują własne licencje.

Sprawdzone: 14 testów funkcji przeglądarkowych; w Chrome na lokalnej kopii pięć plików naraz (MP4, MOV, M4A, film bez dźwięku, film 5 min stereo). Film 5 min zamienił się w 3,8 s przy 192 kb/s i w 3,1 s przy 320 kb/s; każde MP3 odtwarza się z właściwą długością, stereo i tytułem. Przerwanie w połowie nie zostawia wyniku. Pion do sociali dalej się wczytuje.

## 1.2.0 (2026-11-11)

- Nowa grupa „Moje aplikacje” z odnośnikami do chmury słów (formularz, rzutnik jasny i ciemny, panel) i do panelu skracacza. Obie aplikacje działają osobno, Przybornik tylko do nich prowadzi. Listę zmienia stała `APLIKACJE` w konfiguracji.
- Licencja kodu: Apache 2.0, jak w pozostałych małych appkach.

Sprawdzone: 17 testów serwera na PHP 8.1 i 8.4.

## 1.1.1 (2026-11-11)

Dwie poprawki po próbie na serwerze.

- Ściskacz: plik JPG albo WebP, który już mieści się w limicie, nie wychodzi większy niż wszedł (wcześniej zdjęcie 13 KB wracało jako 31 KB). Wymiarów w tym celu nie zmienia.
- Odchudzacz PDF: obrazy są zmniejszane, gdy tylko przekraczają rozdzielczość poziomu. Domyślny próg Ghostscripta zostawiał bez zmian np. zdjęcie 205 dpi na poziomie „ekran”. Poziom „mail” dodatkowo zapisuje zdjęcia JPG od nowa.

Sprawdzone: 16 testów serwera na PHP 8.1 i 8.4, 13 testów funkcji przeglądarkowych, trzy poziomy Odchudzacza na PDF-ie ze zdjęciem 205 dpi (mail −98%, ekran −97%, druk −50%).

## 1.1.0 (2026-11-11)

Strona działa bez hasła. Powód: właściciel nie chce logowania do własnych narzędzi.

- Bez pliku `konfiguracja.php` (albo bez hasła w nim) Przybornik otwiera się od razu. Hasło zostało jako opcja pod `/przybornik/?haslo`.
- W zamian API dostało limit godzinowy (400 żądań z adresu, 3000 łącznie) i odrzuca żądania wysłane z obcych witryn. Bez tego każdy, kto trafi na adres, mógłby obciążać procesor hostingu obróbką zdjęć.
- Skrót adresu IP w licznikach zmienia się codziennie.

Sprawdzone: 15 testów serwera na PHP 8.1 i 8.4 (w tym tryb otwarty, obce źródła, limit, przejście na hasło).

## 1.0.0 (2026-11-11)

Pierwsza wersja: dziesięć narzędzi w jednej stronie za hasłem.

- Ściskacz i Kadrownik na serwerze (Imagick), bo tam czyta się HEIC. Reszta w przeglądarce.
- Odchudzacz PDF, OCR i wideo działają w przeglądarce, bo pomiar Zenboxa z 11.11.2026 pokazał, że PHP nie może tam uruchamiać programów (`exec` i pokrewne wyłączone).
- Wideo przez WebCodecs (Mediabunny) zamiast ffmpeg.wasm: kodowanie sprzętowe jest kilkadziesiąt razy szybsze, a biblioteka ma 0,7 MB zamiast 32 MB.
- Karuzela wkłada strony PDF do nowego PDF-a jako wektor (tekst zostaje ostry), obrazy rysuje pdf.js.
- OCR: Tesseract oddaje samą niewidzialną warstwę tekstu, stronę z obrazem JPG składa pdf-lib. Dzięki temu plik ma rozmiar zwykłego zdjęcia.
- Czyściciel czyści JPG i PNG bezstratnie (wycina bloki metadanych, obraz zostaje bajt w bajt).
- Sesja jako podpisane ciasteczko, bez plików sesji na serwerze.

Sprawdzone: 12 testów serwera na PHP 8.1 i 8.4, 13 testów funkcji przeglądarkowych, test `.htaccess` na Apache, ręczna próba wszystkich dziesięciu narzędzi w przeglądarce (Chromium) na plikach testowych. Niesprawdzone: działanie na serwerze Zenbox (LiteSpeed) i w Safari.
