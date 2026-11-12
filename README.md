# Małe appki

Trzy małe aplikacje w PHP, które działają na zwykłym hostingu współdzielonym, bez zewnętrznych usług. Autor: [Bartosz Sokoliński](https://sokolinski.com).

| Aplikacja | Co robi | Dane | Działa na |
|---|---|---|---|
| [Skracacz](skracacz/) | Krótkie linki z własnej domeny, panel, statystyki dzienne, API | SQLite | [go.sokolinski.com](https://go.sokolinski.com) |
| [Chmura](chmura/) | Ankieta, której odpowiedzi rosną na żywo w chmurę słów, z widokiem na rzutnik i kodem QR | pliki JSON | [sokolinski.com/chmura](https://sokolinski.com/chmura/) |
| [Przybornik](przybornik/) | Dwanaście narzędzi w jednej stronie: zdjęcia do zadanego rozmiaru, kadry na sociale, odchudzanie i składanie PDF, karuzele, OCR, wideo w pionie, dźwięk z filmów do MP3, czyszczenie metadanych, kody QR, podgląd wpisu na LinkedIn i X. Prowadzi też do chmury i skracacza | bez bazy | [sokolinski.com/przybornik](https://sokolinski.com/przybornik/) |

Każda aplikacja ma w swoim katalogu `README.md` z instalacją, opisem działania i testami.

## Wymagania

PHP 7.4 lub nowszy, a dla skracacza także PDO SQLite. Przybornik potrzebuje PHP 8.1 lub nowszego z rozszerzeniami Imagick (z obsługą HEIC) i zip, a do zbudowania paczki npm, bo biblioteki przeglądarkowe pobiera osobny skrypt. Testy uruchamia się lokalnie w Dockerze. Sprawdzone na PHP 8.1, 8.3 i 8.4.

## Licencja i autorstwo

Kod jest na licencji [MIT](LICENSE). Możesz go używać, zmieniać i rozpowszechniać, także komercyjnie.

Jeśli rozpowszechniasz ten kod albo jego istotną część, dołącz informację o autorstwie (Copyright (c) 2026 Bartosz Sokoliński) i treść licencji z pliku [LICENSE](LICENSE). Mile widziane jest też krótkie wskazanie autora w samej aplikacji, np.:

> Oparte na „Małych appkach” Bartosza Sokolińskiego (sokolinski.com)

Licencja nie obejmuje logo BS. Przed uruchomieniem u siebie wymień logo i oznaczenia w plikach stron na własne.

Składniki innych autorów (fonty, biblioteki) zachowują własne licencje, lista jest w [NOTICE](NOTICE). Biblioteki przeglądarkowe Przybornika nie leżą w repozytorium, pobiera je `przybornik/scripts/biblioteki.sh`. Jedna z nich, Ghostscript, jest na licencji AGPL-3.0, a koder MP3 zawiera LAME na licencji LGPL: kto wystawia Przybornik publicznie, musi wskazać gościom ich licencje i źródła. Gotowa strona `licencje.html` robi to za ciebie.
