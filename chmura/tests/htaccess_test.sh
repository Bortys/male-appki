#!/bin/bash
# Sprawdza public_html/chmura/.htaccess na Apache z macOS (osobna konfiguracja, port 18096, nic nie zostaje).
# Główny .htaccess symuluje szeroką politykę CSP ze strony sokolinski.com.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'httpd -f "$TMP/httpd.conf" -k stop 2>/dev/null; sleep 1; rm -rf "$TMP"' EXIT
mkdir -p "$TMP/www"
cp -R "$REPO/public_html/chmura" "$TMP/www/chmura"
cat > "$TMP/www/.htaccess" <<'HT'
Options -Indexes
Header always set Content-Security-Policy "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:"
HT
echo 'SEKRET-KONFIG' > "$TMP/www/chmura/konfiguracja.php"
echo 'SEKRET-INSTR'  > "$TMP/www/chmura/INSTRUKCJA.md"
echo 'SEKRET-DANE'   > "$TMP/www/chmura/dane/ai-w-pracy.json.php"
M=/usr/libexec/apache2
cat > "$TMP/httpd.conf" <<CONF
ServerName localhost
Listen 127.0.0.1:18096
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
LoadModule expires_module $M/mod_expires.so
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
sprawdz() {
  kod="$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:18096$1")"
  if [ "$kod" = "$2" ]; then echo "ok   $1 -> $kod"; else echo "BŁĄD $1 -> $kod (oczekiwano $2)"; blad=1; fi
}
sprawdz /chmura/konfiguracja.php 403
sprawdz /chmura/wspolne.php 403
sprawdz /chmura/INSTRUKCJA.md 403
sprawdz /chmura/dane/ 403
sprawdz /chmura/dane/ai-w-pracy.json.php 403
sprawdz /chmura/dane/index.php 403
sprawdz /chmura/.htaccess 403
sprawdz /chmura/zasoby/ankieta.css 200
sprawdz /chmura/zasoby/chmura.js 200
csp="$(curl -sI -m 5 http://127.0.0.1:18096/chmura/zasoby/ankieta.css | grep -i '^content-security-policy')"
if grep -q unsafe <<<"$csp"; then echo "BŁĄD CSP chmury nie nadpisuje CSP strony: $csp"; blad=1; else echo "ok   CSP: ${csp:0:70}…"; fi
exit $blad
