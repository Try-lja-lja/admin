<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$wordId = isset($_POST['word_id']) ? (int)$_POST['word_id'] : 0;
if ($wordId <= 0) {
    api_error('არასწორი სიტყვის იდენტიფიკატორი', 400);
}

try {
    $st = $pdo->prepare("SELECT id FROM words WHERE id = :id LIMIT 1");
    $st->execute([':id' => $wordId]);
    $word = $st->fetch(PDO::FETCH_ASSOC);

    if (!$word) {
        api_error('სიტყვა ვერ მოიძებნა', 404);
    }

    $st = $pdo->prepare("
        INSERT INTO `use` (
            word_ID,
            interpretation,
            `use`,
            level,
            translate,
            tema1,
            tema2,
            tema3
        ) VALUES (
            :word_id,
            :interpretation,
            :use_text,
            :level,
            :translate,
            :tema1,
            :tema2,
            :tema3
        )
    ");

    $st->execute([
        ':word_id' => $wordId,
        ':interpretation' => '',
        ':use_text' => '',
        ':level' => 'WL',
        ':translate' => '',
        ':tema1' => 0,
        ':tema2' => 0,
        ':tema3' => 0,
    ]);

    echo json_encode([
        'success' => true,
        'id' => (int)$pdo->lastInsertId(),
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    error_log('use_create error: ' . $e->getMessage());
    api_error('მონაცემთა ბაზის შეცდომა', 500);
}