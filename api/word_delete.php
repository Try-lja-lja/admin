<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/**
 * Возвращает имя грамматической таблицы по ID части речи.
 * Логику берем ту же, что уже используется в word_save.php.
 */
function grammar_table_for_pos(int $posId): ?string
{
    return match ($posId) {
        1  => 'noun',
        2  => 'adjective',
        3  => 'numeral',
        4  => 'pronoun',
        5  => 'verb',
        6  => 'verbnoun',
        7  => 'participle',
        8  => 'adverb',
        9  => 'particle',
        10 => 'conjunction',
        11 => 'postposition',
        12 => 'interjection',
        default => null,
    };
}

/**
 * Строит плейсхолдеры ?, ?, ? для IN (...)
 */
function build_in_placeholders(int $count): string
{
    return implode(',', array_fill(0, $count, '?'));
}

$wordId = (int)($_POST['id'] ?? 0);

if ($wordId <= 0) {
    api_error('არასწორი იდენტიფიკატორი', 400);
}

try {
    $pdo->beginTransaction();

    /**
     * 1. Проверяем, что слово существует, и получаем его часть речи.
     * FOR UPDATE оставляем, чтобы зафиксировать строку на время удаления.
     */
    $st = $pdo->prepare('
        SELECT part_of_speech_id
        FROM words
        WHERE id = :id
        FOR UPDATE
    ');
    $st->execute([':id' => $wordId]);

    $wordRow = $st->fetch(PDO::FETCH_ASSOC);

    if (!$wordRow) {
        throw new RuntimeException('სიტყვა ვერ მოიძებნა', 404);
    }

    $posId = (int)$wordRow['part_of_speech_id'];
    $grammarTable = grammar_table_for_pos($posId);

    /**
     * 2. Получаем все use.id для этого слова.
     * В таблице use связь идет по полю word_ID.
     */
    $st = $pdo->prepare('
        SELECT id
        FROM `use`
        WHERE word_ID = :word_id
    ');
    $st->execute([':word_id' => $wordId]);

    $useIds = array_map(
        'intval',
        $st->fetchAll(PDO::FETCH_COLUMN)
    );

    /**
     * 3. Если использования есть — удаляем связанные записи:
     *    synonyms, antonyms, idioms.
     */
    if (!empty($useIds)) {
        $placeholders = build_in_placeholders(count($useIds));

        $st = $pdo->prepare("
            DELETE FROM dictionary_sinonim
            WHERE use_ID IN ($placeholders)
        ");
        $st->execute($useIds);

        $st = $pdo->prepare("
            DELETE FROM dictionary_antonim
            WHERE use_id IN ($placeholders)
        ");
        $st->execute($useIds);

        $st = $pdo->prepare("
            DELETE FROM idiom
            WHERE use_ID IN ($placeholders)
        ");
        $st->execute($useIds);
    }

    /**
     * 4. Удаляем все use этого слова.
     */
    $st = $pdo->prepare('
        DELETE FROM `use`
        WHERE word_ID = :word_id
    ');
    $st->execute([':word_id' => $wordId]);

    /**
     * 5. Удаляем грамматическую запись слова из нужной таблицы.
     * Если для части речи таблица не определена — просто пропускаем.
     */
    if ($grammarTable !== null) {
        $st = $pdo->prepare("DELETE FROM `$grammarTable` WHERE word_ID = :word_id");
        $st->execute([':word_id' => $wordId]);
    }

    /**
     * 6. Удаляем само слово.
     */
    $st = $pdo->prepare('
        DELETE FROM words
        WHERE id = :id
    ');
    $st->execute([':id' => $wordId]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'deleted' => [
            'id' => $wordId,
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('word_delete error: ' . $e->getMessage());

    if ($e instanceof RuntimeException && $e->getCode() === 404) {
        api_error('სიტყვა ვერ მოიძებნა', 404);
    }

    api_error('წაშლა ვერ მოხერხდა', 500);
}