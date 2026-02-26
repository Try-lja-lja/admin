<?php
// /admin/connect.php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

if (!extension_loaded('pdo') || !extension_loaded('pdo_mysql')) {
    http_response_code(500);
    die('PDO / pdo_mysql extension missing.');
}

$dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;

$pdoOptions = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $pdoOptions);
} catch (PDOException $e) {
    error_log('ADMN DB connection error: ' . $e->getMessage());
    http_response_code(500);
    exit('DB connection error.');
}

function pdo(): PDO {
    global $pdo;
    return $pdo;
}