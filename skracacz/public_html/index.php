<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/config.php';
date_default_timezone_set('Europe/Warsaw');

// ---------- baza ----------
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!is_dir(dirname(DB_PATH))) @mkdir(dirname(DB_PATH), 0775, true);
    $pdo = new PDO('sqlite:' . DB_PATH, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout=3000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT \'\',
        clicks INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_click TEXT
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS daily (
        code TEXT NOT NULL,
        day TEXT NOT NULL,
        clicks INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (code, day)
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS login_attempts (
        who TEXT NOT NULL,
        at INTEGER NOT NULL
    )');
    return $pdo;
}

// ---------- pomocnicze ----------
const RESERVED = ['admin', 'api', 'assets', 'config', 'data', 'diag', 'favicon.ico', 'index', 'login', 'logout', 'readme', 'robots.txt'];

// podglądy linków i automaty, których nie liczymy jako kliknięć
const BOT_UA = '/bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|discord|skype|teams|headless|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|ahrefs|semrush|lighthouse/';

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

function is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['SERVER_PORT'] ?? '') == 443
        || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || strtolower($_SERVER['HTTP_X_FORWARDED_SSL'] ?? '') === 'on'
        || strtolower($_SERVER['REQUEST_SCHEME'] ?? '') === 'https';
}

/** Nagłówek Host pochodzi od klienta: przepuszczamy tylko poprawną nazwę hosta. */
function request_host(): string {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    return preg_match('/^[a-z0-9.-]+(:\d+)?$/i', $host) ? $host : '';
}

function base_url(): string {
    return (is_https() ? 'https://' : 'http://') . request_host() . BASE . '/';
}

function random_code(int $len): string {
    $chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez 0/O, 1/l/I
    $out = '';
    for ($i = 0; $i < $len; $i++) $out .= $chars[random_int(0, strlen($chars) - 1)];
    return $out;
}

function valid_url(string $url): bool {
    if (strlen($url) > 4000 || !filter_var($url, FILTER_VALIDATE_URL)) return false;
    $scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
    $host = strtolower((string)parse_url($url, PHP_URL_HOST));
    if (!in_array($scheme, ['http', 'https'], true)) return false;
    if ($host === strtolower((string)preg_replace('/:\d+$/', '', request_host()))) return false; // bez pętli na samego siebie
    return true;
}

