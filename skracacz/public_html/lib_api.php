<?php
// POST /api   pola: url, [alias], [note]   klucz w nagłówku X-Api-Key albo w polu key
if (!defined('API_KEY')) exit;

if (API_KEY === '') json_out(403, ['error' => 'API wyłączone']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST'); // klucz w adresie trafiałby do logów serwera i historii przeglądarki
    json_out(405, ['error' => 'Użyj POST.']);
}

$in = $_POST;
if (strpos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false) {
    $in = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($in)) $in = [];
}
$field = function (string $name) use ($in): string {
    return is_scalar($in[$name] ?? null) ? (string)$in[$name] : '';
};
$key = $_SERVER['HTTP_X_API_KEY'] ?? $field('key');
if (!hash_equals(API_KEY, $key)) json_out(401, ['error' => 'Zły klucz API']);

[$code, $err] = create_link($field('url'), $field('alias'), $field('note'));
if ($err) json_out(400, ['error' => $err]);
json_out(201, ['short' => base_url() . $code, 'code' => $code]);
