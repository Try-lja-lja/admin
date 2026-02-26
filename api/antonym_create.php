<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$useId = isset($_POST['use_id']) ? (int)$_POST['use_id'] : 0;
if ($useId <= 0) api_error('Bad use_id', 400);

$items = $_POST['items'] ?? null;
if (!is_array($items)) api_error('items must be array', 400);

$norm = [];
foreach ($items as $s) {
    $v = trim((string)$s);
    if ($v === '') continue;
    if (mb_strlen($v, 'UTF-8') > 30) api_error('Антоним не должен превышать 30 символов', 400);
    $norm[$v] = true;
}
$list = array_keys($norm);

try {
    $pdo->beginTransaction();

    $pdo->prepare("DELETE FROM dictionary_antonim WHERE use_id = :uid")->execute([':uid' => $useId]);

    if ($list) {
        $st = $pdo->prepare("INSERT INTO dictionary_antonim (use_id, antonim) VALUES (:uid, :s)");
        foreach ($list as $v) {
            $st->execute([':uid' => $useId, ':s' => $v]);
        }
    }

    $pdo->commit();
    echo json_encode(['success' => true, 'count' => count($list)], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('antonym_create error: ' . $e->getMessage());
    api_error('DB error', 500);
}