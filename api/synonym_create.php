<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$useId = isset($_POST['use_id']) ? (int)$_POST['use_id'] : 0;
if ($useId <= 0) api_error('Bad use_id', 400);

$items = $_POST['items'] ?? [];
if (!is_array($items)) api_error('მონაცემები უნდა იყოს მასივი', 400);

// нормализация + защита от дублей
$norm = [];
foreach ($items as $s) {
    $v = trim((string)$s);
    if ($v === '') continue;
    if (mb_strlen($v, 'UTF-8') > 30) api_error('სინონიმი არ უნდა აღემატებოდეს 30 სიმბოლოს', 400);
    $norm[$v] = true; // убираем дубли
}
$list = array_keys($norm);

try {
    $pdo->beginTransaction();

    $pdo->prepare("DELETE FROM dictionary_sinonim WHERE use_ID = :uid")->execute([':uid' => $useId]);

    if ($list) {
        $st = $pdo->prepare("INSERT INTO dictionary_sinonim (use_ID, sinonim) VALUES (:uid, :s)");
        foreach ($list as $v) {
            $st->execute([':uid' => $useId, ':s' => $v]);
        }
    }

    $pdo->commit();
    echo json_encode(['success' => true, 'count' => count($list)], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('synonym_create error: ' . $e->getMessage());
    api_error('DB error', 500);
}