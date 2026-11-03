#!/bin/bash
# Paczka do wgrania na serwer, zbudowana z zatwierdzonego kodu (git archive).
# Dzięki temu nie trafi do niej config.php, baza ani nic spoza repozytorium.
# Użycie: scripts/paczka.sh [nazwa]
set -eu
cd "$(dirname "$0")/.."
NAZWA="${1:-skracacz-$(git rev-parse --short HEAD)}"
mkdir -p dist
# git archive w podkatalogu obcina ścieżki, więc uruchamiamy go z głównego katalogu repozytorium
git -C "$(git rev-parse --show-toplevel)" archive --format=zip -o "$PWD/dist/$NAZWA.zip" HEAD:skracacz/public_html
echo "dist/$NAZWA.zip"
unzip -Z1 "dist/$NAZWA.zip" | grep -v -E 'assets/fonts/'
