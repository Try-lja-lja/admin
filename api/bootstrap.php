<?php
declare(strict_types=1);

/**
 * admin/api/bootstrap.php
 * Единый старт для всех /admin/api/*.php
 *
 * ВАЖНО: при переносе на основной сервер обычно меняется только /admin/config.php
 */

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

// Всегда JSON-ответы
if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
}

if (basename($_SERVER['SCRIPT_NAME'] ?? '') === 'bootstrap.php') {
    http_response_code(404);
    exit;
}

// Конфиг + подключение к БД + общие справочники
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../common.php';
require_once __DIR__ . '/../connect.php';

ini_set('display_errors', '0');
error_reporting(E_ALL);

// Авторизация
if (empty($_SESSION['admin_ok'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'unauthorized'], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Утилита для единых ошибок
 */
function api_error(string $msg, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}