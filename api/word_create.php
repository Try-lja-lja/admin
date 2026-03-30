<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/**
 * Возвращает имя грамматической таблицы по ID части речи.
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
 * Нормализация строки с ограничением длины 30 символов.
 */
function norm30(string $s): string
{
    $s = trim($s);
    if (mb_strlen($s, 'UTF-8') > 30) {
        api_error('ველი არ უნდა აღემატებოდეს 30 სიმბოლოს', 400);
    }
    return mb_substr($s, 0, 30, 'UTF-8');
}

$word = $_POST['word'] ?? '';
$wordView = $_POST['word_view'] ?? '';
$posId = (int)($_POST['pos'] ?? 0);

$word = norm30($word);
$wordView = norm30($wordView);

if ($word === '') {
    api_error('სიტყვა სავალდებულოა', 400);
}

if ($wordView === '') {
    api_error('სიტყვის საჩვენებელი ფორმა სავალდებულოა', 400);
}

if ($posId <= 0) {
    api_error('აუცილებელია მეტყველების ნაწილის არჩევა', 400);
}

$grammarTable = grammar_table_for_pos($posId);
if ($grammarTable === null) {
    api_error('მეტყველების ნაწილი ვერ განისაზღვრა', 400);
}

try {
    $pdo->beginTransaction();

    $st = $pdo->prepare("
        INSERT INTO words (`word`, word_view, part_of_speech_id)
        VALUES (:word, :word_view, :pos)
    ");
    $st->execute([
        ':word' => $word,
        ':word_view' => $wordView,
        ':pos' => $posId,
    ]);

    $newWordId = (int)$pdo->lastInsertId();

    $st = $pdo->prepare("INSERT INTO `$grammarTable` (word_ID) VALUES (:word_id)");
    $st->execute([
        ':word_id' => $newWordId,
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'created' => [
            'id' => $newWordId,
            'word' => $word,
            'word_view' => $wordView,
            'pos' => $posId,
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('word_create error: ' . $e->getMessage());
    api_error('დამატება ვერ მოხერხდა', 500);
}