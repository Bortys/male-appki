# Zmiany

## v4, 3 listopada 2026

Poprawki po audycie bezpieczeństwa.

**Bezpieczeństwo**

- `.htaccess` przepuszcza z zewnątrz tylko `assets/` i potwierdzenia Let's Encrypt. Reszta trafia do `index.php`, więc `diag.php`, `README.md` czy inny zapomniany plik nie będą już dostępne.
- Limit logowania liczony w bazie po skrócie adresu IP, przed sprawdzeniem hasła, a nie w sesji, którą można było zaczynać od nowa. Blokada zwraca 429 zamiast usypiać proces serwera. Przy ataku z wielu adresów nowy adres ma jedną szansę, więc właściciel nadal wejdzie.
- API tylko przez POST. **Zmiana niezgodna wstecz:** `GET /api?key=...` zwraca 405, bo klucz w adresie trafiał do logów i historii przeglądarki.
- Nagłówki: CSP, HSTS, `X-Frame-Options` na wszystkich stronach. W panelu `Referrer-Policy: no-referrer`.
- Sesja: tryb ścisły, wylogowanie po 2 godzinach bezczynności, wylogowanie tylko przez POST z CSRF.
- Panel bez skryptów w HTML: kopiowanie i potwierdzenie usunięcia w `assets/admin.js`.
- Nagłówek `Host` sprawdzany, zanim trafi do adresów. Błędy PHP nie są pokazywane na stronie.

**Niezawodność**

- Awaria licznika kliknięć nie blokuje przekierowania. Wcześniej zablokowana baza dawała błąd 500 zamiast przejścia pod adres docelowy.
- Niedostępna baza daje czytelną stronę 503.
- Komunikat „alias zajęty” tylko przy zajętym aliasie. Inne błędy zapisu mają własny komunikat i trafiają do logu.

**Statystyki**

- Licznik pomija żądania HEAD, wczytywanie na zapas, puste nagłówki przeglądarki i kolejne automaty.
- Równoległe wejścia nie gubią już kliknięć.

## v3, 2 listopada 2026

Panel w marce BS. Paczka aktualizująca, bez `config.php`, `data/` i `diag.php`.

## v2, 2 listopada 2026

Diagnostyka (`diag.php`) i poprawki pod Zenbox: wykrywanie HTTPS za proxy, praca w podkatalogu.

## v1, 1 listopada 2026

Pierwsza wersja.
