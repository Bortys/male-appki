#!/usr/bin/env python3
"""Testy części serwerowej Przybornika w Dockerze (PHP z Imagick, obraz z tests/Dockerfile).

Uruchomienie z katalogu repozytorium:   python3 tests/uruchom.py
Inna wersja PHP:                        PHP=8.1 python3 tests/uruchom.py
Działa na kopii kodu w katalogu tymczasowym, z losowym hasłem. Nie dotyka serwera ani konfiguracja.php.
"""
import base64
import http.cookiejar
import io
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KOD = os.path.join(REPO, 'public_html', 'przybornik')
PHP = os.environ.get('PHP', '8.4')
OBRAZ = f'przybornik-test:{PHP}'
PORT = 18112
URL = f'http://127.0.0.1:{PORT}/przybornik'
HASLO = secrets.token_urlsafe(18)
KONTENER = f'przybornik-test-{secrets.token_hex(4)}'

# Najmniejszy JPEG 1×1 z blokiem EXIF, w którym siedzi nazwa aparatu
JPEG_Z_EXIF = (base64.b64decode('/9j/4AAQSkZJRgABAQEASABIAAA=')
               + b'\xff\xe1\x00\x2aExif\x00\x00MM\x00*\x00\x00\x00\x08\x00\x01\x01\x0f\x00\x02\x00\x00\x00\x0a\x00\x00\x00\x1a\x00\x00\x00\x00TajnyApar\x00'
               + base64.b64decode('/9sAQwADAgICAgIDAgICAwMDAwQGBAQEBAQIBgYFBgkICgoJCAkJCgwPDAoLDgsJCQ0RDQ4PEBAREAoMEhMSEBMPEBAQ/8kACwgAAQABAQERAP/MAAYAEBAF/9oACAEBAAA/ANLPIP/Z'))


def docker(*argumenty, **kw):
    return subprocess.run(['docker', *argumenty], capture_output=True, text=True, check=True, **kw)


W_KONTENERZE = '/t/public_html/przybornik'


def w_kontenerze(*polecenie, wejscie=None):
    """Pliki zmieniamy i czytamy wewnątrz kontenera, żeby nie zależeć od synchronizacji katalogu
    współdzielonego. Serwer testowy ma też wyłączony opcache: z nim PHP przez 2 sekundy
    trzyma starą wersję pliku i testy zmieniające konfigurację padały losowo."""
    return subprocess.run(['docker', 'exec', '-i', KONTENER, *polecenie], input=wejscie, capture_output=True, text=True, check=True).stdout


def ustaw_konfiguracje(tresc):
    if tresc is None:
        w_kontenerze('rm', '-f', f'{W_KONTENERZE}/konfiguracja.php')
    else:
        w_kontenerze('sh', '-c', f'cat > {W_KONTENERZE}/konfiguracja.php', wejscie=tresc)


def czytaj_dane(nazwa):
    return w_kontenerze('cat', f'{W_KONTENERZE}/dane/{nazwa}')


