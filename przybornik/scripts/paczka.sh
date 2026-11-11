#!/bin/bash
# Paczka do wgrania na serwer. Rozpakowana w public_html tworzy katalog przybornik/.
# Bierze pliki z dysku (biblioteki z lib/ nie są w repozytorium), ale pomija sekrety,
# dane i wszystko, czego git nie zna poza lib/. Użycie: scripts/paczka.sh [nazwa]
set -eu
cd "$(dirname "$0")/.."
[ -d public_html/przybornik/lib/gs ] || { echo "Brak bibliotek. Uruchom najpierw scripts/biblioteki.sh" >&2; exit 1; }
WERSJA="$(sed -n "s/^const WERSJA = '\(.*\)';/\1/p" public_html/przybornik/wspolne.php)"
NAZWA="${1:-przybornik-$WERSJA}"
mkdir -p dist
rm -f "dist/$NAZWA.zip"
LISTA="$(mktemp)"
trap 'rm -f "$LISTA"' EXIT
( cd public_html && {
    git ls-files --cached --others --exclude-standard -- przybornik
    find przybornik/lib -type f
  } | grep -v -E '(^|/)\.DS_Store$|^przybornik/konfiguracja\.php$|^przybornik/dane/proby' | sort -u > "$LISTA"
  zip -q -X "../dist/$NAZWA.zip" -@ < "$LISTA" )
echo "dist/$NAZWA.zip ($(du -h "dist/$NAZWA.zip" | cut -f1), $(wc -l < "$LISTA" | tr -d ' ') plików)"
unzip -Z1 "dist/$NAZWA.zip" | grep -E 'konfiguracja\.php|proby' && { echo "W paczce są sekrety" >&2; exit 1; } || true
