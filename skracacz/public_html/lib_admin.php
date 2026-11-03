<?php
if (!defined('ADMIN_PASSWORD_HASH')) exit;

const LOGIN_WINDOW = 900;   // okno liczenia błędnych haseł, w sekundach
const LOGIN_MAX_IP = 5;     // błędne hasła z jednego adresu w oknie
const LOGIN_MAX_ALL = 50;   // od tylu prób łącznie (atak z wielu adresów) każdy adres ma tylko jedną
const SESSION_IDLE = 7200;  // wylogowanie po 2 godzinach bezczynności

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_name('skr');
session_set_cookie_params(['lifetime' => 0, 'path' => BASE . '/admin', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
session_start();
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

if (!empty($_SESSION['ok']) && time() - ($_SESSION['seen'] ?? 0) > SESSION_IDLE) {
    $_SESSION = [];
    session_regenerate_id(true);
}
if (!empty($_SESSION['ok'])) $_SESSION['seen'] = time();

if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$post = $_SERVER['REQUEST_METHOD'] === 'POST';
if ($post && !hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) {
    http_response_code(400);
    bs_page('Błąd formularza', '<p class="eyebrow">Błąd</p><h1>Formularz wygasł</h1><p class="lede">Odśwież stronę i spróbuj ponownie.</p><p><a href="' . BASE . '/admin">Wróć do panelu</a></p>', true);
    exit;
}

$msg = ''; $err = '';
$adm = BASE . '/admin';

function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . h($_SESSION['csrf']) . '">'; }

function copy_btn(string $url): string {
    return '<button class="lnk" type="button" data-copy="' . h($url) . '">Kopiuj</button>';
}

/** Układ panelu: nagłówek z logo, treść, stopka. */
function admin_page(string $title, string $body): void {
    $a = BASE . '/assets/';
    bs_page($title . ' – Skracacz', '<div class="wrap"><header class="masthead">'
        . '<img src="' . $a . 'logo-bs.png" alt="BS"><div><div class="name">Skracacz</div><div class="eyebrow">Bartosz Sokoliński</div></div>'
        . '<form method="post" class="right">' . csrf_field() . '<input type="hidden" name="act" value="logout"><button class="lnk">Wyloguj</button></form></header>'
        . $body
        . '<footer class="foot"><span class="eyebrow">' . h(request_host()) . '</span><span class="eyebrow">sokolinski.com</span></footer></div>', false, 'admin.js');
}

/** Skrót adresu, żeby limit działał też dla kogoś, kto za każdym razem zaczyna nową sesję. */
function login_who(): string {
    return hash_hmac('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? ''), ADMIN_PASSWORD_HASH);
}

/** Liczy próbę przed sprawdzeniem hasła, żeby równoległe żądania nie przeszły limitu.
    Przy ataku z wielu adresów adres bez nieudanych prób ma jedną szansę, więc właściciel nadal wejdzie. */
function login_attempt(): bool {
    $pdo = db();
    $pdo->exec('BEGIN IMMEDIATE');
    $pdo->prepare('DELETE FROM login_attempts WHERE at < ?')->execute([time() - LOGIN_WINDOW]);
    $q = $pdo->prepare('SELECT COUNT(*), COALESCE(SUM(who = ?), 0) FROM login_attempts');
    $q->execute([login_who()]);
    [$all, $mine] = $q->fetch(PDO::FETCH_NUM);
    $q->closeCursor();
    $allowed = (int)$mine < LOGIN_MAX_IP && ((int)$mine === 0 || (int)$all < LOGIN_MAX_ALL);
    if ($allowed) $pdo->prepare('INSERT INTO login_attempts (who, at) VALUES (?, ?)')->execute([login_who(), time()]);
    $pdo->exec('COMMIT');
    return $allowed;
}

// ----- pierwsze uruchomienie: wygeneruj hash -----
if (ADMIN_PASSWORD_HASH === '') {
    $out = '<p class="eyebrow">Pierwsze uruchomienie</p><h1>Ustaw hasło</h1>';
    if ($post && strlen((string)($_POST['pw'] ?? '')) >= 10) {
        $out .= '<p>W <code>config.php</code> zastąp dwie linie zaczynające się od <code>const ADMIN_PASSWORD_HASH</code> i <code>const API_KEY</code> tymi poniżej. Nic więcej nie dopisuj.</p>
<pre style="background:#FCFAF5;border:1px solid #D9D1C2;padding:16px;overflow-x:auto;font-size:13px">const ADMIN_PASSWORD_HASH = \'' . h(password_hash($_POST['pw'], PASSWORD_DEFAULT)) . '\';
const API_KEY = \'' . bin2hex(random_bytes(24)) . '\';</pre><p>Potem odśwież tę stronę.</p>';
    } else {
        if ($post) $out .= '<div class="note">Hasło musi mieć co najmniej 10 znaków.</div>';
        $out .= '<form method="post">' . csrf_field() . '<label class="eyebrow" for="pw">Hasło do panelu, min. 10 znaków</label>
<input type="password" id="pw" name="pw" required minlength="10" autofocus><div class="row"><button>Generuj</button></div></form>';
    }
    bs_page('Konfiguracja – Skracacz', $out, true);
    exit;
}

// ----- logowanie -----
if (empty($_SESSION['ok'])) {
    if ($post && isset($_POST['pw'])) {
        if (!login_attempt()) {
            http_response_code(429);
            header('Retry-After: ' . LOGIN_WINDOW);
            $err = 'Za dużo nieudanych prób. Spróbuj ponownie za 15 minut.';
        } elseif (password_verify((string)$_POST['pw'], ADMIN_PASSWORD_HASH)) {
            db()->prepare('DELETE FROM login_attempts WHERE who = ?')->execute([login_who()]);
            session_regenerate_id(true);
            $_SESSION = ['ok' => true, 'seen' => time(), 'csrf' => bin2hex(random_bytes(16))];
            header('Location: ' . $adm); exit;
        } else {
            $err = 'Złe hasło.';
        }
    }
    bs_page('Logowanie – Skracacz', '<p class="eyebrow">Bartosz Sokoliński</p><h1>Skracacz</h1>'
        . ($err ? '<div class="note">' . h($err) . '</div>' : '')
        . '<form method="post">' . csrf_field() . '<label class="eyebrow" for="pw">Hasło</label>
<input type="password" id="pw" name="pw" autofocus required><div class="row"><button>Zaloguj</button></div></form>', true);
    exit;
}

// ----- akcje -----
if ($post) {
    $act = $_POST['act'] ?? '';
    if ($act === 'logout') {
        $_SESSION = [];
        session_destroy();
        setcookie(session_name(), '', ['expires' => 1, 'path' => BASE . '/admin', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
        header('Location: ' . $adm); exit;
    } elseif ($act === 'add') {
        [$code, $e] = create_link((string)($_POST['url'] ?? ''), (string)($_POST['alias'] ?? ''), (string)($_POST['note'] ?? ''));
        if ($e) $err = $e; else $msg = $code;
    } elseif ($act === 'del') {
        $c = (string)($_POST['code'] ?? '');
        db()->prepare('DELETE FROM links WHERE code = ?')->execute([$c]);
        db()->prepare('DELETE FROM daily WHERE code = ?')->execute([$c]);
        header('Location: ' . $adm); exit;
    }
}

// ----- statystyki jednego linku -----
if (isset($_GET['stats'])) {
    $c = (string)$_GET['stats'];
    $q = db()->prepare('SELECT * FROM links WHERE code = ?'); $q->execute([$c]);
    $l = $q->fetch();
    if (!$l) { header('Location: ' . $adm); exit; }
    $q = db()->prepare('SELECT day, clicks FROM daily WHERE code = ? AND day >= ? ORDER BY day DESC');
    $q->execute([$c, date('Y-m-d', strtotime('-60 days'))]);
    $rows = $q->fetchAll();
    $max = max(array_column($rows, 'clicks') ?: [1]);
    $sum60 = array_sum(array_column($rows, 'clicks'));
    $t = '';
    foreach ($rows as $r) {
        $w = (int)round($r['clicks'] / $max * 100);
        $t .= '<tr><td class="date">' . h($r['day']) . '</td><td class="num">' . (int)$r['clicks'] . '</td>'
            . '<td style="width:65%"><div class="bar" style="width:' . max($w, 1) . '%"></div></td></tr>';
    }
    $short = base_url() . $c;
    admin_page('Statystyki ' . $c, '<p><a href="' . $adm . '">← Wszystkie linki</a></p>
<p class="eyebrow" style="margin-top:32px">Statystyki</p><h1 class="mono" style="font-family:var(--bs-font-mono);font-weight:400;font-size:40px">' . h($short) . '</h1>
<p class="lede">' . h($l['url']) . '</p>' . ($l['note'] !== '' ? '<p>' . h($l['note']) . '</p>' : '') . '
<div class="stats"><div><div class="eyebrow">Kliknięcia łącznie</div><div class="score">' . (int)$l['clicks'] . '</div></div>
<div><div class="eyebrow">Ostatnie 60 dni</div><div class="score">' . (int)$sum60 . '</div></div>
<div><div class="eyebrow">Utworzony</div><div class="score" style="font-size:28px;margin-top:22px">' . h(substr($l['created_at'], 0, 10)) . '</div></div></div>
<p>' . copy_btn($short) . '</p>
<h2>Dzień po dniu</h2><table><tr><th>Dzień</th><th class="r">Kliknięcia</th><th></th></tr>'
        . ($t ?: '<tr><td colspan="3"><em>Nikt jeszcze nie kliknął.</em></td></tr>') . '</table>');
    exit;
}

// ----- lista -----
$search = trim((string)($_GET['q'] ?? ''));
if ($search !== '') {
    $q = db()->prepare('SELECT * FROM links WHERE code LIKE ? OR url LIKE ? OR note LIKE ? ORDER BY id DESC LIMIT 500');
    $like = '%' . $search . '%'; $q->execute([$like, $like, $like]);
} else {
    $q = db()->query('SELECT * FROM links ORDER BY id DESC LIMIT 500');
}
$all = $q->fetchAll();
$total = (int)db()->query('SELECT COUNT(*) FROM links')->fetchColumn();
$clicks = (int)db()->query('SELECT COALESCE(SUM(clicks),0) FROM links')->fetchColumn();

$rows = '';
foreach ($all as $l) {
    $short = base_url() . $l['code'];
    $rows .= '<tr><td class="code"><a href="' . h($short) . '" target="_blank" rel="noopener">' . h($l['code']) . '</a><br>' . copy_btn($short) . '</td>
<td class="url">' . h($l['url']) . ($l['note'] !== '' ? '<small>' . h($l['note']) . '</small>' : '') . '</td>
<td class="num"><a href="' . $adm . '?stats=' . urlencode($l['code']) . '" title="Statystyki">' . (int)$l['clicks'] . '</a></td>
<td class="date">' . h(substr($l['created_at'], 0, 10)) . '</td>
<td style="text-align:right"><form method="post" data-confirm="Usunąć ' . h($l['code']) . '?">' . csrf_field() . '
<input type="hidden" name="act" value="del"><input type="hidden" name="code" value="' . h($l['code']) . '"><button class="lnk">Usuń</button></form></td></tr>';
}

$top = '';
if ($msg !== '') {
    $s = base_url() . $msg;
    $top = '<div class="note ok"><div class="eyebrow" style="margin-bottom:10px">Gotowe</div><a class="short" href="' . h($s) . '" target="_blank" rel="noopener">' . h($s) . '</a>' . copy_btn($s) . '</div>';
}
if ($err !== '') $top = '<div class="note">' . h($err) . '</div>';

admin_page('Linki', '<p class="eyebrow">Nowy link</p><h1>Skróć adres</h1>' . $top . '
<form method="post">' . csrf_field() . '<input type="hidden" name="act" value="add">
<label class="eyebrow" for="url" style="margin-top:24px">Długi adres</label>
<input class="big" type="url" id="url" name="url" placeholder="https://…" required autofocus>
<div class="row"><input name="alias" placeholder="własny alias, np. warsztat" pattern="[A-Za-z0-9_\-]{2,64}" title="2–64 znaki: litery, cyfry, - i _">
<input name="note" placeholder="notatka, np. newsletter 45" maxlength="200"><button>Skróć</button></div></form>

<div class="stats" style="margin-top:72px"><div><div class="eyebrow">Linki</div><div class="score">' . $total . '</div></div>
<div><div class="eyebrow">Kliknięcia</div><div class="score">' . $clicks . '</div></div></div>

<form method="get" class="row search"><input name="q" value="' . h($search) . '" placeholder="szukaj po kodzie, adresie albo notatce"><button class="ghost">Szukaj</button></form>
<table><tr><th>Kod</th><th>Adres docelowy</th><th class="r">Kliknięcia</th><th class="date">Dodany</th><th></th></tr>'
    . ($rows ?: '<tr><td colspan="5"><em>' . ($search !== '' ? 'Nic nie pasuje do wyszukiwania.' : 'Nie masz jeszcze żadnych linków.') . '</em></td></tr>') . '</table>');