/** Tworzy link. Zwraca [kod, null] albo [null, błąd]. */
function create_link(string $url, string $alias = '', string $note = ''): array {
    $url = trim($url);
    $alias = trim($alias);
    if (!valid_url($url)) return [null, 'Nieprawidłowy adres (tylko http/https).'];
    if ($alias !== '') {
        if (!preg_match('/^[A-Za-z0-9_-]{2,64}$/', $alias)) return [null, 'Alias: 2–64 znaki, litery, cyfry, - i _.'];
        if (in_array(strtolower($alias), RESERVED, true)) return [null, 'Ten alias jest zarezerwowany.'];
        $code = $alias;
    } else {
        $code = null;
        for ($i = 0; $i < 10 && $code === null; $i++) {
            $try = random_code(CODE_LENGTH);
            $q = db()->prepare('SELECT 1 FROM links WHERE code = ?');
            $q->execute([$try]);
            if (!$q->fetchColumn()) $code = $try;
        }
        if ($code === null) return [null, 'Nie udało się wylosować kodu, spróbuj ponownie.'];
    }
    try {
        db()->prepare('INSERT INTO links (code, url, note, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$code, $url, mb_substr(trim($note), 0, 200), date('Y-m-d H:i:s')]);
    } catch (PDOException $e) {
        if ((string)$e->getCode() === '23000') return [null, 'Ten alias jest już zajęty.'];
        error_log('skracacz: ' . $e->getMessage());
        return [null, 'Nie udało się zapisać linku, spróbuj ponownie.'];
    }
    return [$code, null];
}

/** Licznik bez zapisywania IP. Awaria licznika nie może zatrzymać przekierowania. */
function count_click(string $code): void {
    $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
    $purpose = strtolower(($_SERVER['HTTP_SEC_PURPOSE'] ?? '') . ' ' . ($_SERVER['HTTP_PURPOSE'] ?? ''));
    if ($_SERVER['REQUEST_METHOD'] !== 'GET' || $ua === '' || strpos($purpose, 'prefetch') !== false || preg_match(BOT_UA, $ua)) return;
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE links SET clicks = clicks + 1, last_click = ? WHERE code = ?')->execute([date('Y-m-d H:i:s'), $code]);
        $pdo->prepare('INSERT INTO daily (code, day, clicks) VALUES (?, ?, 1) ON CONFLICT(code, day) DO UPDATE SET clicks = clicks + 1')
            ->execute([$code, date('Y-m-d')]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('skracacz: licznik: ' . $e->getMessage());
    }
}

/** Strona w marce BS. $center = prosta karta na środku (start, 404, logowanie). */
function bs_page(string $title, string $body, bool $center = false, string $script = ''): void {
    $a = BASE . '/assets/';
    echo '<!doctype html><html lang="pl"><head><meta charset="utf-8">'
       . '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
       . '<title>' . h($title) . '</title><link rel="icon" href="' . $a . 'logo-bs.png">'
       . '<link rel="stylesheet" href="' . $a . 'bs.css?v=1">'
       . ($script !== '' ? '<script src="' . $a . h($script) . '" defer></script>' : '') . '</head><body>';
    echo $center ? '<main class="center"><div class="card"><img src="' . $a . 'logo-bs.png" alt="BS">' . $body . '</div></main>' : $body;
    echo '</body></html>';
}

function json_out(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- routing ----------
// katalog, w którym leży skracacz (pusty, gdy w głównym katalogu domeny)
define('BASE', rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/'));
$path = rawurldecode((string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (BASE !== '' && strpos($path, BASE) === 0) $path = substr($path, strlen(BASE));
$path = trim($path, '/');
if ($path === 'index.php') $path = '';

// np. baza niedostępna: krótki komunikat dla gościa, szczegóły tylko w logu serwera
set_exception_handler(function (Throwable $e) use ($path): void {
    error_log('skracacz: ' . $e->getMessage());
    if ($path === 'api') json_out(503, ['error' => 'Chwilowa przerwa, spróbuj ponownie.']);
    http_response_code(503);
    bs_page('Chwilowa przerwa', '<p class="eyebrow">Błąd 503</p><h1>Chwilowa przerwa</h1><p class="lede">Spróbuj ponownie za chwilę.</p>', true);
});

// wymuś HTTPS (z obsługą proxy, bez pętli przekierowań)
if (!is_https() && request_host() !== '' && !preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', request_host())) {
    header('Location: https://' . request_host() . $_SERVER['REQUEST_URI'], true, 301);
    exit;
}
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
if (is_https()) header('Strict-Transport-Security: max-age=31536000');

if ($path === '') {
    if (HOME_REDIRECT !== '') { header('Location: ' . HOME_REDIRECT, true, 302); exit; }
    bs_page('Bartosz Sokoliński', '<p class="eyebrow">Bartosz Sokoliński</p><h1>Krótkie linki</h1>'
        . '<p class="lede">Ten adres prowadzi do materiałów Bartosza Sokolińskiego.</p>'
        . '<p><a href="https://sokolinski.com">sokolinski.com</a></p>', true);
    exit;
}
if ($path === 'robots.txt') { header('Content-Type: text/plain'); echo "User-agent: *\nDisallow: /admin\n"; exit; }
if ($path === 'api') { require __DIR__ . '/lib_api.php'; exit; }
if ($path === 'admin') { require __DIR__ . '/lib_admin.php'; exit; }

// ---------- przekierowanie ----------
$q = db()->prepare('SELECT url FROM links WHERE code = ?');
$q->execute([$path]);
$url = $q->fetchColumn();
$q->closeCursor(); // otwarty odczyt blokowałby zapis licznika i gubił kliknięcia

if ($url === false) {
    http_response_code(404);
    bs_page('Nie ma takiego linku', '<p class="eyebrow">Błąd 404</p><h1>Nie ma takiego linku</h1>'
        . '<p class="lede">Link wygasł albo w adresie jest literówka.</p>'
        . '<p><a href="https://sokolinski.com">Przejdź do sokolinski.com</a></p>', true);
    exit;
}

count_click($path);

header('Cache-Control: private, max-age=0');
header('Location: ' . $url, true, 302);
