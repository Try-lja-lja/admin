<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$useId = isset($_POST['use_id']) ? (int)$_POST['use_id'] : 0;
if ($useId <= 0) api_error('Bad use_id', 400);

$items = $_POST['items'] ?? null;
/*
items = [
  ['idiom'=>'...', 'interpretation'=>'...', 'use'=>'...'],
  ...
]
*/
if (!is_array($items)) api_error('items must be array', 400);

$clean = [];
foreach ($items as $it) {
    if (!is_array($it)) continue;
    $idiom = trim((string)($it['idiom'] ?? ''));
    if ($idiom === '') continue; // обязательное
    if (mb_strlen($idiom, 'UTF-8') > 30) api_error('Idiom не должен превышать 30 символов', 400);

    // защита от дублей по идиоме (простая)
    $key = $idiom;

    $clean[$key] = [
        'idiom' => $idiom,
        'interpretation' => trim((string)($it['interpretation'] ?? '')),
        'use' => trim((string)($it['use'] ?? '')),
    ];
}
$list = array_values($clean);

try {
    $pdo->beginTransaction();

    $pdo->prepare("DELETE FROM idiom WHERE use_ID = :uid")->execute([':uid' => $useId]);

    if ($list) {
        $st = $pdo->prepare("
            INSERT INTO idiom (use_ID, idiom, idiom_interpretation, idiom_use)
            VALUES (:uid, :i, :interp, :u)
        ");
        foreach ($list as $it) {
            $st->execute([
                ':uid' => $useId,
                ':i' => $it['idiom'],
                ':interp' => $it['interpretation'],
                ':u' => $it['use'],
            ]);
        }
    }

    $pdo->commit();
    echo json_encode(['success' => true, 'count' => count($list)], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('idiom_create error: ' . $e->getMessage());
    api_error('DB error', 500);
}