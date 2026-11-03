<?php
// Serwer testowy PHP nie czyta .htaccess. Ten router robi to samo co reguły z public_html/.htaccess.
// Nagłówek X-Test-IP pozwala testom udawać wiele adresów; router nie trafia na serwer produkcyjny.
if (isset($_SERVER['HTTP_X_TEST_IP'])) $_SERVER['REMOTE_ADDR'] = $_SERVER['HTTP_X_TEST_IP'];
$sciezka = (string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/assets/#', $sciezka)) return false;
$_SERVER['SCRIPT_NAME'] = '/index.php';
require getcwd() . '/index.php';
