#!/bin/bash
# Paczka do wgrania na serwer, zbudowana z zatwierdzonego kodu (git archive).
# Dzięki temu nie trafi do niej konfiguracja.php ani odpowiedzi z dane/.
# Rozpakowana w public_html tworzy katalog chmura/. Użycie: scripts/paczka.sh [nazwa]
set -eu
cd "$(dirname "$0")/.."
NAZWA="${1:-chmura-$(git rev-parse --short HEAD)}"
mkdir -p dist
# git archive w podkatalogu obcina ścieżki, więc uruchamiamy go z głównego katalogu repozytorium
git -C "$(git rev-parse --show-toplevel)" archive --format=zip -o "$PWD/dist/$NAZWA.zip" HEAD:chmura/public_html
echo "dist/$NAZWA.zip"
unzip -Z1 "dist/$NAZWA.zip" | grep -v -E 'fonty/'
