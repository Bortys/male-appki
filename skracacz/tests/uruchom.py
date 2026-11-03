#!/usr/bin/env python3
"""Testy skracacza na PHP 8.4 w Dockerze (ta sama wersja co na serwerze).

Uruchomienie z katalogu aplikacji:  python3 tests/uruchom.py
Działa na kopii w katalogu tymczasowym, z losowym hasłem. Nie dotyka serwera ani config.php.
"""
import http.cookiejar
import json
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OBRAZ = os.environ.get('OBRAZ', 'php:8.4-cli')
PORT = 18091
BAZA_URL = f'http://127.0.0.1:{PORT}'
HASLO = secrets.token_urlsafe(16)
KLUCZ_API = secrets.token_hex(24)
KONTENER = f'skracacz-test-{secrets.token_hex(4)}'


def php(kod, *dodatkowe):
    return subprocess.run(['docker', 'run', '--rm', *dodatkowe, OBRAZ, 'php', '-r', kod],
                          capture_output=True, text=True, check=True).stdout


class BezPrzekierowan(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def klient():
    sloik = http.cookiejar.CookieJar()
    return urllib.request.build_opener(BezPrzekierowan, urllib.request.HTTPCookieProcessor(sloik)), sloik


def zadanie(sciezka, dane=None, naglowki=None, metoda=None, otwieracz=None):
    naglowki = {'User-Agent': 'Mozilla/5.0 test', **(naglowki or {})}
    if isinstance(dane, dict):
        dane = urllib.parse.urlencode(dane).encode()
    req = urllib.request.Request(BAZA_URL + sciezka, data=dane, headers=naglowki, method=metoda)
    otw = otwieracz or urllib.request.build_opener(BezPrzekierowan)
    try:
        with otw.open(req, timeout=20) as r:
            return r.status, r.headers, r.read().decode()
    except urllib.error.HTTPError as e:
        with e:
            return e.code, e.headers, e.read().decode()


class Skracacz(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='skracacz-test-')
        cls.app = os.path.join(cls.tmp, 'app')
        shutil.copytree(os.path.join(REPO, 'public_html'), cls.app)
        hash_hasla = php(f"echo password_hash('{HASLO}', PASSWORD_DEFAULT);")
        with open(os.path.join(REPO, 'config.example.php'), encoding='utf-8') as f:
            config = f.read()
        config = re.sub(r"const ADMIN_PASSWORD_HASH = '';", lambda _: f"const ADMIN_PASSWORD_HASH = '{hash_hasla}';", config)
        config = re.sub(r"const API_KEY = '';", f"const API_KEY = '{KLUCZ_API}';", config)
        with open(os.path.join(cls.app, 'config.php'), 'w', encoding='utf-8') as f:
            f.write(config)
        shutil.copy(os.path.join(REPO, 'tests', 'router.php'), cls.tmp)
        subprocess.run(['docker', 'run', '-d', '--rm', '--name', KONTENER, '-p', f'127.0.0.1:{PORT}:8080',
                        '-e', 'PHP_CLI_SERVER_WORKERS=6', '-v', f'{cls.tmp}:/t', '-w', '/t/app',
                        OBRAZ, 'php', '-S', '0.0.0.0:8080', '/t/router.php'], check=True, capture_output=True)
        for _ in range(50):
            try:
                zadanie('/')
                return
            except Exception:
                time.sleep(0.2)
        raise RuntimeError('serwer testowy nie wstał')

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['docker', 'rm', '-f', KONTENER], capture_output=True)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def sql(self, kod):
        """Zapytanie wewnątrz kontenera, bo blokady SQLite nie przechodzą przez wolumen Dockera."""
        skrypt = "$p=new PDO('sqlite:/t/app/data/links.sqlite');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);" + kod
        return subprocess.run(['docker', 'exec', KONTENER, 'php', '-r', skrypt], capture_output=True, text=True, check=True).stdout

    def zaloguj(self):
        otw, sloik = klient()
        _, _, html = zadanie('/admin', otwieracz=otw)
        csrf = re.search(r'name="csrf" value="([0-9a-f]+)"', html).group(1)
        kod, _, _ = zadanie('/admin', {'csrf': csrf, 'pw': HASLO}, otwieracz=otw)
        self.assertEqual(kod, 302)
        _, _, html = zadanie('/admin', otwieracz=otw)
        csrf = re.search(r'name="csrf" value="([0-9a-f]+)"', html).group(1)
        return otw, csrf, sloik

    def nowy_link(self, **pola):
        pola.setdefault('url', 'https://example.com/cel?x=1')
        return zadanie('/api', pola, {'X-Api-Key': KLUCZ_API})

    def klikniecia(self, kod):
        return int(self.sql(f"echo $p->query(\"SELECT clicks FROM links WHERE code='{kod}'\")->fetchColumn();"))

    def setUp(self):
        self.sql("$p->exec('CREATE TABLE IF NOT EXISTS login_attempts (who TEXT, at INTEGER)');$p->exec('DELETE FROM login_attempts');")

    # --- przekierowania i licznik ---
    def test_przekierowanie_i_licznik(self):
        kod, _, tresc = self.nowy_link(alias='lk1')
        self.assertEqual(kod, 201, tresc)
        kod, nag, _ = zadanie('/lk1')
        self.assertEqual(kod, 302)
        self.assertEqual(nag['Location'], 'https://example.com/cel?x=1')
        self.assertEqual(self.klikniecia('lk1'), 1)

    def test_nie_liczy_botow_head_i_prefetch(self):
        self.nowy_link(alias='lk2')
        for ua in ('LinkedInBot/1.0', 'facebookexternalhit/1.1', 'curl/8.0', ''):
            self.assertEqual(zadanie('/lk2', naglowki={'User-Agent': ua})[0], 302)
        self.assertEqual(zadanie('/lk2', metoda='HEAD')[0], 302)
        self.assertEqual(zadanie('/lk2', naglowki={'Sec-Purpose': 'prefetch'})[0], 302)
        self.assertEqual(self.klikniecia('lk2'), 0)

    def test_licznik_nie_blokuje_przekierowania(self):
        self.nowy_link(alias='lk3')
        blokada = subprocess.Popen(['docker', 'exec', KONTENER, 'php', '-r',
                                    "$p=new PDO('sqlite:/t/app/data/links.sqlite');$p->exec('BEGIN IMMEDIATE');sleep(6);"])
        time.sleep(1)
        kod, nag, _ = zadanie('/lk3')
        blokada.wait()
        self.assertEqual(kod, 302)
        self.assertEqual(nag['Location'], 'https://example.com/cel?x=1')

    def test_404_nie_zdradza_sciezki(self):
        kod, _, html = zadanie('/nie-ma-takiego')
        self.assertEqual(kod, 404)
        self.assertNotIn('/t/app', html)

    def test_pliki_pomocnicze_sa_niedostepne(self):
        for sciezka in ('/config.php', '/diag.php', '/README.md', '/lib_admin.php', '/data/links.sqlite'):
            kod, _, html = zadanie(sciezka)
            self.assertEqual(kod, 404, sciezka)
            self.assertNotIn('ADMIN_PASSWORD_HASH', html)

    # --- nagłówki ---
    def test_naglowki_bezpieczenstwa(self):
        _, nag, _ = zadanie('/')
        self.assertIn("script-src 'self'", nag['Content-Security-Policy'])
        self.assertEqual(nag['X-Frame-Options'], 'DENY')
        self.assertEqual(nag['X-Content-Type-Options'], 'nosniff')
        self.assertIsNone(nag['Strict-Transport-Security'])  # po HTTP nie ma sensu
        _, nag, _ = zadanie('/', naglowki={'X-Forwarded-Proto': 'https'})
        self.assertIn('max-age', nag['Strict-Transport-Security'])

    def test_host_nie_przechodzi_do_przekierowania(self):
        kod, nag, _ = zadanie('/', naglowki={'Host': 'evil.example.com/"><script>'})
        self.assertNotIn('evil', nag['Location'] or '')

    # --- API ---
    def test_api_get_wylaczone(self):
        kod, nag, _ = zadanie(f'/api?key={KLUCZ_API}&url=https://example.com/x')
        self.assertEqual(kod, 405)
        self.assertEqual(nag['Allow'], 'POST')

    def test_api_zly_klucz(self):
        self.assertEqual(zadanie('/api', {'url': 'https://example.com'}, {'X-Api-Key': 'zly'})[0], 401)
        self.assertEqual(zadanie('/api', {'url': 'https://example.com'})[0], 401)
        kod, _, _ = zadanie('/api', b'{"key":["x"],"url":"https://example.com"}', {'Content-Type': 'application/json'})
        self.assertEqual(kod, 401)

    def test_api_json_i_formularz(self):
        kod, _, tresc = zadanie('/api', json.dumps({'key': KLUCZ_API, 'url': 'https://example.com/j', 'alias': 'jsn'}).encode(),
                                {'Content-Type': 'application/json'})
        self.assertEqual(kod, 201, tresc)
        self.assertEqual(json.loads(tresc)['code'], 'jsn')
        kod, _, tresc = zadanie('/api', {'key': KLUCZ_API, 'url': 'https://example.com/f'})
        self.assertEqual(kod, 201, tresc)
        self.assertEqual(len(json.loads(tresc)['code']), 6)

    def test_api_walidacja(self):
        for url in ('javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'nie-adres', f'http://127.0.0.1:{PORT}/x'):
            self.assertEqual(self.nowy_link(url=url)[0], 400, url)
        for alias in ('a', 'admin', 'API', 'assets', 'a b', '../x', '<script>'):
            self.assertEqual(self.nowy_link(alias=alias)[0], 400, alias)
        self.assertEqual(self.nowy_link(alias='duplikat')[0], 201)
        kod, _, tresc = self.nowy_link(alias='duplikat')
        self.assertEqual(kod, 400)
        self.assertIn('zajęty', tresc)

    # --- panel ---
    def test_logowanie_limit_nie_zalezy_od_sesji(self):
        for _ in range(5):
            otw, _ = klient()
            _, _, html = zadanie('/admin', otwieracz=otw)
            csrf = re.search(r'name="csrf" value="([0-9a-f]+)"', html).group(1)
            kod, _, html = zadanie('/admin', {'csrf': csrf, 'pw': 'zle-haslo-123'}, otwieracz=otw)
            self.assertEqual(kod, 200)
            self.assertIn('Złe hasło', html)
        otw, _ = klient()
        _, _, html = zadanie('/admin', otwieracz=otw)
        csrf = re.search(r'name="csrf" value="([0-9a-f]+)"', html).group(1)
        start = time.time()
        kod, nag, html = zadanie('/admin', {'csrf': csrf, 'pw': HASLO}, otwieracz=otw)
        self.assertEqual(kod, 429)  # nawet dobre hasło czeka do końca okna
        self.assertEqual(nag['Retry-After'], '900')
        self.assertLess(time.time() - start, 2)  # bez usypiania procesu serwera
        wiersze = self.sql("foreach($p->query('SELECT who FROM login_attempts') as $w) echo $w['who'],\"\\n\";")
        self.assertNotIn('172.', wiersze)  # same skróty, bez adresów IP

    def proba(self, haslo, ip):
        otw, _ = klient()
        _, _, html = zadanie('/admin', otwieracz=otw, naglowki={'X-Test-IP': ip})
        csrf = re.search(r'name="csrf" value="([0-9a-f]+)"', html).group(1)
        return zadanie('/admin', {'csrf': csrf, 'pw': haslo}, {'X-Test-IP': ip}, otwieracz=otw)[0]

    def test_atak_z_wielu_adresow_nie_blokuje_wlasciciela(self):
        for adres in range(10):
            for _ in range(5):
                self.assertEqual(self.proba('zle-haslo-123', f'198.51.100.{adres}'), 200)
        self.assertEqual(self.proba(HASLO, '203.0.113.1'), 302)  # nowy adres, dobre hasło
        self.assertEqual(self.proba('zle-haslo-123', '203.0.113.2'), 200)  # nowy adres ma jedną szansę
        self.assertEqual(self.proba(HASLO, '203.0.113.2'), 429)  # druga już nie

    def test_rownolegle_proby_nie_przechodza_limitu(self):
        sesje = []
        for _ in range(16):
            otw, _ = klient()
            _, _, html = zadanie('/admin', otwieracz=otw, naglowki={'X-Test-IP': '198.51.100.77'})
            sesje.append((otw, re.search(r'name="csrf" value="([0-9a-f]+)"', html).group(1)))
        kody, start = [], threading.Barrier(len(sesje))

        def proba(otw, csrf):
            start.wait()
            kody.append(zadanie('/admin', {'csrf': csrf, 'pw': 'zle-haslo-123'}, {'X-Test-IP': '198.51.100.77'}, otwieracz=otw)[0])
        watki = [threading.Thread(target=proba, args=s) for s in sesje]
        [w.start() for w in watki]
        [w.join() for w in watki]
        self.assertEqual(kody.count(200), 5, kody)
        self.assertEqual(kody.count(429), 11, kody)

    def test_rownolegle_klikniecia_nie_gina(self):
        self.nowy_link(alias='tlum')
        kody = []
        start = threading.Barrier(32)

        def klik():
            start.wait()
            kody.append(zadanie('/tlum')[0])
        watki = [threading.Thread(target=klik) for _ in range(32)]
        [w.start() for w in watki]
        [w.join() for w in watki]
        self.assertEqual(kody, [302] * 32)
        self.assertEqual(self.klikniecia('tlum'), 32)

    def test_stare_proby_wygasaja(self):
        wstaw = "$s=$p->prepare('INSERT INTO login_attempts (who, at) VALUES (?, ?)');for($i=0;$i<60;$i++)$s->execute(['stary'.$i, time()-1000]);"
        self.sql(wstaw)
        self.zaloguj()
        self.assertEqual(self.sql("echo $p->query('SELECT COUNT(*) FROM login_attempts')->fetchColumn();"), '0')

    def test_ciasteczko_sesji(self):
        otw, sloik = klient()
        _, nag, _ = zadanie('/admin', otwieracz=otw, naglowki={'X-Forwarded-Proto': 'https'})
        ciastko = nag['Set-Cookie']
        for cecha in ('path=/admin', 'HttpOnly', 'SameSite=Lax', 'secure'):
            self.assertIn(cecha.lower(), ciastko.lower())

    def test_narzucona_sesja_jest_odrzucana(self):
        id_atakujacego = 'a' * 32
        _, nag, _ = zadanie('/admin', naglowki={'Cookie': f'skr={id_atakujacego}'})
        self.assertNotIn(id_atakujacego, nag['Set-Cookie'] or '')
        self.assertIn('skr=', nag['Set-Cookie'])

    def test_csrf_wymagany(self):
        otw, csrf, _ = self.zaloguj()
        self.assertEqual(zadanie('/admin', {'act': 'add', 'url': 'https://example.com/csrf'}, otwieracz=otw)[0], 400)
        self.assertEqual(zadanie('/admin', {'act': 'add', 'csrf': 'zly', 'url': 'https://example.com/csrf'}, otwieracz=otw)[0], 400)

    def test_wylogowanie_tylko_przez_post(self):
        otw, csrf, _ = self.zaloguj()
        _, _, html = zadanie('/admin?logout=1', otwieracz=otw)
        self.assertIn('Skróć adres', html)  # zwykły odnośnik nikogo nie wyloguje
        kod, _, _ = zadanie('/admin', {'csrf': csrf, 'act': 'logout'}, otwieracz=otw)
        self.assertEqual(kod, 302)
        _, _, html = zadanie('/admin', otwieracz=otw)
        self.assertIn('Zaloguj', html)

    def test_panel_escapuje_i_nie_ma_skryptow_inline(self):
        otw, csrf, _ = self.zaloguj()
        zadanie('/admin', {'csrf': csrf, 'act': 'add', 'url': 'https://example.com/?q="><script>alert(1)</script>',
                           'alias': 'xss1', 'note': '<img src=x onerror=alert(2)>'}, otwieracz=otw)
        _, nag, html = zadanie('/admin?q=%22%3E%3Cscript%3Ealert(3)%3C/script%3E', otwieracz=otw)
        self.assertNotIn('<script>alert', html)
        _, _, html = zadanie('/admin', otwieracz=otw)
        self.assertNotIn('<script>alert', html)
        self.assertNotIn('<img src=x', html)
        self.assertNotRegex(html, r'\son(click|submit)=')
        self.assertIn('assets/admin.js', html)
        self.assertEqual(nag['Referrer-Policy'], 'no-referrer')

    def test_usuwanie_i_statystyki(self):
        otw, csrf, _ = self.zaloguj()
        self.nowy_link(alias='dousu')
        zadanie('/dousu')
        _, _, html = zadanie('/admin?stats=dousu', otwieracz=otw)
        self.assertIn('Kliknięcia łącznie', html)
        self.assertEqual(zadanie('/admin', {'csrf': csrf, 'act': 'del', 'code': 'dousu'}, otwieracz=otw)[0], 302)
        self.assertEqual(zadanie('/dousu')[0], 404)
        self.assertEqual(self.sql("echo $p->query(\"SELECT COUNT(*) FROM daily WHERE code='dousu'\")->fetchColumn();"), '0')

    def test_stara_baza_bez_nowej_tabeli(self):
        self.sql("$p->exec('DROP TABLE login_attempts');")
        kod, _, _ = zadanie('/admin')
        self.assertEqual(kod, 200)
        self.zaloguj()


if __name__ == '__main__':
    unittest.main(verbosity=1)
