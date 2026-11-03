<?php
// ===== KONFIGURACJA SKRACACZA =====

// Hash hasła do panelu. Zostaw pusty przy pierwszym uruchomieniu:
// wejdź na /admin, wpisz hasło, a panel pokaże hash do wklejenia tutaj.
const ADMIN_PASSWORD_HASH = '';

// Klucz API (długi, losowy ciąg). Pusty = API wyłączone.
// Przykład wygenerowania: panel /admin pokazuje propozycję przy pierwszym uruchomieniu.
const API_KEY = '';

// Dokąd kierować wejście na sam adres domeny (np. https://sokolinski.com). Pusty = prosta strona.
const HOME_REDIRECT = '';

// Długość losowego kodu
const CODE_LENGTH = 6;

// Ścieżka do bazy (katalog data/ jest zablokowany przez .htaccess)
const DB_PATH = __DIR__ . '/data/links.sqlite';
