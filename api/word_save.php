<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

// Функция для получения имени грамматической таблицы по части речи
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

// Функция для удаления грамматической записи для старой части речи
function delete_grammar(PDO $pdo, int $wordId, int $posId): void
{
    $tbl = grammar_table_for_pos($posId);
    if (!$tbl) {
        return;
    }

    $st = $pdo->prepare("DELETE FROM `$tbl` WHERE word_ID = :wid");
    $st->execute([':wid' => $wordId]);
}

// Функция для вставки новой грамматической записи с пустыми значениями
function insert_empty_grammar(PDO $pdo, int $wordId, int $posId): void
{
    $tbl = grammar_table_for_pos($posId);
    if (!$tbl) {
        return;
    }

    $st = $pdo->prepare("DELETE FROM `$tbl` WHERE word_ID = :wid");
    $st->execute([':wid' => $wordId]);

    $st = $pdo->prepare("INSERT INTO `$tbl` (word_ID) VALUES (:wid)");
    $st->execute([':wid' => $wordId]);
}

// Функция для нормализации строки (удаляет пробелы, обрезает до 30 символов и проверяет длину)
function norm30(string $s): string
{
    $s = trim($s); // Убираем пробелы по краям
    if (mb_strlen($s, 'UTF-8') > 30) {
        api_error("Поле не должно превышать 30 символов", 400);
    }
    return mb_substr($s, 0, 30, 'UTF-8'); // Обрезаем строку до 30 символов
}

$wordId  = (int)($_POST['id'] ?? 0);
$word    = $_POST['word'] ?? '';
$word_view = $_POST['word_view'] ?? '';
$newPos  = (int)($_POST['pos'] ?? 0);

if ($wordId <= 0) {
    api_error('Bad id', 400);
}
if (empty($word)) {
        api_error('word cannot be empty', 400);
}
if (empty($word_view)) {
        api_error('word_view cannot be empty', 400);
}

// Применяем нормализацию к слову и отображаемому слову
$word = norm30($word);
$word_view = norm30($word_view);

try {
    $pdo->beginTransaction();


    // Получаем текущую часть речи из базы данных
    $st = $pdo->prepare("SELECT part_of_speech_id FROM words WHERE id = :id FOR UPDATE");
    $st->execute([':id' => $wordId]);
    $cur = $st->fetch(PDO::FETCH_ASSOC);
    if (!$cur) {
        throw new RuntimeException('Word not found', 404);
    }

    $oldPos = (int)$cur['part_of_speech_id']; // Текущая часть речи

    // Если часть речи изменена, удаляем старую грамматическую запись и добавляем новую
    if ($newPos && $newPos !== $oldPos) {
        $st = $pdo->prepare("
        UPDATE words
        SET `word` = :w, word_view = :wv, part_of_speech_id = :pos
        WHERE id = :id
        ");

        $st->execute([
            ':w'   => $word,
            ':wv'  => $word_view,
            ':id'  => $wordId,
            ':pos' => $newPos,
        ]);

        delete_grammar($pdo, $wordId, $oldPos);
        insert_empty_grammar($pdo, $wordId, $newPos);
    } else {
        // Если часть речи не изменилась, просто обновляем слово и его отображение
        $st = $pdo->prepare("
        UPDATE words
        SET `word` = :w, word_view = :wv
        WHERE id = :id
    ");

        $st->execute([
            ':w'   => $word,
            ':wv'  => $word_view,
            ':id'  => $wordId,
            ]);
    }

    $finalPos = ($newPos > 0) ? $newPos : $oldPos;

    $pdo->commit();

    echo json_encode([
    'success' => true,
    'updated' => [
        'id' => $wordId,
        'word' => $word,
        'word_view' => $word_view,
        'pos' => $finalPos,
    ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('word_save error: ' . $e->getMessage());

    if ($e instanceof RuntimeException && $e->getCode() === 404) {
        api_error('Word not found', 404);
    }

    api_error('DB error: ' . $e->getMessage(), 500);
}
