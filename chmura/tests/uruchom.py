#!/usr/bin/env python3
"""Testy chmury słów na PHP 8.4 w Dockerze (ta sama wersja co na serwerze).

Uruchomienie z katalogu aplikacji:       python3 tests/uruchom.py
Sam test współbieżności na innym kodzie: python3 tests/uruchom.py --kod SCIEZKA Chmura.test_wspolbieznosc
Działa na kopii w katalogu tymczasowym, z losowym hasłem. Nie dotyka serwera ani konfiguracja.php.
"""
import http.cookiejar
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KOD = os.path.join(REPO, 'public_html', 'chmura')
OBRAZ = os.environ.get('OBRAZ', 'php:8.4-cli')
PORT = 18093
BAZA_URL = f'http://127.0.0.1:{PORT}/chmura'
HASLO = secrets.token_urlsafe(16)
KONTENER = f'chmura-test-{secrets.token_hex(4)}'
RUNDA = 'abcd1234'


def php(kod):
    return subprocess.run(['docker', 'run', '--rm', OBRAZ, 'php', '-r', kod], capture_output=True, text=True, check=True).stdout


def konfiguracja(haslo_php):
    return f"""<?php
{haslo_php}
const SLOW_NA_OSOBE = 3;
const MAKS_DLUGOSC = 32;
const LIMIT_NA_GODZINE = 3;
const LIMIT_NA_SIEC = 100000;
const MAKS_ODPOWIEDZI = 100000;
const CZARNA_LISTA = ['kurwa', 'kurwy', 'chuj', 'huj', 'pierdol', 'jebac', 'jebać', 'jebany', 'pizda', 'cipa', 'kutas',
    'skurwysyn', 'spierdalaj', 'wypierdalaj', 'dupa', 'fuck', 'shit'];
const ANKIETY = [
    'test' => ['pytanie' => 'Pytanie <b>testowe</b>?', 'opis' => 'Opis', 'otwarta' => true],
    'druga' => ['pytanie' => 'Druga?', 'opis' => 'Opis', 'otwarta' => true],
    'wspol' => ['pytanie' => 'Współbieżna?', 'opis' => 'Opis', 'otwarta' => true],
    'zamknieta' => ['pytanie' => 'Zamknięta?', 'opis' => 'Opis', 'otwarta' => false],
];
"""


