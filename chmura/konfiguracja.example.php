<?php
/* =========================================================================
   ANKIETA → CHMURA SŁÓW · konfiguracja
   To jedyny plik, który trzeba edytować. Na serwerze nazywa się konfiguracja.php
   i nie trafia do repozytorium.
   ========================================================================= */

// Skrót hasła do panelu. Zostaw pusty, wejdź na chmura/admin.php i wpisz hasło:
// panel pokaże gotowy wiersz do wklejenia tutaj.
const ADMIN_HASLO_HASH = '';

// Ile słów może wpisać jedna osoba w jednym podejściu (1–5).
const SLOW_NA_OSOBE = 3;

// Maksymalna długość jednego hasła (w znakach). 32 znaki mieszczą 2–3 słowa.
const MAKS_DLUGOSC = 32;

// Ile razy na godzinę jedno urządzenie może wysłać odpowiedź do jednej ankiety.
// Na warsztacie, gdy wszyscy siedzą w jednej sieci Wi-Fi, limit liczy się
// po ciasteczku przeglądarki, a po adresie IP dopiero od tej wartości razy 30.
const LIMIT_NA_GODZINE = 3;

// Ile odpowiedzi na godzinę może przyjść z jednego adresu IP (jedna sieć Wi-Fi).
// Przy sali większej niż 90 osób podnieś przed wydarzeniem.
const LIMIT_NA_SIEC = 90;

// Górny limit odpowiedzi w jednej ankiecie. Chroni serwer przed zalaniem spamem.
const MAKS_ODPOWIEDZI = 5000;

// Słowa odrzucane od razu (małe litery, bez polskich znaków też działa).
// Panel pozwala ukryć każde hasło ręcznie – ta lista to tylko pierwszy filtr.
const CZARNA_LISTA = [
    'kurwa', 'kurwy', 'chuj', 'huj', 'pierdol', 'jebac', 'jebać', 'jebany',
    'pizda', 'cipa', 'kutas', 'skurwysyn', 'spierdalaj', 'wypierdalaj',
    'dupa', 'fuck', 'shit',
];

/* -------------------------------------------------------------------------
   Ankiety. Każda ma własny adres:  sokolinski.com/chmura/?a=<klucz>
   Bez ?a= otwiera się pierwsza z listy.
   'otwarta' => false zamyka formularz, chmura dalej się wyświetla.
   ------------------------------------------------------------------------- */
const ANKIETY = [
    'ai-w-pracy' => [
        'pytanie'  => 'Z czym kojarzy ci się AI w twojej pracy?',
        'opis'     => 'Wpisz do trzech słów albo krótkich haseł. Odpowiedzi są anonimowe.',
        'otwarta'  => true,
    ],
    'warsztat' => [
        'pytanie'  => 'Co zabierasz z dzisiejszego warsztatu?',
        'opis'     => 'Jedno, dwa albo trzy słowa. Wynik zobaczysz od razu.',
        'otwarta'  => true,
    ],
];