class BezPrzekierowan(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


class Klient:
    """Przeglądarka w pigułce: ciasteczka, żeton, formularze wieloczęściowe."""

    def __init__(self):
        self.ciastka = http.cookiejar.CookieJar()
        self.otwieracz = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.ciastka), BezPrzekierowan)
        self.zeton = ''

    def zadanie(self, sciezka, pola=None, pliki=None, naglowki=None):
        dane = None
        naglowki = dict(naglowki or {})
        if pliki:
            granica = secrets.token_hex(12)
            czesci = []
            for nazwa, wartosc in (pola or {}).items():
                czesci.append(f'--{granica}\r\nContent-Disposition: form-data; name="{nazwa}"\r\n\r\n{wartosc}\r\n'.encode())
            for nazwa, (nazwa_pliku, tresc) in pliki.items():
                czesci.append(f'--{granica}\r\nContent-Disposition: form-data; name="{nazwa}"; filename="{nazwa_pliku}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + tresc + b'\r\n')
            dane = b''.join(czesci) + f'--{granica}--\r\n'.encode()
            naglowki['Content-Type'] = f'multipart/form-data; boundary={granica}'
        elif pola is not None:
            dane = urllib.parse.urlencode(pola).encode()
        try:
            odp = self.otwieracz.open(urllib.request.Request(URL + sciezka, data=dane, headers=naglowki), timeout=120)
        except urllib.error.HTTPError as e:
            odp = e
        return odp.status, odp.read(), odp.headers

    def zaloguj(self, haslo=HASLO):
        kod, tresc, _ = self.zadanie('/', {'haslo': haslo})
        if kod == 303:
            _, strona, _ = self.zadanie('/')
            m = re.search(r'przybornik-zeton" content="([0-9a-f]{64})"', strona.decode())
            self.zeton = m.group(1) if m else ''
        return kod, tresc.decode()

    def api(self, akcja, pola=None, plik=None, nazwa='plik.jpg', zeton=None):
        kod, tresc, naglowki = self.zadanie(f'/api.php?akcja={akcja}', pola or {}, {'plik': (nazwa, plik)} if plik is not None else {'pusty': ('x', b'')},
                                            {'X-Przybornik': self.zeton if zeton is None else zeton})
        info = {}
        if naglowki.get('X-Przybornik-Info'):
            info = json.loads(base64.b64decode(naglowki['X-Przybornik-Info']))
        return kod, tresc, info


def wymiary_jpeg(dane):
    """Szerokość i wysokość z nagłówka SOF."""
    i = 2
    while i < len(dane):
        znacznik, dlugosc = dane[i + 1], int.from_bytes(dane[i + 2:i + 4], 'big')
        if znacznik in (0xC0, 0xC1, 0xC2):
            return int.from_bytes(dane[i + 7:i + 9], 'big'), int.from_bytes(dane[i + 5:i + 7], 'big')
        i += 2 + dlugosc
    raise ValueError('brak SOF')


class Przybornik(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not docker('images', '-q', OBRAZ).stdout.strip():
            print(f'Buduję obraz {OBRAZ} (kilka minut, tylko za pierwszym razem)…', file=sys.stderr)
            docker('build', '-q', '--build-arg', f'PHP={PHP}', '-t', OBRAZ, '-f', os.path.join(REPO, 'tests', 'Dockerfile'), os.path.join(REPO, 'tests'))
        cls.tmp = tempfile.mkdtemp(prefix='przybornik-test-')
        cls.www = os.path.join(cls.tmp, 'public_html')
        shutil.copytree(KOD, os.path.join(cls.www, 'przybornik'), ignore=shutil.ignore_patterns('lib', 'konfiguracja.php', 'proby.json.php'))
        shutil.copy(os.path.join(REPO, 'tests', 'router.php'), cls.tmp)
        cls.konfig = os.path.join(cls.www, 'przybornik', 'konfiguracja.php')
        cls.proby = os.path.join(cls.www, 'przybornik', 'dane', 'proby.json.php')
        cls.limity = os.path.join(cls.www, 'przybornik', 'dane', 'limity.json.php')
        skrot = docker('run', '--rm', '-e', f'H={HASLO}', OBRAZ, 'php', '-r', 'echo password_hash(getenv("H"), PASSWORD_DEFAULT);').stdout
        cls.tresc_konfig = f"<?php\nconst HASLO_HASH = '{skrot}';\nconst SEKRET = '{secrets.token_hex(32)}';\n"
        # Zdjęcia testowe: szum z gradientem (trudny do ściśnięcia) i PNG z przezroczystością
        docker('run', '--rm', '-v', f'{cls.tmp}:/t', OBRAZ, 'php', '-r', '''
            $im = new Imagick(); $im->newPseudoImage(3000, 2000, "plasma:fractal"); $im->setImageFormat("jpeg");
            $im->setImageCompressionQuality(95); $im->writeImage("/t/foto.jpg");
            $p = new Imagick(); $p->newImage(400, 300, new ImagickPixel("transparent")); $p->setImageFormat("png"); $p->writeImage("/t/przezroczysty.png");
            $n = new Imagick(); $n->newPseudoImage(1200, 800, "plasma:fractal"); $n->setImageFormat("jpeg"); $n->setImageCompressionQuality(12); $n->writeImage("/t/niska.jpg");
        ''')
        cls.foto = open(os.path.join(cls.tmp, 'foto.jpg'), 'rb').read()
        cls.heic = open(os.path.join(REPO, 'tests', 'probki', 'foto.heic'), 'rb').read()       # 1200×800, zrobione przez sips
        cls.png = open(os.path.join(cls.tmp, 'przezroczysty.png'), 'rb').read()
        cls.niska = open(os.path.join(cls.tmp, 'niska.jpg'), 'rb').read()       # JPEG o jakości 12
        docker('run', '-d', '--rm', '--name', KONTENER, '-p', f'127.0.0.1:{PORT}:8000', '-v', f'{cls.tmp}:/t', OBRAZ,
               'php', '-d', 'upload_max_filesize=64M', '-d', 'post_max_size=64M', '-d', 'opcache.enable=0', '-d', 'realpath_cache_ttl=0', '-S', '0.0.0.0:8000', '-t', '/t/public_html', '/t/router.php')
        for _ in range(50):
            try:
                urllib.request.urlopen(URL + '/licencje.html', timeout=1)
                break
            except Exception:
                time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['docker', 'rm', '-f', KONTENER], capture_output=True)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def setUp(self):
        ustaw_konfiguracje(self.tresc_konfig)
        w_kontenerze('rm', '-f', f'{W_KONTENERZE}/dane/proby.json.php', f'{W_KONTENERZE}/dane/limity.json.php')

    def bez_hasla(self, dodatki=''):
        """Tryb otwarty: brak konfiguracji albo konfiguracja bez hasła (same limity)."""
        ustaw_konfiguracje(f'<?php\n{dodatki}\n' if dodatki else None)
        k = Klient()
        k.zeton = 'otwarte'
        return k

    def zalogowany(self):
        k = Klient()
        self.assertEqual(k.zaloguj()[0], 303)
        self.assertEqual(len(k.zeton), 64)
        return k

    # --- Konfiguracja i logowanie ---------------------------------------------

    def test_bez_konfiguracji_strona_jest_otwarta(self):
        k = self.bez_hasla()
        strona = k.zadanie('/')[1].decode()
        self.assertIn('przybornik-zeton" content="otwarte"', strona)
        self.assertIn('href="?haslo"', strona)
        for slowo in ('Zaloguj się', 'Wyloguj', 'Ustaw hasło'):
            self.assertNotIn(slowo, strona)
        # grupa „Moje aplikacje”: odnośniki do chmury i skracacza, bez modułu JS
        self.assertIn('id="n-chmura" data-id="chmura" data-statyczne="1"', strona)
        self.assertIn('href="https://sokolinski.com/chmura/admin.php" target="_blank" rel="noopener"', strona)
        self.assertIn('href="https://go.sokolinski.com/admin"', strona)
        kod, dane, _ = k.api('sciskaj', {'limit_kb': 300}, self.foto)
        self.assertEqual(kod, 200, dane[:200])
        self.assertLessEqual(len(dane), 300 * 1024)
        kod, dane, _ = k.api('kadruj', {'formaty': json.dumps([{'id': 'kwadrat-1x1', 'w': 1080, 'h': 1080}])}, self.foto)
        self.assertEqual((kod, dane[:2]), (200, b'PK'))
        for plik in ('konfiguracja.php', 'wspolne.php', 'obrazy.php', 'dane/limity.json.php'):
            self.assertEqual(k.zadanie('/' + plik)[0], 403, plik)

    def test_otwarta_ale_nie_dla_obcych_stron(self):
        k = self.bez_hasla()
        wyslij = lambda naglowki: k.zadanie('/api.php?akcja=podglad', {'bok': 200}, {'plik': ('a.jpg', JPEG_Z_EXIF)}, naglowki)[0]
        self.assertEqual(wyslij({}), 403)                                   # zwykły formularz z innej witryny nie doda nagłówka
        self.assertEqual(wyslij({'X-Przybornik': 'otwarte'}), 200)
        self.assertEqual(wyslij({'X-Przybornik': 'otwarte', 'Origin': f'http://127.0.0.1:{PORT}', 'Sec-Fetch-Site': 'same-origin'}), 200)
        for obce in ({'Origin': 'https://obca.example'}, {'Sec-Fetch-Site': 'cross-site'}, {'Sec-Fetch-Site': 'same-site'},
                     {'Origin': f'http://127.0.0.1.obca.example:{PORT}'}):
            self.assertEqual(wyslij({'X-Przybornik': 'otwarte', **obce}), 403, obce)
        self.assertEqual(k.zadanie('/api.php?akcja=podglad', naglowki={'X-Przybornik': 'otwarte'})[0], 405)

    def test_aplikacje_z_konfiguracji(self):
        k = self.bez_hasla("const APLIKACJE = ['chmura' => [['Panel <b>', 'https://example.com/a?x=1&y=2', 'Opis']]];")
        strona = k.zadanie('/')[1].decode()
        self.assertIn('href="https://example.com/a?x=1&amp;y=2"', strona)
        self.assertIn('Panel &lt;b&gt; ↗', strona)
        self.assertNotIn('go.sokolinski.com', strona)
        self.assertIn('id="n-skracacz" data-id="skracacz" hidden', strona)     # bez odnośników zostaje zwykłą sekcją

    def test_limit_zadan_na_godzine(self):
        k = self.bez_hasla('const LIMIT_NA_ADRES = 3;')
        self.assertIn('content="otwarte"', k.zadanie('/')[1].decode())      # sama stała limitu nie zamyka strony
        kody = [k.api('podglad', {'bok': 200}, JPEG_Z_EXIF)[0] for _ in range(5)]
        self.assertEqual(kody, [200, 200, 200, 429, 429])
        limity = czytaj_dane('limity.json.php')
        self.assertTrue(limity.startswith('<?php http_response_code(404); exit; ?>'))
        self.assertNotRegex(limity, r'\d+\.\d+\.\d+\.\d+')
        self.assertEqual(json.loads(limity.split('\n', 1)[1])['w'], 3)

    def test_haslo_jest_opcja(self):
        k = self.bez_hasla()
        self.assertIn('Ustaw hasło', k.zadanie('/?haslo')[1].decode())
        self.assertIn('co najmniej 12 znaków', k.zadanie('/?haslo', {'nowe_haslo': 'krotkie'})[1].decode())
        strona = k.zadanie('/?haslo', {'nowe_haslo': 'dlugie-haslo-testowe'})[1].decode()
        self.assertRegex(strona, r"const HASLO_HASH = &#039;\$2y\$")
        self.assertRegex(strona, r'const SEKRET = &#039;[0-9a-f]{64}&#039;')
        self.assertNotIn('dlugie-haslo-testowe', strona)
        # po wgraniu konfiguracji strona się zamyka, a ?haslo niczego już nie pokazuje
        ustaw_konfiguracje(self.tresc_konfig)
        for adres in ('/', '/?haslo'):
            strona = k.zadanie(adres)[1].decode()
            self.assertIn('Zaloguj się', strona)
            self.assertNotIn('Ustaw hasło', strona)
        self.assertEqual(k.api('sciskaj', plik=self.foto)[0], 401)

    def test_bez_logowania_nic_nie_dziala(self):
        k = Klient()
        kod, strona, naglowki = k.zadanie('/')
        self.assertIn('Zaloguj się', strona.decode())
        self.assertNotIn('przybornik-zeton', strona.decode())
        self.assertIn("frame-ancestors 'none'", naglowki['Content-Security-Policy'])
        self.assertEqual(naglowki['X-Robots-Tag'], 'noindex, nofollow')
        self.assertEqual(k.api('sciskaj', plik=self.foto)[0], 401)
        for plik in ('konfiguracja.php', 'wspolne.php', 'obrazy.php', 'dane/proby.json.php'):
            self.assertEqual(k.zadanie('/' + plik)[0], 403, plik)

    def test_logowanie_zeton_i_wylogowanie(self):
        k = self.zalogowany()
        ciastko = next(c for c in k.ciastka if c.name == 'przybornik')
        self.assertTrue(ciastko.has_nonstandard_attr('HttpOnly'))
        self.assertEqual(ciastko.path, '/przybornik/')
        self.assertEqual(k.api('sciskaj', plik=self.foto, zeton='')[0], 403)
        self.assertEqual(k.api('sciskaj', plik=self.foto, zeton='0' * 64)[0], 403)
        self.assertEqual(k.zadanie('/api.php?akcja=sciskaj', naglowki={'X-Przybornik': k.zeton})[0], 405)
        self.assertEqual(k.api('nieznana', plik=self.foto)[0], 404)
        # podrobione ciasteczko: dłuższy termin, stary podpis
        termin, podpis = ciastko.value.split('.')
        podrobiony = Klient()
        _, tresc, _ = podrobiony.zadanie('/', naglowki={'Cookie': f'przybornik={int(termin) + 1000}.{podpis}'})
        self.assertIn('Zaloguj się', tresc.decode())
        # wylogowanie wymaga żetonu
        k.zadanie('/', {'wyloguj': '1', 'zeton': 'zly'})
        self.assertNotIn('Zaloguj się', k.zadanie('/')[1].decode())
        k.zadanie('/', {'wyloguj': '1', 'zeton': k.zeton})
        self.assertIn('Zaloguj się', k.zadanie('/')[1].decode())

    def test_zmiana_hasla_uniewaznia_sesje(self):
        k = self.zalogowany()
        ustaw_konfiguracje(self.tresc_konfig.replace("const SEKRET = '", "const SEKRET = 'ff"))
        self.assertIn('Zaloguj się', k.zadanie('/')[1].decode())
        self.assertEqual(k.api('sciskaj', plik=self.foto)[0], 401)

    def test_blokada_po_pieciu_probach(self):
        k = Klient()
        for _ in range(5):
            kod, strona = k.zaloguj('zle-haslo')
            self.assertEqual(kod, 200)
            self.assertIn('Hasło się nie zgadza', strona)
        kod, strona = k.zaloguj(HASLO)
        self.assertEqual(kod, 200)
        self.assertIn('Za dużo nieudanych prób', strona)
        proby = czytaj_dane('proby.json.php')
        self.assertTrue(proby.startswith('<?php http_response_code(404); exit; ?>'))
        self.assertNotRegex(proby, r'\d+\.\d+\.\d+\.\d+')       # adres IP tylko jako skrót

    # --- Ściskacz ----------------------------------------------------------------

    def test_sciskacz_trzyma_limit(self):
        k = self.zalogowany()
        for limit in (800, 300, 60):
            kod, dane, info = k.api('sciskaj', {'limit_kb': limit}, self.foto, 'Zdjęcie z wakacji.JPG')
            self.assertEqual(kod, 200, dane[:200])
            self.assertLessEqual(len(dane), limit * 1024)
            self.assertGreater(len(dane), limit * 1024 * 0.6, 'limit wykorzystany, a nie zaniżony')
            self.assertEqual(dane[:3], b'\xff\xd8\xff')
            self.assertEqual(wymiary_jpeg(dane), (info['szer'], info['wys']))
            self.assertEqual(info['nazwa'], 'Zdjęcie-z-wakacji.jpg')
            self.assertEqual(info['bajty'], len(dane))
        self.assertTrue(info['zmniejszono'])
        self.assertLess(info['szer'], 3000)

    def test_sciskacz_nie_powieksza_pliku_ktory_sie_miesci(self):
        k = self.zalogowany()
        _, maly, _ = k.api('sciskaj', {'limit_kb': 300}, self.foto)
        kod, dane, info = k.api('sciskaj', {'limit_kb': 2000}, maly)
        self.assertEqual(kod, 200)
        self.assertLessEqual(len(dane), len(maly), 'plik poniżej limitu nie może urosnąć')
        self.assertGreater(len(dane), len(maly) * 0.6, 'ani zmaleć bez potrzeby')
        self.assertEqual((info['szer'], info['wys'], info['zmniejszono']), (wymiary_jpeg(maly)[0], wymiary_jpeg(maly)[1], False))
        # JPEG zapisany z jakością 12: nie da się go odtworzyć w tym rozmiarze bez zmniejszania,
        # więc wynik może być większy, ale mieści się w limicie i zachowuje wymiary
        kod, dane, info = k.api('sciskaj', {'limit_kb': 2000}, self.niska)
        self.assertEqual((kod, wymiary_jpeg(dane), info['zmniejszono']), (200, (1200, 800), False))
        self.assertLessEqual(len(dane), 2000 * 1024)
        # zmiana formatu (JPG na WebP) nie podlega tej regule
        self.assertEqual(k.api('sciskaj', {'limit_kb': 2000, 'format': 'webp'}, maly)[0], 200)

    def test_sciskacz_formaty_i_metadane(self):
        k = self.zalogowany()
        kod, dane, info = k.api('sciskaj', {'limit_kb': 400, 'maks_bok': 1280, 'format': 'webp'}, self.foto)
        self.assertEqual((kod, dane[:4], dane[8:12]), (200, b'RIFF', b'WEBP'))
        self.assertEqual((info['szer'], info['wys']), (1280, 853))
        kod, dane, info = k.api('sciskaj', {'limit_kb': 500}, self.heic, 'IMG_0001.HEIC')
        self.assertEqual((kod, dane[:3], info['nazwa']), (200, b'\xff\xd8\xff', 'IMG_0001.jpg'))
        self.assertEqual(wymiary_jpeg(dane), (1200, 800))
        kod, dane, _ = k.api('sciskaj', {'limit_kb': 100}, JPEG_Z_EXIF)
        self.assertEqual(kod, 200)
        self.assertNotIn(b'TajnyApar', dane)
        self.assertNotIn(b'Exif', dane)
        kod, dane, _ = k.api('sciskaj', {'limit_kb': 100}, self.png, 'logo.png')
        self.assertEqual((kod, dane[:3]), (200, b'\xff\xd8\xff'))       # przezroczystość kładziona na białym tle

    def test_zle_pliki(self):
        k = self.zalogowany()
        for nazwa, tresc in (('tekst.jpg', b'to nie jest obraz'), ('atak.svg', b'<svg xmlns="http://www.w3.org/2000/svg"><image href="/etc/passwd"/></svg>'),
                             ('atak.mvg', b'push graphic-context\nviewbox 0 0 640 480\nimage over 0,0 0,0 "/etc/passwd"\npop graphic-context'),
                             ('dokument.pdf', b'%PDF-1.4\n%%EOF')):
            kod, tresc, _ = k.api('sciskaj', {'limit_kb': 100}, tresc, nazwa)
            self.assertEqual(kod, 422, nazwa)
            self.assertIn('Nie rozpoznaję', json.loads(tresc)['blad'])
        kod, tresc, _ = k.api('sciskaj', {'limit_kb': 100}, b'\xff\xd8\xff\xe0 uszkodzony', 'zly.jpg')
        self.assertEqual(kod, 422)
        self.assertEqual(k.api('sciskaj', {'limit_kb': 100})[0], 400)       # bez pliku

    # --- Podgląd i Kadrownik ------------------------------------------------------

    def test_podglad(self):
        k = self.zalogowany()
        kod, dane, info = k.api('podglad', {'bok': 800}, self.heic, 'a.heic')
        self.assertEqual(kod, 200)
        self.assertEqual(wymiary_jpeg(dane), (800, 533))
        self.assertEqual((info['szer'], info['wys'], info['szer_podgladu']), (1200, 800, 800))

    def test_kadrownik(self):
        k = self.zalogowany()
        formaty = [{'id': 'pion-4x5', 'w': 1080, 'h': 1350}, {'id': 'x-16x9', 'w': 1600, 'h': 900}, {'id': 'story-9x16', 'w': 1080, 'h': 1920}]
        kod, dane, info = k.api('kadruj', {'formaty': json.dumps(formaty), 'fx': 0.1, 'fy': 0.9, 'zoom': 1.5, 'nazwa': 'Żółw na plaży.heic'}, self.foto)
        self.assertEqual(kod, 200, dane[:200])
        with zipfile.ZipFile(io.BytesIO(dane)) as z:
            nazwy = z.namelist()
            self.assertEqual(nazwy, ['Żółw-na-plaży_pion-4x5_1080x1350.jpg', 'Żółw-na-plaży_x-16x9_1600x900.jpg', 'Żółw-na-plaży_story-9x16_1080x1920.jpg'])
            for nazwa, f in zip(nazwy, formaty):
                self.assertEqual(wymiary_jpeg(z.read(nazwa)), (f['w'], f['h']))
        self.assertEqual(info['nazwa'], 'Żółw-na-plaży_kadry.zip')
        for zle in ('[]', 'nie json', json.dumps([{'id': '../../x', 'w': 100, 'h': 100}]), json.dumps([{'id': 'ok', 'w': 9000, 'h': 100}]),
                    json.dumps([{'id': 'ok', 'w': 100, 'h': 100}] * 13)):
            self.assertEqual(k.api('kadruj', {'formaty': zle}, self.foto)[0], 400, zle[:40])

    def test_kadr_php_i_js_licza_tak_samo(self):
        przypadki = [(3000, 2000, 1080, 1350, 0.5, 0.5, 1), (3000, 2000, 1080, 1920, 0.05, 0.95, 1.7), (2000, 3000, 1600, 900, 0.9, 0.1, 1),
                     (1000, 1000, 1200, 627, 0.3, 0.7, 2.5), (4032, 3024, 1080, 1080, 1, 0, 4)]
        php = docker('run', '--rm', '-v', f'{self.www}:/w', OBRAZ, 'php', '-r',
                     'require "/w/przybornik/obrazy.php"; $w = []; foreach (json_decode($argv[1]) as $p) { $w[] = prostokat_kadru(...$p); } echo json_encode($w);',
                     json.dumps(przypadki)).stdout
        js = subprocess.run(['node', '--input-type=module', '-e', f'''
            globalThis.document = {{ querySelector: () => null }};
            const {{ prostokatKadru }} = await import({json.dumps(os.path.join(KOD, 'zasoby/narzedzia/kadrownik.js'))});
            console.log(JSON.stringify({json.dumps(przypadki)}.map((p) => prostokatKadru(...p).map(Math.round))));
        '''], capture_output=True, text=True, check=True).stdout
        self.assertEqual(json.loads(php), json.loads(js))

    def test_czysciciel_serwerowy(self):
        k = self.zalogowany()
        kod, dane, info = k.api('oczysc', plik=self.heic, nazwa='IMG_1.heic')
        self.assertEqual((kod, dane[:3], info['format']), (200, b'\xff\xd8\xff', 'jpeg'))
        self.assertEqual(wymiary_jpeg(dane), (1200, 800))


if __name__ == '__main__':
    unittest.main(verbosity=2)