class BezPrzekierowan(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def klient():
    sloik = http.cookiejar.CookieJar()
    return urllib.request.build_opener(BezPrzekierowan, urllib.request.HTTPCookieProcessor(sloik)), sloik


def zadanie(sciezka, dane=None, naglowki=None, otwieracz=None):
    naglowki = {'User-Agent': 'Mozilla/5.0 test', **(naglowki or {})}
    if dane is not None and not isinstance(dane, bytes):
        dane = urllib.parse.urlencode(dane, doseq=True).encode()
    req = urllib.request.Request(BAZA_URL + sciezka, data=dane, headers=naglowki)
    otw = otwieracz or urllib.request.build_opener(BezPrzekierowan)
    try:
        with otw.open(req, timeout=30) as r:
            return r.status, r.headers, r.read().decode()
    except urllib.error.HTTPError as e:
        with e:
            return e.code, e.headers, e.read().decode()


def wyslij(slowa, ankieta='test', otwieracz=None, **dodatkowe):
    pola = {'a': ankieta, 't': int(time.time()) - 10, 'slowa[]': slowa, **dodatkowe}
    kod, nag, tresc = zadanie('/api.php', pola, otwieracz=otwieracz)
    return kod, json.loads(tresc), nag


def slowa_ankiety(ankieta='test'):
    return {s['w']: s['n'] for s in json.loads(zadanie(f'/api.php?a={ankieta}')[2])['slowa']}


class Chmura(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='chmura-test-')
        cls.app = os.path.join(cls.tmp, 'chmura')
        shutil.copytree(KOD, cls.app, ignore=shutil.ignore_patterns('fonty'))
        cls.hash = php(f"echo password_hash('{HASLO}', PASSWORD_DEFAULT);")
        # Kod w kontenerze, nie na wolumenie: wolumen Dockera na Macu buforuje pliki i fałszuje test zapisów.
        subprocess.run(['docker', 'run', '-d', '--rm', '--name', KONTENER, '-p', f'127.0.0.1:{PORT}:8080',
                        '-e', 'PHP_CLI_SERVER_WORKERS=8', '-w', '/www', OBRAZ, 'sh', '-c',
                        # OPcache pamiętałby przez 2 sekundy konfigurację, którą testy podmieniają.
                        # Plik dołączany pozwala testom udawać wiele adresów przez nagłówek X-Test-IP.
                        'mkdir -p /www && echo \'<?php if (isset($_SERVER["HTTP_X_TEST_IP"])) $_SERVER["REMOTE_ADDR"] = $_SERVER["HTTP_X_TEST_IP"];\' > /tmp/ip.php'
                        ' && exec php -d opcache.enable=0 -d auto_prepend_file=/tmp/ip.php -S 0.0.0.0:8080'], check=True, capture_output=True)
        subprocess.run(['docker', 'exec', KONTENER, 'mkdir', '-p', '/www'], check=True)
        subprocess.run(['docker', 'cp', cls.app, f'{KONTENER}:/www/chmura'], check=True, capture_output=True)
        cls.ustaw_haslo(f"const ADMIN_HASLO_HASH = '{cls.hash}';")
        for _ in range(50):
            try:
                zadanie('/api.php')
                return
            except Exception:
                time.sleep(0.2)
        raise RuntimeError('serwer testowy nie wstał')

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['docker', 'rm', '-f', KONTENER], capture_output=True)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    @staticmethod
    def pisz(sciezka, tresc):
        subprocess.run(['docker', 'exec', '-i', KONTENER, 'sh', '-c', 'cat > "$1"', '_', f'/www/chmura/{sciezka}'],
                       input=tresc.encode(), check=True)

    @staticmethod
    def czytaj(sciezka):
        return subprocess.run(['docker', 'exec', KONTENER, 'cat', f'/www/chmura/{sciezka}'],
                              capture_output=True, check=True).stdout.decode()

    @classmethod
    def ustaw_haslo(cls, linia, **zamiany):
        tresc = konfiguracja(linia)
        for nazwa, wartosc in zamiany.items():
            tresc = re.sub(rf'const {nazwa} = \d+;', f'const {nazwa} = {wartosc};', tresc)
        cls.pisz('konfiguracja.php', tresc)

    def setUp(self):
        subprocess.run(['docker', 'exec', KONTENER, 'sh', '-c',
                        'cd /www/chmura/dane && rm -f ./*.json.php ./*.blokada ./*.tmp ./_logowania.php'], check=True)
        self.ustaw_haslo(self.linia_hasla())

    def linia_hasla(self):
        return f"const ADMIN_HASLO_HASH = '{self.hash}';"

    def zapisz_stan(self, ankieta, stan):
        self.pisz(f'dane/{ankieta}.json.php', '<?php exit; ?>\n' + json.dumps(stan, ensure_ascii=False))

    def czytaj_stan(self, ankieta):
        return json.loads(self.czytaj(f'dane/{ankieta}.json.php').split('\n', 1)[1])

    def zaloguj(self, haslo=HASLO):
        otw, sloik = klient()
        kod, nag, html = zadanie('/admin.php', {'haslo': haslo}, otwieracz=otw)
        self.assertEqual(kod, 302, html[:300])
        _, _, html = zadanie('/admin.php?a=test', otwieracz=otw)
        token = re.search(r'name="token" value="([0-9a-f]+)"', html).group(1)
        return otw, token, sloik

    # --- odpowiedzi ---
    def test_zapis_i_normalizacja(self):
        kod, j, _ = wyslij(['  Sztuczna   Inteligencja!! ', 'ChatGPT', 'chatgpt'])
        self.assertEqual(kod, 200, j)
        self.assertEqual(j['twoje'], ['sztuczna inteligencja', 'chatgpt'])
        odp = json.loads(zadanie('/api.php?a=test')[2])
        etykiety = {s['w']: s.get('e') for s in odp['slowa']}
        self.assertEqual(etykiety['chatgpt'], 'ChatGPT')
        self.assertEqual(odp['osoby'], 1)

    def test_znaczniki_nie_przechodza(self):
        _, j, _ = wyslij(['<script>alert(1)</script>', '=HYPERLINK("http://x")', '<?php exit;'])
        tekst = json.dumps(j['slowa'])
        for zle in ('<', '>', '=', '?', '"http'):
            self.assertNotIn(zle, tekst.replace('\\"', ''), tekst)

    def test_tablice_w_polach_nie_wywracaja(self):
        kod, _, _ = zadanie('/api.php?a[]=x')
        self.assertEqual(kod, 200)
        kod, _, tresc = zadanie('/api.php', {'a': 'test', 't': 5, 'slowa[0][]': 'x'})
        self.assertEqual(kod, 422, tresc)
        kod, _, html = zadanie('/?a=test', naglowki={'Cookie': 'ankieta_u[]=x; ankieta_id[]=y'})
        self.assertEqual(kod, 200)

    def test_czarna_lista(self):
        for zle in ('kurwa', 'Chujowy', 'jebać', 'rozpierdol', 'dupa', 'SKURWYSYN'):
            self.assertEqual(wyslij([zle])[0], 422, zle)

    def test_czarna_lista_bez_falszywych_trafien(self):
        for dobre in ('principal', 'municipal', 'podsłuchuj', 'participation'):
            self.assertEqual(wyslij([dobre])[0], 200, dobre)

    def test_pulapki_na_boty(self):
        kod, j, _ = wyslij(['bot-slowo'], strona_www='http://spam')
        self.assertEqual(kod, 200)
        self.assertNotIn('bot-slowo', slowa_ankiety())
        self.assertEqual(zadanie('/api.php', {'a': 'test', 'slowa[]': ['bez-czasu']})[0], 429)
        self.assertEqual(zadanie('/api.php', {'a': 'test', 't': int(time.time()), 'slowa[]': ['za-szybko']})[0], 429)
        self.assertNotIn('bez-czasu', slowa_ankiety())

    def test_tylko_z_tej_strony(self):
        pola = {'a': 'test', 't': int(time.time()) - 10, 'slowa[]': ['obce-zrodlo']}
        self.assertEqual(zadanie('/api.php', pola, {'Origin': 'https://evil.example.com'})[0], 403)
        self.assertEqual(zadanie('/api.php', pola, {'Origin': 'null'})[0], 403)
        self.assertEqual(zadanie('/api.php', pola, {'Origin': f'http://127.0.0.1:{PORT}'})[0], 200)

    def test_limit_na_przegladarke(self):
        otw, sloik = klient()
        for i in range(3):
            self.assertEqual(wyslij([f'lim{i}'], otwieracz=otw)[0], 200)
        kod, j, _ = wyslij(['lim-za-duzo'], otwieracz=otw)
        self.assertEqual(kod, 429)
        self.assertIn('przeglądarka', j['blad'])

    def test_limit_na_siec_i_komplet(self):
        self.ustaw_haslo(self.linia_hasla(), LIMIT_NA_SIEC=2)
        self.assertEqual(wyslij(['siec-a'])[0], 200)
        self.assertEqual(wyslij(['siec-b'])[0], 200)
        kod, j, _ = wyslij(['siec-c'])
        self.assertEqual(kod, 429)
        self.assertIn('sieci', j['blad'])
        self.ustaw_haslo(self.linia_hasla(), MAKS_ODPOWIEDZI=2)
        kod, j, _ = wyslij(['komplet'])
        self.assertEqual(kod, 403)
        self.assertIn('komplet', j['blad'])

    def test_stare_limity_znikaja_przy_odczycie(self):
        self.zapisz_stan('test', {'odpowiedzi': [], 'limity': {'i:stary': [int(time.time()) - 4000]}})
        self.assertEqual(zadanie('/api.php?a=test')[0], 200)
        self.assertEqual(self.czytaj_stan('test')['limity'], [])

    def test_ciasteczko_tylko_po_wyslaniu_i_tylko_w_katalogu(self):
        _, nag, _ = zadanie('/?a=test')
        self.assertIsNone(nag['Set-Cookie'])
        kod, _, nag = wyslij(['ciastko'])
        ciastko = nag['Set-Cookie']
        self.assertIn('ankieta_u=', ciastko)
        self.assertIn('path=/chmura/', ciastko)
        self.assertIn('HttpOnly', ciastko)
        wygasa = int(re.search(r'Max-Age=(\d+)', ciastko).group(1))
        self.assertLessEqual(wygasa, 2 * 3600)

    def test_stare_roczne_ciasteczko_jest_kasowane(self):
        _, nag, _ = zadanie('/?a=test', naglowki={'Cookie': 'ankieta_id=' + 'a' * 32})
        self.assertIn('ankieta_id=deleted', nag['Set-Cookie'].replace('ankieta_id=;', 'ankieta_id=deleted;'))
        self.assertIn('path=/', nag['Set-Cookie'])

    def test_zgodnosc_ze_starym_plikiem_danych(self):
        self.zapisz_stan('test', {'odpowiedzi': [{'t': 1793000000, 's': ['stare']}], 'ukryte': [], 'scal': {}, 'otwarta': None,
                                  'limity': {}, 'etykiety': {}, 'runda': RUNDA})
        self.assertEqual(wyslij(['nowe'])[0], 200)
        self.assertEqual(slowa_ankiety(), {'nowe': 1, 'stare': 1})
        self.assertEqual(self.czytaj_stan('test')['runda'], RUNDA)

    def test_uszkodzony_plik_nie_jest_nadpisywany(self):
        self.pisz('dane/test.json.php', '<?php exit; ?>\n{"odpowiedzi":[{"t":1,"s":["ur')
        kod, j, _ = wyslij(['nowe'])
        self.assertEqual(kod, 500)
        self.assertNotIn('dane/', j['blad'])
        self.assertIn('{"odpowiedzi":[{"t":1,"s":["ur', self.czytaj('dane/test.json.php'))

    def test_ankieta_zamknieta(self):
        kod, j, _ = wyslij(['po-czasie'], ankieta='zamknieta')
        self.assertEqual(kod, 403)
        self.assertFalse(json.loads(zadanie('/api.php?a=zamknieta')[2])['otwarta'])

    def test_wspolbieznosc(self):
        """Czytelnik nie może zobaczyć pustego stanu, gdy równolegle idą zapisy."""
        self.ustaw_haslo(self.linia_hasla(), LIMIT_NA_GODZINE=100000)
        poczatek = [{'t': 1793000000, 's': [f'seed{i}']} for i in range(1500)]
        self.zapisz_stan('wspol', {'odpowiedzi': poczatek, 'ukryte': [], 'scal': {}, 'otwarta': None, 'limity': {},
                                   'etykiety': {}, 'runda': RUNDA})
        koniec = time.time() + 8
        zapisane, bledy_zapisu, zle_odczyty, odczyty = [], [], [], [0]
        blokada = threading.Lock()

        def pisarz(nr):
            i = 0
            while time.time() < koniec:
                kod, j, _ = wyslij([f'w{nr}x{i}'], ankieta='wspol')
                with blokada:
                    (zapisane if kod == 200 else bledy_zapisu).append((kod, j.get('blad')))
                i += 1

        def czytelnik():
            while time.time() < koniec:
                kod, _, tresc = zadanie('/api.php?a=wspol')
                j = json.loads(tresc)
                with blokada:
                    odczyty[0] += 1
                    if j['runda'] != RUNDA or j['osoby'] < 1500:
                        zle_odczyty.append((j['runda'], j['osoby']))

        watki = [threading.Thread(target=pisarz, args=(n,)) for n in range(3)] + [threading.Thread(target=czytelnik) for _ in range(4)]
        [w.start() for w in watki]
        [w.join() for w in watki]
        koncowe = json.loads(zadanie('/api.php?a=wspol')[2])
        print(f'\n  zapisów {len(zapisane)}, odczytów {odczyty[0]}, błędnych odczytów {len(zle_odczyty)}, błędów zapisu {len(bledy_zapisu)}')
        self.assertEqual(zle_odczyty, [], 'czytelnik zobaczył pusty lub urwany stan')
        self.assertEqual(bledy_zapisu, [])
        self.assertEqual(koncowe['osoby'], 1500 + len(zapisane), 'zgubione zapisy')
        self.assertEqual(koncowe['runda'], RUNDA)

    # --- pliki i nagłówki ---
    def test_pliki_pomocnicze(self):
        self.assertEqual(zadanie('/wspolne.php')[0], 404)
        self.assertEqual(os.path.exists(os.path.join(KOD, 'INSTRUKCJA.md')), False)
        self.assertEqual(os.path.exists(os.path.join(KOD, 'konfiguracja.example.php')), False)

    def test_naglowki_strony(self):
        _, nag, html = zadanie('/?a=test')
        self.assertIn("script-src 'self'", nag['Content-Security-Policy'])
        self.assertNotIn('unsafe', nag['Content-Security-Policy'])
        self.assertIn('Pytanie &lt;b&gt;testowe', html)
        self.assertNotIn('style=', html)
        self.assertNotRegex(html, r'<script(?![^>]*src=)')
        _, _, html = zadanie('/ekran.php?a=test')
        self.assertNotRegex(html, r'<script(?![^>]*src=)')

    # --- panel ---
    def test_logowanie_i_akcje(self):
        wyslij(['pierwsze', 'drugie'])
        otw, token, _ = self.zaloguj()
        _, _, html = zadanie('/admin.php?a=test', otwieracz=otw)
        self.assertIn('2 różnych słów', html)
        zadanie('/admin.php', {'token': token, 'a': 'test', 'akcja': 'ukryj', 'slowo': 'pierwsze'}, otwieracz=otw)
        self.assertEqual(slowa_ankiety(), {'drugie': 1})
        zadanie('/admin.php', {'token': token, 'a': 'test', 'akcja': 'scal', 'slowo': 'drugie', 'cel': 'trzecie'}, otwieracz=otw)
        self.assertEqual(slowa_ankiety(), {'trzecie': 1})
        kod, nag, csv = zadanie('/admin.php?a=test&csv=odpowiedzi', otwieracz=otw)
        self.assertIn('text/csv', nag['Content-Type'])
        self.assertIn('pierwsze, drugie', csv)
        zadanie('/admin.php', {'token': token, 'a': 'test', 'akcja': 'status'}, otwieracz=otw)
        self.assertEqual(wyslij(['po-zamknieciu'])[0], 403)
        zadanie('/admin.php', {'token': token, 'a': 'test', 'akcja': 'status', 'otwarta': '1'}, otwieracz=otw)
        zadanie('/admin.php', {'token': token, 'a': 'test', 'akcja': 'wyczysc', 'potwierdz': 'test'}, otwieracz=otw)
        self.assertEqual(slowa_ankiety(), {})
        self.assertNotEqual(self.czytaj_stan('test')['runda'], '0')

    def test_panel_bez_logowania_nic_nie_zmienia(self):
        wyslij(['zostaje'])
        zadanie('/admin.php', {'a': 'test', 'akcja': 'wyczysc', 'potwierdz': 'test'})
        kod, _, tresc = zadanie('/admin.php?a=test&csv=odpowiedzi')
        self.assertNotIn('zostaje', tresc)
        self.assertEqual(slowa_ankiety(), {'zostaje': 1})

    def test_csrf_wymagany(self):
        wyslij(['zostaje'])
        otw, _, _ = self.zaloguj()
        zadanie('/admin.php', {'a': 'test', 'akcja': 'wyczysc', 'potwierdz': 'test'}, otwieracz=otw)
        zadanie('/admin.php', {'token': 'zly', 'a': 'test', 'akcja': 'wyczysc', 'potwierdz': 'test'}, otwieracz=otw)
        self.assertEqual(slowa_ankiety(), {'zostaje': 1})

    def test_komunikat_nie_pochodzi_z_adresu(self):
        otw, _, _ = self.zaloguj()
        _, _, html = zadanie('/admin.php?a=test&info=Wejdz-na-evil.example.com', otwieracz=otw)
        self.assertNotIn('evil.example.com', html)

    def test_limit_logowania_niezalezny_od_sesji(self):
        for _ in range(5):
            kod, _, html = zadanie('/admin.php', {'haslo': 'zle-haslo'})
            self.assertEqual(kod, 200)
            self.assertIn('Złe hasło', html)
        start = time.time()
        kod, nag, html = zadanie('/admin.php', {'haslo': HASLO})
        self.assertEqual(kod, 429)  # nawet dobre hasło czeka do końca okna
        self.assertLess(time.time() - start, 1.5)  # bez usypiania procesu serwera
        tresc = self.czytaj('dane/_logowania.php')
        self.assertTrue(tresc.startswith('<?php exit; ?>'))
        self.assertNotRegex(tresc, r'\d+\.\d+\.\d+\.\d+')  # same skróty, bez adresów IP

    def test_atak_z_wielu_adresow_nie_blokuje_wlasciciela(self):
        for adres in range(10):
            for _ in range(5):
                kod = zadanie('/admin.php', {'haslo': 'zle-haslo'}, {'X-Test-IP': f'198.51.100.{adres}'})[0]
                self.assertEqual(kod, 200)
        self.assertEqual(zadanie('/admin.php', {'haslo': HASLO}, {'X-Test-IP': '203.0.113.1'})[0], 302)
        self.assertEqual(zadanie('/admin.php', {'haslo': 'zle-haslo'}, {'X-Test-IP': '203.0.113.2'})[0], 200)
        self.assertEqual(zadanie('/admin.php', {'haslo': HASLO}, {'X-Test-IP': '203.0.113.2'})[0], 429)

    def test_rownolegle_proby_nie_przechodza_limitu(self):
        kody, start = [], threading.Barrier(16)

        def proba():
            start.wait()
            kody.append(zadanie('/admin.php', {'haslo': 'zle-haslo'})[0])
        watki = [threading.Thread(target=proba) for _ in range(16)]
        [w.start() for w in watki]
        [w.join() for w in watki]
        self.assertEqual(kody.count(200), 5, kody)
        self.assertEqual(kody.count(429), 11, kody)

    def test_logowanie_z_obcej_strony_nie_liczy_proby(self):
        for _ in range(6):
            self.assertEqual(zadanie('/admin.php', {'haslo': 'zle-haslo'}, {'Origin': 'https://evil.example.com'})[0], 403)
        self.zaloguj()

    def test_czas_odpowiedzi_do_minuty(self):
        wyslij(['slowo'])
        stan = self.czytaj_stan('test')
        self.assertEqual(stan['odpowiedzi'][0]['t'] % 60, 0)

    def test_odrzucona_wysylka_nie_przepisuje_pliku(self):
        wyslij(['slowo'], ankieta='druga')
        wezel = lambda: subprocess.run(['docker', 'exec', KONTENER, 'stat', '-c', '%i %Y', '/www/chmura/dane/druga.json.php'],
                                       capture_output=True, text=True, check=True).stdout
        przed = wezel()
        self.ustaw_haslo(self.linia_hasla(), MAKS_ODPOWIEDZI=1)
        self.assertEqual(wyslij(['nastepne'], ankieta='druga')[0], 403)
        self.assertEqual(wezel(), przed)

    def test_odblokowanie_sieci_z_panelu(self):
        self.ustaw_haslo(self.linia_hasla(), LIMIT_NA_SIEC=1)
        self.assertEqual(wyslij(['pierwsze'])[0], 200)
        self.assertEqual(wyslij(['drugie'])[0], 429)
        otw, token, _ = self.zaloguj()
        zadanie('/admin.php', {'token': token, 'a': 'test', 'akcja': 'odblokuj'}, otwieracz=otw)
        self.assertEqual(wyslij(['drugie'])[0], 200)

    def test_usuwanie_ostatnich_odpowiedzi(self):
        teraz = int(time.time())
        self.zapisz_stan('test', {'odpowiedzi': [{'t': teraz - 7200, 's': ['stare']}, {'t': teraz - 120, 's': ['spam']}], 'runda': RUNDA})
        otw, token, _ = self.zaloguj()
        _, _, _ = zadanie('/admin.php', {'token': token, 'a': 'test', 'akcja': 'usun-ostatnie', 'minuty': '10'}, otwieracz=otw)
        _, _, html = zadanie('/admin.php?a=test', otwieracz=otw)
        self.assertIn('Usunięto odpowiedzi z ostatnich 10 min: 1.', html)
        self.assertEqual(slowa_ankiety(), {'stare': 1})
        self.assertEqual(self.czytaj_stan('test')['runda'], RUNDA)

    def test_panel_otwiera_sie_przy_zalewie(self):
        self.zapisz_stan('test', {'odpowiedzi': [{'t': 1793000000, 's': [f'slowo{i}']} for i in range(800)], 'runda': RUNDA})
        otw, _, _ = self.zaloguj()
        _, _, html = zadanie('/admin.php?a=test', otwieracz=otw)
        self.assertEqual(html.count('name="akcja" value="ukryj"'), 500)
        self.assertIn('Pokazuję 500 najczęstszych z 800 słów', html)
        kod, _, csv = zadanie('/admin.php?a=test&csv=slowa', otwieracz=otw)
        self.assertEqual(csv.count('slowo'), 800)

    def test_informacja_o_prywatnosci_takze_w_ramce(self):
        for adres in ('/?a=test', '/?a=test&osadz=1'):
            self.assertIn('skrót adresu IP', zadanie(adres)[2])

    def test_strona_sprzata_stare_limity(self):
        self.zapisz_stan('test', {'odpowiedzi': [], 'limity': {'i:stary': [int(time.time()) - 4000]}, 'runda': RUNDA})
        self.assertEqual(zadanie('/?a=test')[0], 200)
        self.assertEqual(self.czytaj_stan('test')['limity'], [])

    def test_przegladarki_dostaja_nowy_skrypt(self):
        for adres in ('/?a=test', '/ekran.php?a=test'):
            self.assertIn('zasoby/chmura.js?v=2', zadanie(adres)[2])

    def test_rysowanie_chmury(self):
        wynik = subprocess.run(['node', os.path.join(REPO, 'tests', 'chmura_js_test.js'), os.path.join(KOD, 'zasoby', 'chmura.js')],
                               capture_output=True, text=True)
        self.assertEqual(wynik.returncode, 0, wynik.stdout)

    def test_stare_proby_wygasaja(self):
        self.pisz('dane/_logowania.php', '<?php exit; ?>\n' + json.dumps({f'stary{i}': [int(time.time()) - 1000] for i in range(60)}))
        self.zaloguj()

    def test_haslo_domyslne_nie_wpuszcza(self):
        self.ustaw_haslo("const ADMIN_HASLO = 'zmien-mnie-2026';")
        kod, _, html = zadanie('/admin.php', {'haslo': 'zmien-mnie-2026'})
        self.assertEqual(kod, 200)
        self.assertIn('Ustaw hasło', html)
        self.assertEqual(zadanie('/admin.php?a=test&csv=odpowiedzi')[1]['Content-Disposition'], None)

    def test_stara_konfiguracja_z_jawnym_haslem_dziala(self):
        self.ustaw_haslo("const ADMIN_HASLO = 'stare-haslo-klienta';")
        otw, token, _ = self.zaloguj('stare-haslo-klienta')
        _, _, html = zadanie('/admin.php?a=test', otwieracz=otw)
        self.assertIn('jawnym tekstem', html)

    def test_generator_skrotu_w_panelu(self):
        otw, token, _ = self.zaloguj()
        _, _, html = zadanie('/admin.php?a=test', {'token': token, 'a': 'test', 'nowe_haslo': 'krotkie'}, otwieracz=otw)
        self.assertIn('co najmniej 12', html)
        _, _, html = zadanie('/admin.php?a=test', {'token': token, 'a': 'test', 'nowe_haslo': 'nowe-dlugie-haslo-2026'}, otwieracz=otw)
        hash_ = re.search(r"ADMIN_HASLO_HASH = '(\$2y\$[^']+)'", html)
        self.assertIsNotNone(hash_, html[:500])
        self.assertNotIn('nowe-dlugie-haslo-2026', html)
        # bez tokenu i bez logowania generator milczy, gdy hasło jest już ustawione
        _, _, html = zadanie('/admin.php', {'nowe_haslo': 'nowe-dlugie-haslo-2026'})
        self.assertNotIn('ADMIN_HASLO_HASH =', html)

    def test_pierwsze_uruchomienie_generuje_dzialajacy_skrot(self):
        self.ustaw_haslo("const ADMIN_HASLO_HASH = '';")
        _, _, html = zadanie('/admin.php', {'nowe_haslo': 'pierwsze-haslo-2026'})
        hash_ = re.search(r"ADMIN_HASLO_HASH = '(\$2y\$[^']+)'", html).group(1)
        self.ustaw_haslo(f"const ADMIN_HASLO_HASH = '{hash_}';")
        self.zaloguj('pierwsze-haslo-2026')

    def test_ciasteczko_panelu(self):
        _, nag, _ = zadanie('/admin.php')
        ciastko = nag['Set-Cookie']
        for cecha in ('path=/chmura/', 'HttpOnly', 'SameSite=Strict'):
            self.assertIn(cecha.lower(), ciastko.lower())
        _, nag, _ = zadanie('/admin.php', naglowki={'Cookie': 'ankieta_admin=' + 'b' * 26})
        self.assertNotIn('b' * 26, nag['Set-Cookie'] or '')

    def test_osadzenie_ma_wlasciwy_adres(self):
        otw, _, _ = self.zaloguj()
        _, _, html = zadanie('/admin.php?a=test', otwieracz=otw)
        self.assertIn('src=&quot;/chmura/?a=test', html)
        self.assertNotIn('/ankieta/', html)


if __name__ == '__main__':
    argumenty = sys.argv[1:]
    if '--kod' in argumenty:
        i = argumenty.index('--kod')
        KOD = os.path.abspath(argumenty[i + 1])
        del argumenty[i:i + 2]
    unittest.main(argv=[sys.argv[0], *argumenty], verbosity=1)
