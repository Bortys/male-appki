# Ankieta z chmurą słów (sokolinski.com/chmura)

Ludzie wpisują do trzech słów, a chmura rośnie na żywo: na stronie, w ramce osadzonej w podstronie i na rzutniku. Działa na zwykłym hostingu z PHP (Zenbox), bez bazy danych i bez zewnętrznych usług. Fonty: EB Garamond, Carlito, Inconsolata (SIL OFL), kod QR: biblioteka qrcode-generator (MIT).

- `public_html/chmura/` odpowiada `public_html/chmura` na serwerze
- `konfiguracja.example.php` to wzór `konfiguracja.php`; prawdziwy plik jest tylko na serwerze
- `tests/` testy, `scripts/paczka.sh` buduje paczkę do wgrania
- `CHANGELOG.md` co, dlaczego, z datą

## Czego nie ma w repozytorium

`konfiguracja.php` (hasło) i pliki z `dane/` (odpowiedzi). Zostają na serwerze i nie są częścią paczki.

## Pierwsza instalacja

1. Zbuduj paczkę (`scripts/paczka.sh`) i rozpakuj ją w `public_html` strony. Powstanie katalog `chmura/`.
2. Skopiuj `konfiguracja.example.php` na serwer jako `chmura/konfiguracja.php`. W sekcji `ANKIETY` wpisz swoje pytanie. Klucz (np. `ai-w-pracy`) to końcówka adresu: małe litery, cyfry i myślniki.
3. Katalog `chmura/dane` musi mieć prawo zapisu (755 wystarcza na Zenboxie).
4. Wejdź na `sokolinski.com/chmura/admin.php`, wpisz hasło (min. 12 znaków) i wklej pokazany wiersz do `konfiguracja.php`.
5. Wejdź na `sokolinski.com/chmura/`, wyślij próbne słowo, a potem w panelu kliknij „Usuń wszystkie odpowiedzi”.

## Adresy

| Co | Adres |
|---|---|
| Formularz z chmurą | `sokolinski.com/chmura/?a=ai-w-pracy` |
| Rzutnik (jasny) | `sokolinski.com/chmura/ekran.php?a=ai-w-pracy` |
| Rzutnik (ciemny) | `sokolinski.com/chmura/ekran.php?a=ai-w-pracy&ciemny=1` |
| Panel | `sokolinski.com/chmura/admin.php` |

Na rzutniku klawisz **F** włącza pełny ekran. Widok pokazuje kod QR do formularza i licznik, chmura odświeża się co 3 sekundy.

## Nowa ankieta

Dopisz kolejny blok w `ANKIETY` w pliku `konfiguracja.php`:

```php
'konferencja-listopad' => [
    'pytanie'  => 'Jakie jedno słowo opisuje twoją firmę za rok?',
    'opis'     => 'Do trzech słów. Wynik zobaczysz od razu.',
    'otwarta'  => true,
],
```

Każda ankieta ma osobny plik z wynikami w `dane/` i osobną zakładkę w panelu.

Przed wydarzeniem na ponad 90 osób w jednej sieci Wi-Fi podnieś `LIMIT_NA_SIEC`.

## Panel

- **Ukryj**: słowo znika z chmury, zostaje w danych (można przywrócić).
- **Scal**: łączy odmiany, np. „automatyzacji” scalone z „automatyzacja” sumuje się w jedno słowo.
- **Zamknij / Otwórz ankietę**: formularz znika, chmura zostaje.
- **Wyczyść wyniki**: na dole panelu wpisz klucz ankiety i kliknij „Usuń wszystkie odpowiedzi”. Osoby, które już odpowiedziały, w ciągu kilku sekund znów widzą formularz. Przed czyszczeniem pobierz CSV, jeśli chcesz zachować wyniki.
- **CSV odpowiedzi** i **CSV słów**: eksport do Excela.
- **Gdy ktoś zalewa ankietę**: zerowanie limitów, gdy wspólna sieć sali trafiła na blokadę, i usuwanie odpowiedzi z ostatnich minut.
- **Osadzenie na stronie**: gotowy kod `<iframe>` do wklejenia w podstronę.
- **Hasło do panelu**: generuje skrót nowego hasła do wklejenia w `konfiguracja.php`.

Jeśli strona ma politykę CSP, dopisz do niej `frame-src 'self'`, a skrypt dopasowania wysokości ramki wstaw do pliku JS strony. Bez tego skryptu ramka też działa, tylko ma stałą wysokość.

## Bezpieczeństwo i prywatność

- Hasło jest trzymane jako skrót. Starsza konfiguracja z jawnym hasłem nadal działa, ale panel ostrzega. Hasło domyślne ze starej instrukcji nie otwiera panelu.
- Po 5 błędnych hasłach z jednego adresu logowanie z niego jest zablokowane na 15 minut. Po 50 próbach łącznie każdy adres ma tylko jedną szansę. Przed wydarzeniem warto zalogować się wcześniej, bo otwarta sesja działa także w trakcie blokady.
- Jedna przeglądarka może wysłać odpowiedź 3 razy na godzinę, jeden adres IP 90 razy. Jedna ankieta przyjmie najwyżej 5000 odpowiedzi. Zmienisz to w `konfiguracja.php`.
- Pułapki na boty: ukryte pole, blokada wysyłki szybszej niż 2 sekundy od otwarcia strony i wysyłki z obcych stron. Czarna lista odrzuca część wulgaryzmów, resztę ukrywasz w panelu.
- Wyniki leżą w `dane/` w plikach `.json.php`, zablokowanych przez `.htaccess` i dodatkowo przez nagłówek PHP. Zapis jest atomowy: odczyt nigdy nie trafia na pusty ani urwany plik.
- Adresów IP nie zapisuję wprost. Do limitu służy skrót zmieniany codziennie, usuwany przy pierwszym wejściu na ankietę po godzinie. Czas odpowiedzi jest zapisany z dokładnością do minuty. Ciasteczko powstaje dopiero po wysłaniu odpowiedzi, działa tylko pod `/chmura/` i wygasa po 2 godzinach.
- Serwer Zenbox prowadzi własne logi dostępu, w których adresy IP są zapisywane niezależnie od aplikacji.

## Testy

Testy działają na PHP 8.4 w Dockerze, na kopii kodu z losowym hasłem. Nie dotykają serwera. Uruchamiaj je z katalogu tej aplikacji.

```bash
python3 tests/uruchom.py
```

```bash
node tests/chmura_js_test.js
```

```bash
tests/htaccess_test.sh
```

Trzeci skrypt sprawdza reguły `.htaccess` na Apache z macOS. Serwer produkcyjny to LiteSpeed, więc po wdrożeniu sprawdź z zewnątrz, czy pliki prywatne zwracają 403 albo 404.

## Licencja

MIT, autor: Bartosz Sokoliński. Szczegóły w plikach [LICENSE](../LICENSE) i [NOTICE](../NOTICE) w głównym katalogu repozytorium. Licencja nie obejmuje logo BS.
