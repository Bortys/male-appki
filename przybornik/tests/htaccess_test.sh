#!/bin/bash
# Sprawdza public_html/przybornik/.htaccess na Apache z macOS (osobna konfiguracja, port 18097, nic nie zostaje).
# Główny .htaccess symuluje szeroką politykę CSP ze strony sokolinski.com. PHP tu nie działa: test dotyczy
# tylko blokad, typów plików i nagłówków.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'httpd -f "$TMP/httpd.conf" -k stop 2>/dev/null; sleep 1; rm -rf "$TMP"' EXIT
mkdir -p "$TMP/www/przybornik"
( cd "$REPO/public_html/przybornik" && tar cf - --exclude lib --exclude konfiguracja.php . ) | ( cd "$TMP/www/przybornik" && tar xf - )
mkdir -p "$TMP/www/przybornik/lib/x"
echo 'export default 1;' > "$TMP/www/przybornik/lib/x/modul.mjs"
printf '\0asm' > "$TMP/www/przybornik/lib/x/program.wasm"
cat > "$TMP/www/.htaccess" <<'HT'
Options -Indexes
Header always set Content-Security-Policy "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:"
HT
echo 'SEKRET-KONFIG' > "$TMP/www/przybornik/konfiguracja.php"
echo 'SEKRET-PROBY'  > "$TMP/www/przybornik/dane/proby.json.php"
echo 'SEKRET-NOTATKA' > "$TMP/www/przybornik/notatka.md"
M=/usr/libexec/apache2
cat > "$TMP/httpd.conf" <<CONF
ServerName localhost
Listen 127.0.0.1:18097
PidFile $TMP/httpd.pid
ErrorLog $TMP/error.log
LoadModule mpm_prefork_module $M/mod_mpm_prefork.so
LoadModule unixd_module $M/mod_unixd.so
LoadModule authz_core_module $M/mod_authz_core.so
LoadModule authz_host_module $M/mod_authz_host.so
LoadModule dir_module $M/mod_dir.so
LoadModule mime_module $M/mod_mime.so
LoadModule headers_module $M/mod_headers.so
LoadModule expires_module $M/mod_expires.so
TypesConfig /private/etc/apache2/mime.types
DocumentRoot "$TMP/www"
<Directory "$TMP/www">
  AllowOverride All
  Require all granted
</Directory>
<Files ".ht*">
  Require all denied
</Files>
CONF
httpd -f "$TMP/httpd.conf" -k start || { echo "Apache nie wstał"; cat "$TMP/error.log"; exit 1; }
sleep 1
B=http://127.0.0.1:18097/przybornik
BLEDY=0
sprawdz() { # opis, oczekiwane, faktyczne
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "BŁĄD  $1: oczekiwane „$2”, jest „$3”"; BLEDY=$((BLEDY + 1)); fi
}
kod() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
naglowek() { curl -s -D - -o /dev/null "$1" | tr -d '\r' | grep -i "^$2: " | tail -1 | sed 's/^[^:]*: //'; }
for plik in konfiguracja.php wspolne.php obrazy.php dane/proby.json.php dane/ notatka.md .htaccess; do
  sprawdz "zablokowany $plik" 403 "$(kod $B/$plik)"
done
case "$(kod $B/zasoby/)" in 403|404) echo "ok    brak listowania zasoby/";; *) echo "BŁĄD  katalog zasoby/ da się wylistować"; BLEDY=$((BLEDY + 1));; esac
sprawdz "licencje.html dostępne" 200 "$(kod $B/licencje.html)"
sprawdz "styl dostępny" 200 "$(kod $B/zasoby/styl.css)"
sprawdz "typ .mjs" "text/javascript" "$(naglowek $B/lib/x/modul.mjs Content-Type)"
sprawdz "typ .wasm" "application/wasm" "$(naglowek $B/lib/x/program.wasm Content-Type)"
sprawdz "typ .ttf" "font/ttf" "$(naglowek $B/zasoby/fonty/Carlito-Bold.ttf Content-Type)"
sprawdz "skrypty bez starej kopii" "no-cache" "$(naglowek $B/zasoby/app.js Cache-Control)"
CSP="$(naglowek $B/zasoby/app.js Content-Security-Policy)"
case "$CSP" in *"'wasm-unsafe-eval'"*"frame-ancestors 'none'"*) echo "ok    CSP aplikacji zastępuje CSP strony";; *) echo "BŁĄD  CSP: $CSP"; BLEDY=$((BLEDY + 1));; esac
case "$CSP" in *"unsafe-inline"*|*"https:"*) echo "BŁĄD  CSP wciąż szeroka: $CSP"; BLEDY=$((BLEDY + 1));; *) echo "ok    CSP bez unsafe-inline i bez obcych źródeł";; esac
sprawdz "liczba nagłówków CSP" 1 "$(curl -s -D - -o /dev/null $B/zasoby/app.js | grep -ci '^content-security-policy')"
sprawdz "noindex" "noindex, nofollow" "$(naglowek $B/zasoby/app.js X-Robots-Tag)"
grep -E 'Invalid command|not allowed here|AH00526|AH01630.*zasoby' "$TMP/error.log" && BLEDY=$((BLEDY + 1))
echo; [ "$BLEDY" = 0 ] && echo "htaccess: wszystko w porządku" || { echo "htaccess: błędów: $BLEDY"; exit 1; }
