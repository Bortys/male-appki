<?php
/* =========================================================================
   PRZYBORNIK · konfiguracja
   Plik jest opcjonalny: bez niego Przybornik działa od razu, bez hasła.
   Na serwerze nazywa się przybornik/konfiguracja.php i nie trafia do
   repozytorium. Żeby zamknąć stronę hasłem, wejdź na
   sokolinski.com/przybornik/?haslo, wpisz hasło, a strona pokaże gotową
   treść do wklejenia tutaj.
   ========================================================================= */

// Skrót hasła (password_hash). Pusty = strona otwarta, bez logowania.
const HASLO_HASH = '';

// Losowy sekret, którym podpisywane jest ciasteczko sesji (co najmniej 32 znaki).
// Zmiana sekretu albo hasła wylogowuje wszystkie urządzenia.
const SEKRET = '';

// Opcjonalnie: największy plik przyjmowany przez Ściskacz i Kadrownik, w megabajtach.
// const MAKS_PLIK_MB = 100;

// Opcjonalnie: odnośniki w grupie „Moje aplikacje” (chmura słów, skracacz), np. przy instalacji
// pod inną domeną. Każdy wpis: [etykieta, adres, opis]. Pusta tablica dla klucza ukrywa odnośniki.
// const APLIKACJE = [
//     'chmura'   => [['Panel', 'https://example.com/chmura/admin.php', 'Ankiety i eksport.']],
//     'skracacz' => [['Panel', 'https://go.example.com/admin', 'Krótkie linki.']],
// ];

// Opcjonalnie: ile żądań obróbki zdjęć na godzinę przyjmie serwer z jednego adresu i łącznie.
// const LIMIT_NA_ADRES = 400;
// const LIMIT_LACZNIE = 3000;
