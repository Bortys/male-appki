# Skracacz linków (go.sokolinski.com)

Własny skracacz w PHP i SQLite, na zwykłym hostingu Zenbox. Bez MySQL i bez zewnętrznych usług.

- `public_html/` odpowiada `domains/go.sokolinski.com/public_html` na serwerze
- `config.example.php` to wzór `config.php`; prawdziwy plik jest tylko na serwerze
- `tests/` testy, `scripts/paczka.sh` buduje paczkę do wgrania
- `CHANGELOG.md` co, dlaczego, z datą

## Czego nie ma w repozytorium

`public_html/config.php` (hash hasła i klucz API) oraz `public_html/data/` (baza z linkami). Oba zostają na serwerze i nie są częścią paczki.

## Pierwsza instalacja

Wymagania: PHP 7.4 lub nowszy z PDO SQLite.

1. W panelu Zenbox (DirectAdmin) dodaj subdomenę, włącz dla niej SSL (Let's Encrypt) i ustaw najnowsze PHP 8.x.
2. Zbuduj paczkę (`scripts/paczka.sh`) i rozpakuj ją w `domains/go.sokolinski.com/public_html/` razem z plikami ukrytymi. Wiele programów FTP domyślnie pomija pliki zaczynające się od kropki.
3. Skopiuj `config.example.php` na serwer jako `public_html/config.php`.
4. Katalog `data/` musi mieć prawo zapisu (zwykle 755, jeśli baza się nie tworzy, 775).
5. Wejdź na `/admin`, wpisz hasło (min. 10 znaków), kliknij „Generuj” i wklej pokazane linie do `config.php`.
6. Odśwież `/admin` i zaloguj się.

W `config.php` możesz też ustawić `HOME_REDIRECT`, np. `https://sokolinski.com`, żeby wejście na sam adres domeny prowadziło na stronę główną.

Gdy coś nie działa, zajrzyj do logu błędów PHP w DirectAdmin. Aplikacja nie pokazuje szczegółów błędów na stronie.

## Używanie

- **Panel:** `/admin`: skracanie, własne aliasy, notatki, wyszukiwarka, kopiowanie, usuwanie, statystyki dzienne z 60 dni.
- **Krótki link:** `https://go.sokolinski.com/kod`, przekierowanie 302.
- **API** (gdy ustawiony `API_KEY`), tylko POST:

```bash
curl -X POST https://go.sokolinski.com/api -H "X-Api-Key: TWÓJ_KLUCZ" -d "url=https://bardzo-dlugi-adres" -d "alias=nl45" -d "note=newsletter"
```

Odpowiedź: `{"short":"https://go.sokolinski.com/nl45","code":"nl45"}`. Działa też JSON.

## Bezpieczeństwo i prywatność

- Skracać może tylko administrator albo API z kluczem, więc nikt obcy nie użyje domeny do spamu.
- Hasło jest trzymane jako hash. Po 5 błędnych próbach z jednego adresu logowanie z niego jest zablokowane na 15 minut. Po 50 próbach łącznie każdy adres ma tylko jedną szansę. Licznik trzyma skróty adresów IP, usuwane przy kolejnej próbie logowania po upływie tego czasu.
- Z zewnątrz widać tylko `assets/`. Wszystkie inne adresy, także nazwy istniejących plików, obsługuje `index.php`.
- Licznik kliknięć nie zapisuje adresów IP ani nie ustawia ciasteczek u odwiedzających. Nie liczy podglądów linków, automatów, żądań HEAD i wczytywania na zapas. Jego awaria nie zatrzymuje przekierowania.
- Serwer Zenbox prowadzi własne logi dostępu, w których adresy IP są zapisywane niezależnie od aplikacji.

## Kopia zapasowa

Cała baza to jeden plik: `data/links.sqlite`. Wystarczy go co jakiś czas ściągnąć (Zenbox robi też własne kopie).

## Testy

Testy działają na PHP 8.4 w Dockerze, na kopii kodu z losowym hasłem. Nie dotykają serwera. Uruchamiaj je z katalogu tej aplikacji.

```bash
python3 tests/uruchom.py
```

```bash
tests/htaccess_test.sh
```

Drugi skrypt sprawdza reguły `.htaccess` na Apache z macOS. Serwer produkcyjny to LiteSpeed, więc po wdrożeniu sprawdź z zewnątrz, czy pliki prywatne zwracają 403 albo 404.

## Licencja

MIT, autor: Bartosz Sokoliński. Szczegóły w plikach [LICENSE](../LICENSE) i [NOTICE](../NOTICE) w głównym katalogu repozytorium. Licencja nie obejmuje logo BS.
