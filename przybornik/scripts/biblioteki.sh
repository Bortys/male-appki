#!/bin/bash
# Pobiera biblioteki przeglądarkowe w przypiętych wersjach (npm) i układa je w public_html/przybornik/lib.
# Katalog lib/ nie jest w repozytorium (39 MB), ale trafia do paczki. Użycie: scripts/biblioteki.sh
set -eu
cd "$(dirname "$0")/.."
LIB="$PWD/public_html/przybornik/lib"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
( cd "$TMP" && npm init -y >/dev/null && npm install --ignore-scripts --no-audit --no-fund \
    pdf-lib@1.17.1 pdfjs-dist@6.5.438 fflate@0.8.3 tesseract.js@7.0.0 tesseract.js-core@7.0.0 \
    @tesseract.js-data/pol@1.0.0 @tesseract.js-data/eng@1.0.0 @jspawn/ghostscript-wasm@0.0.2 \
    mediabunny@1.65.2 @mediabunny/mp3-encoder@1.65.2 qrcode-generator@1.4.4 >/dev/null )
N="$TMP/node_modules"
rm -rf "$LIB"
mkdir -p "$LIB"/{pdf-lib,pdfjs,fflate,tesseract/rdzen,tesseract/jezyki,gs,mediabunny,mp3,qrcode}

# Pliki .md są na serwerze zablokowane (.htaccess), dlatego licencje dostają rozszerzenie .txt
cp "$N/pdf-lib/dist/pdf-lib.esm.min.js" "$LIB/pdf-lib/" && cp "$N/pdf-lib/LICENSE.md" "$LIB/pdf-lib/LICENSE.txt"

cp "$N/pdfjs-dist/build/pdf.min.mjs" "$N/pdfjs-dist/build/pdf.worker.min.mjs" "$N/pdfjs-dist/LICENSE" "$LIB/pdfjs/"
cp -R "$N/pdfjs-dist/wasm" "$N/pdfjs-dist/standard_fonts" "$N/pdfjs-dist/iccs" "$LIB/pdfjs/"

cp "$N/fflate/esm/browser.js" "$N/fflate/LICENSE" "$LIB/fflate/"

cp "$N/tesseract.js/dist/tesseract.esm.min.js" "$N/tesseract.js/dist/worker.min.js" "$LIB/tesseract/" && cp "$N/tesseract.js/LICENSE.md" "$LIB/tesseract/LICENSE.txt"
cp "$N/tesseract.js-core"/tesseract-core-{lstm,simd-lstm,relaxedsimd-lstm}.wasm.js "$LIB/tesseract/rdzen/"
cp "$N/@tesseract.js-data/pol/4.0.0_best_int/pol.traineddata.gz" "$N/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz" "$LIB/tesseract/jezyki/"

cp "$N/@jspawn/ghostscript-wasm/gs.js" "$N/@jspawn/ghostscript-wasm/gs.wasm" "$N/@jspawn/ghostscript-wasm/LICENSE" "$LIB/gs/"

cp "$N/mediabunny/dist/bundles/mediabunny.min.mjs" "$N/mediabunny/LICENSE" "$LIB/mediabunny/"

# Koder MP3 (LAME jako WebAssembly) importuje „mediabunny” po nazwie pakietu. Przeglądarka bez mapy importów
# takiej nazwy nie zna, więc import wskazuje plik obok. Ten sam adres co w narzędziach daje ten sam moduł,
# a tylko wtedy zarejestrowany koder jest widoczny dla Mediabunny.
sed 's#from"mediabunny"#from"../mediabunny/mediabunny.min.mjs"#' \
  "$N/@mediabunny/mp3-encoder/dist/bundles/mediabunny-mp3-encoder.min.mjs" > "$LIB/mp3/mediabunny-mp3-encoder.min.mjs"
grep -q 'from"../mediabunny/mediabunny.min.mjs"' "$LIB/mp3/mediabunny-mp3-encoder.min.mjs" \
  || { echo "Koder MP3: nie znalazłem importu mediabunny do podmiany" >&2; exit 1; }
cp "$N/@mediabunny/mp3-encoder/LICENSE" "$LIB/mp3/"
cp "$N/@mediabunny/mp3-encoder/licenses/lame/LICENSE" "$LIB/mp3/LAME-LICENSE.txt"
cp "$N/@mediabunny/mp3-encoder/licenses/lame/COPYING" "$LIB/mp3/LAME-COPYING.txt"

cp "$N/qrcode-generator/qrcode.js" "$N/qrcode-generator/LICENSE" "$LIB/qrcode/" 2>/dev/null || cp "$N/qrcode-generator/qrcode.js" "$LIB/qrcode/"

du -sh "$LIB"
