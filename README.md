# Małe appki

Dwie małe aplikacje w PHP, które działają na zwykłym hostingu współdzielonym, bez zewnętrznych usług. Autor: [Bartosz Sokoliński](https://sokolinski.com).

| Aplikacja | Co robi | Dane | Działa na |
|---|---|---|---|
| [Skracacz](skracacz/) | Krótkie linki z własnej domeny, panel, statystyki dzienne, API | SQLite | [go.sokolinski.com](https://go.sokolinski.com) |
| [Chmura](chmura/) | Ankieta, której odpowiedzi rosną na żywo w chmurę słów, z widokiem na rzutnik i kodem QR | pliki JSON | [sokolinski.com/chmura](https://sokolinski.com/chmura/) |

Każda aplikacja ma w swoim katalogu `README.md` z instalacją, opisem działania i testami.

## Wymagania

PHP 7.4 lub nowszy, a dla skracacza także PDO SQLite. Testy uruchamia się lokalnie w Dockerze. Sprawdzone na PHP 8.1, 8.3 i 8.4.

## Licencja i autorstwo

Kod jest na licencji [Apache 2.0](LICENSE). Możesz go używać, zmieniać i rozpowszechniać, także komercyjnie.

Jeśli rozpowszechniasz ten kod albo oparte na nim dzieła, zachowaj plik [NOTICE](NOTICE) z informacją, że autorem jest Bartosz Sokoliński. Mile widziane jest też krótkie wskazanie autora w samej aplikacji, np.:

> Oparte na „Małych appkach” Bartosza Sokolińskiego (sokolinski.com)

Licencja nie obejmuje logo BS. Przed uruchomieniem u siebie wymień logo i oznaczenia w plikach stron na własne.
