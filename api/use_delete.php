<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$useId = isset($_POST['id']) ? (int)$_POST['id'] : 0;
if ($useId <= 0) api_error('Bad id', 400);

try {
    $pdo->beginTransaction();

    // найдём word_id этого use
    $st = $pdo->prepare("SELECT word_id FROM `use` WHERE id = :id FOR UPDATE");
    $st->execute([':id' => $useId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $pdo->rollBack();
        api_error('use not found', 404);
    }
    $wordId = (int)$row['word_id'];

    // сколько use у слова сейчас
    $st = $pdo->prepare("SELECT COUNT(*) AS c FROM `use` WHERE word_id = :wid");
    $st->execute([':wid' => $wordId]);
    $cnt = (int)($st->fetch(PDO::FETCH_ASSOC)['c'] ?? 0);

    // по факту "после удаления останется 0" запрещаем
    if (($cnt - 1) < 1) {
        $pdo->rollBack();
        api_error('Нельзя удалить последнее использование слова', 400);
    }

    // каскад по useId
    $pdo->prepare("DELETE FROM dictionary_sinonim WHERE use_ID = :uid")->execute([':uid' => $useId]);
    $pdo->prepare("DELETE FROM dictionary_antonim WHERE use_id = :uid")->execute([':uid' => $useId]);
    $pdo->prepare("DELETE FROM idiom WHERE use_ID = :uid")->execute([':uid' => $useId]);

    // удаляем use
    $pdo->prepare("DELETE FROM `use` WHERE id = :id")->execute([':id' => $useId]);

    $pdo->commit();

    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('use_delete error: ' . $e->getMessage());
    api_error('DB error', 500);
}