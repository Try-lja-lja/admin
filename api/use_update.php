<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$useId = isset($_POST['id']) ? (int)$_POST['id'] : 0;
if ($useId <= 0) {
    api_error('არასწორი ჩანაწერის იდენტიფიკატორი', 400);
}

$level = trim((string)($_POST['level'] ?? ''));
$interpretation = trim((string)($_POST['interpretation'] ?? ''));
$useText = trim((string)($_POST['use'] ?? ''));
$translate = trim((string)($_POST['translate'] ?? ''));

$t1 = isset($_POST['tema1']) ? (int)$_POST['tema1'] : 0;
$t2 = isset($_POST['tema2']) ? (int)($_POST['tema2']) : 0;
$t3 = isset($_POST['tema3']) ? (int)($_POST['tema3']) : 0;

/**
 * 1) Валидация уровня
 * Берём допустимые значения из common.php через $LEVEL,
 * но "all" исключаем, так как это только значение фильтра.
 */
$allowedLevels = array_keys($LEVEL);
$allowedLevels = array_values(array_filter(
    $allowedLevels,
    static fn(string $v): bool => $v !== 'all'
));

if ($level === '' || !in_array($level, $allowedLevels, true)) {
    api_error('არასწორი დონე', 400);
}

/**
 * 2) Обязательные поля
 */
if ($useText === '') {
    api_error('ველის „გამოყენება“ შევსება სავალდებულოა', 400);
}

if ($translate === '') {
    api_error('ველის „თარგმანი“ შევსება სავალდებულოა', 400);
}

/**
 * 3) Валидация тем
 * Разрешаем только:
 * - 0 ("без темы")
 * - реальные ключи из $TOPICS
 * При этом 43 ("ყველა") запрещаем, потому что это только фильтр.
 */
$allowedTopicIds = array_keys($TOPICS);
$allowedTopicIds = array_values(array_filter(
    $allowedTopicIds,
    static fn(string $v): bool => $v !== '43'
));

$allowedTopicIds = array_map('intval', $allowedTopicIds);

$validateTopic = static function (int $topicId, array $allowedTopicIds): int {
    return in_array($topicId, $allowedTopicIds, true) ? $topicId : 0;
};

$t1 = $validateTopic($t1, $allowedTopicIds);
$t2 = $validateTopic($t2, $allowedTopicIds);
$t3 = $validateTopic($t3, $allowedTopicIds);

/**
 * 4) Автоочистка дублей тем внутри одного use
 */
if ($t1 !== 0) {
    if ($t2 === $t1) {
        $t2 = 0;
    }
    if ($t3 === $t1) {
        $t3 = 0;
    }
}
if ($t2 !== 0 && $t3 === $t2) {
    $t3 = 0;
}

try {
    /**
     * 5) Проверяем, что use существует
     */
    $st = $pdo->prepare("SELECT id FROM `use` WHERE id = :id LIMIT 1");
    $st->execute([':id' => $useId]);
    $exists = $st->fetch(PDO::FETCH_ASSOC);

    if (!$exists) {
        api_error('გამოყენება ვერ მოიძებნა', 404);
    }

    /**
     * 6) Обновляем запись
     */
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
        ':level'  => $level,
        ':interp' => $interpretation,
        ':utxt'   => $useText,
        ':tr'     => $translate,
        ':t1'     => $t1,
        ':t2'     => $t2,
        ':t3'     => $t3,
        ':id'     => $useId,
    ]);

    /**
     * 7) Возвращаем обновлённые данные
     */
    echo json_encode([
        'success' => true,
        'use' => [
            'id' => $useId,
            'level' => $level,
            'interpretation' => $interpretation,
            'use_text' => $useText,
            'translate' => $translate,
            'tema1' => $t1,
            'tema2' => $t2,
            'tema3' => $t3,
        ],
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    error_log('use_update error: ' . $e->getMessage());
    api_error('მონაცემთა ბაზის შეცდომა', 500);
}