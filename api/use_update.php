<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$useId = isset($_POST['id']) ? (int)$_POST['id'] : 0;
if ($useId <= 0) api_error('Bad id', 400);

$level = trim((string)($_POST['level'] ?? ''));
$interpretation = trim((string)($_POST['interpretation'] ?? ''));
$useText = trim((string)($_POST['use'] ?? ''));
$translate = trim((string)($_POST['translate'] ?? ''));

$t1 = isset($_POST['tema1']) ? (int)$_POST['tema1'] : 0;
$t2 = isset($_POST['tema2']) ? (int)$_POST['tema2'] : 0;
$t3 = isset($_POST['tema3']) ? (int)$_POST['tema3'] : 0;

$allowedLevels = ['A1','A2','A2+','B1','B2','B2+','C1','WL'];
if ($level === '' || !in_array($level, $allowedLevels, true)) api_error('Bad level', 400);
if ($useText === '') api_error('use is required', 400);
if ($translate === '') api_error('translate is required', 400);

// авто-очистка дублей тем (только внутри use)
if ($t1 !== 0) {
    if ($t2 === $t1) $t2 = 0;
    if ($t3 === $t1) $t3 = 0;
}
if ($t2 !== 0 && $t3 === $t2) $t3 = 0;

try {
    $st = $pdo->prepare("
        UPDATE `use`
        SET level = :level,
            interpretation = :interp,
            `use` = :utxt,
            translate = :tr,
            tema1 = :t1,
            tema2 = :t2,
            tema3 = :t3
        WHERE id = :id
    ");
    $st->execute([
        ':level' => $level,
        ':interp' => $interpretation, // может быть ''
        ':utxt' => $useText,
        ':tr' => $translate,
        ':t1' => $t1,
        ':t2' => $t2,
        ':t3' => $t3,
        ':id' => $useId,
    ]);

    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('use_update error: ' . $e->getMessage());
    api_error('DB error', 500);
}