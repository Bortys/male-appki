#!/bin/bash
# Sprawdza reguły public_html/.htaccess na Apache z macOS (osobna konfiguracja, port 18092, nic nie zostaje).
# Apache nie ma tu PHP, więc po treści odpowiedzi widać, który plik został wybrany.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'httpd -f "$TMP/httpd.conf" -k stop 2>/dev/null; sleep 1; rm -rf "$TMP"' EXIT
cp -R "$REPO/public_html" "$TMP/www"
echo 'SEKRET-CONFIG' > "$TMP/www/config.php"
echo 'SEKRET-DIAG'   > "$TMP/www/diag.php"
echo 'SEKRET-README' > "$TMP/www/README.md"
mkdir -p "$TMP/www/data" "$TMP/www/.well-known/acme-challenge"
echo 'SEKRET-BAZA'   > "$TMP/www/data/links.sqlite"
echo 'token-acme'    > "$TMP/www/.well-known/acme-challenge/test"
M=/usr/libexec/apache2
cat > "$TMP/httpd.conf" <<CONF
ServerName localhost
Listen 127.0.0.1:18092
PidFile $TMP/httpd.pid
ErrorLog $TMP/error.log
LoadModule mpm_prefork_module $M/mod_mpm_prefork.so
LoadModule unixd_module $M/mod_unixd.so
LoadModule authz_core_module $M/mod_authz_core.so
LoadModule authz_host_module $M/mod_authz_host.so
LoadModule dir_module $M/mod_dir.so
LoadModule mime_module $M/mod_mime.so
LoadModule rewrite_module $M/mod_rewrite.so
LoadModule headers_module $M/mod_headers.so
DocumentRoot "$TMP/www"
<Directory "$TMP/www">
  AllowOverride All
  Require all granted
</Directory>
<Files ".ht*">
  Require all denied
</Files>
CONF
httpd -f "$TMP/httpd.conf" -k start || { cat "$TMP/error.log"; exit 1; }
sleep 1
blad=0
sprawdz() { # ścieżka, oczekiwany kod, tekst, którego ma nie być (opcjonalnie)
  tresc="$(curl -s -m 5 -w '\n%{http_code}' "http://127.0.0.1:18092$1")"
  kod="${tresc##*$'\n'}"
  if [ "$kod" != "$2" ] || { [ -n "${3:-}" ] && grep -q "$3" <<<"$tresc"; }; then
    echo "BŁĄD $1 -> $kod (oczekiwano $2)"; blad=1
  else
    echo "ok   $1 -> $kod"
  fi
}
# Bez PHP Apache zwraca index.php jako tekst, czyli 200 oznacza przejście przez router aplikacji.
sprawdz /config.php 403 SEKRET
sprawdz /diag.php 403 SEKRET
sprawdz /README.md 403 SEKRET
sprawdz /data/links.sqlite 403 SEKRET
sprawdz /lib_admin.php 403 ADMIN_PASSWORD_HASH
sprawdz /.htaccess 403
sprawdz /assets/bs.css 200
sprawdz /.well-known/acme-challenge/test 200
sprawdz /jakis-kod 200 SEKRET
sprawdz /admin 200 SEKRET
sprawdz /assets/ 404
exit $blad
