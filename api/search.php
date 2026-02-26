<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

// ===== Получаем фильтры (POST — как ждёт admn.js) =====
$tema           = FormChars($_POST['tema']           ?? '43');
$level          = FormChars($_POST['level']          ?? 'all');
$part_of_speech = FormChars($_POST['part_of_speech'] ?? '13');
$word           = FormChars($_POST['word']           ?? '');
$letter         = FormChars($_POST['letter']         ?? '');

// Нормализуем "пустую букву"
$letter_is_empty = ($letter === '' || $letter === 'ყველა ასო');

$rows = [];

try {
    $noFilters =
        ($tema === '43') &&
        ($level === 'all') &&
        ($part_of_speech === '13') &&
        ($word === '') &&
        $letter_is_empty;

    if ($noFilters) {
        $sql = "
            SELECT
                w.id,
                w.word_view,
                MIN(u.level) AS level
            FROM words AS w
            JOIN `use` AS u ON u.word_id = w.id
            GROUP BY w.id, w.word_view
            ORDER BY w.word_view ASC
        ";

        $stmt = $pdo->query($sql);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    } else {
        $sql = "
            SELECT
                w.id,
                w.word_view,
                MIN(u.level) AS level
            FROM words AS w
            JOIN `use` AS u ON u.word_id = w.id
        ";

        $conditions = [];
        $params = [];

        if ($tema !== '43') {
            $conditions[] = "(u.tema1 = :t1 OR u.tema2 = :t2 OR u.tema3 = :t3)";
            $params[':t1'] = (int)$tema;
            $params[':t2'] = (int)$tema;
            $params[':t3'] = (int)$tema;
        }

        if ($level !== 'all') {
            $conditions[] = "u.level = :level";
            $params[':level'] = $level;
        }

        if ($part_of_speech !== '13') {
            $conditions[] = "w.part_of_speech_id = :pos";
            $params[':pos'] = (int)$part_of_speech;
        }

        if ($word !== '') {
            $conditions[] = "w.word_view LIKE :word";
            $params[':word'] = $word . '%';
        }

        if (!$letter_is_empty) {
            $conditions[] = "w.word_view LIKE :letter";
            $params[':letter'] = $letter . '%';
        }

        if ($conditions) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }

        $sql .= ' GROUP BY w.id, w.word_view ORDER BY w.word_view ASC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    echo json_encode(['rows' => $rows], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'DB error'], JSON_UNESCAPED_UNICODE);
    error_log('admin/api/search.php error: ' . $e->getMessage());
}