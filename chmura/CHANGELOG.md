# Zmiany

## v2, 3 listopada 2026

Poprawki po audycie bezpieczeństwa.

**Bezpieczeństwo**

- Hasło do panelu jako skrót (`ADMIN_HASLO_HASH`) z generatorem w panelu. Starsze jawne hasło działa dalej, z ostrzeżeniem. Hasło domyślne `zmien-mnie-2026` nigdy nie wpuszcza.
- Limit logowania liczony po skrócie adresu, przed sprawdzeniem hasła i niezależnie od sesji. Blokada zwraca 429 zamiast usypiać proces serwera. Przy ataku z wielu adresów nowy adres ma jedną szansę, więc właściciel nadal wejdzie. Logowanie z obcych stron jest odrzucane.
- Instrukcja nie leży już w katalogu publicznym. `.htaccess` blokuje też pliki `.md`, a `wspolne.php` samo odrzuca bezpośrednie wejście.
- Ścisła polityka CSP w `.htaccess` chmury, bo ta z głównego `.htaccess` strony nadpisywała nagłówek z PHP.
- Sesja: tryb ścisły, ciasteczko tylko pod `/chmura/`, wylogowanie po 2 godzinach bezczynności.
- Komunikaty panelu w sesji zamiast w adresie (`?info=`), więc nie da się podstawić tekstu w linku.
- Błędy PHP nie są pokazywane na stronie, a komunikat dla gościa nie zdradza nazw katalogów.

**Niezawodność**

- Słowo `constructor` nie zamraża już chmury. Dotyczy `zasoby/chmura.js`, ładowanego teraz z `?v=2`, bo główny `.htaccess` strony każe przeglądarkom trzymać JS przez rok.
- Zapis atomowy (plik tymczasowy i rename, osobny plik blokady). Pod obciążeniem stara wersja zwracała pustą chmurę w 6,5% odczytów, a formularz wracał do osób, które już odpowiedziały. Nowa wersja: 0 błędnych odczytów na ponad 6900 w siedmiu przebiegach, bez zgubionych zapisów.
- Uszkodzony plik danych nie jest nadpisywany pustym stanem. Odrzucona wysyłka nie przepisuje pliku.

**Spam**

- Limit odpowiedzi w ankiecie (`MAKS_ODPOWIEDZI`, domyślnie 5000), osobny `LIMIT_NA_SIEC` z własnym komunikatem.
- W panelu: zerowanie limitów wysyłek i usuwanie odpowiedzi z ostatnich minut. Panel pokazuje 500 najczęstszych słów, więc otwiera się też przy zalewie.
- Formularz bez znacznika czasu jest odrzucany. Wysyłka z obcych stron jest odrzucana.
- Czarna lista bez fałszywych trafień: krótkie rdzenie liczą się od początku wyrazu („principal”, „podsłuchuj” przechodzą).

**Prywatność**

- Ciasteczko dopiero po wysłaniu odpowiedzi, tylko pod `/chmura/`, na 2 godziny zamiast roku na całą domenę. Stare ciasteczko jest kasowane.
- Skrót adresu IP zmienia się codziennie i znika przy pierwszym odczycie po godzinie, a nie dopiero przy kolejnej wysyłce.
- Czas odpowiedzi zapisany z dokładnością do minuty, żeby nie dało się go połączyć ze skrótem adresu.
- Stopka mówi także o publicznej chmurze, skrócie adresu IP i słowach zostających w przeglądarce. Jest widoczna również w ramce.

**Poprawki**

- Kod `<iframe>` w panelu pokazuje właściwy adres `/chmura/` zamiast `/ankieta/`.
- Godziny w CSV w strefie Europe/Warsaw.

## v1, 23 października 2026

Stan wdrożony na sokolinski.com/chmura.
