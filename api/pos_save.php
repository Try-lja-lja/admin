<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$wordId  = (int)($_POST['wid'] ?? 0);
$newPos  = (int)($_POST['p'] ?? 0);
$confirm = (int)($_POST['c'] ?? 0);

if ($wordId <= 0) api_error('Bad id', 400);
if ($newPos <= 0) api_error('Bad POS', 400);

// Функция для определения грамматической таблицы по POS
function grammar_table_for_pos(int $posId): ?string {
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

// Функции для работы с грамматикой
function delete_grammar(PDO $pdo, int $wordId, int $posId): void {
    $tbl = grammar_table_for_pos($posId);
    if (!$tbl) return;
    $st = $pdo->prepare("DELETE FROM `$tbl` WHERE word_ID = :wid");
    $st->execute([':wid' => $wordId]);
}

function insert_empty_grammar(PDO $pdo, int $wordId, int $posId): void {
    switch ($posId) {
        case 8: // adverb
        case 9: // particle
        case 10: // conjunction
        case 12: // interjection
            $tbl = grammar_table_for_pos($posId);
            $st = $pdo->prepare("INSERT INTO `$tbl` (word_ID, semantic_group) VALUES (:wid, '-')");
            $st->execute([':wid' => $wordId]);
            return;
        // добавьте другие части речи и их логику сюда
    }
}

// Функция для проверки пустой грамматической строки
function grammar_row_fetch(PDO $pdo, int $wordId, int $posId): ?array {
    $tbl = grammar_table_for_pos($posId);
    if (!$tbl) return null;
    $st = $pdo->prepare("SELECT * FROM `$tbl` WHERE word_ID = :wid LIMIT 1");
    $st->execute([':wid' => $wordId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

// Функция для проверки пустой строки в грамматической таблице
function grammar_is_empty_row(int $posId, array $row): bool {
    unset($row['id'], $row['word_ID']);

    $isDash = static fn($v) => ((string)$v === '-');
    $isZero = static fn($v) => ((string)$v === '0' || (int)$v === 0);

    switch ($posId) {
        case 8:  // adverb
        case 9:  // particle
        case 10: // conjunction
        case 12: // interjection
            return $isDash($row['semantic_group'] ?? '-');

        case 11: // postposition
            return $isZero($row['case'] ?? 0);

        case 3: // numeral
            if ((string)($row['kind'] ?? '0') !== '0') return false;
            foreach (['ergative_s','dative_s','genetive_s','instrumental_s','transformative_s','vocative_s'] as $f) {
                if (!$isDash($row[$f] ?? '-')) return false;
            }
            return true;

        case 6: // verbnoun
            if (!$isDash($row['verb'] ?? '-')) return false;
            foreach (['ergative_s','dative_s','genetive_s','instrumental_s','transformative_s','vocative_s'] as $f) {
                if (!$isDash($row[$f] ?? '-')) return false;
            }
            return true;

        case 7: // participle
            if (!$isDash($row['verb'] ?? '-')) return false;
            if (!$isDash($row['voice'] ?? '-')) return false;
            foreach ([ 
                'ergative_s','dative_s','genetive_s','instrumental_s','transformative_s','vocative_s',
                'nominative_p','ergative_p','dative_p','genetive_p','instrumental_p','transformative_p','vocative_p'
            ] as $f) {
                if (!$isDash($row[$f] ?? '-')) return false;
            }
            return true;

        case 1: // noun
            foreach ([
                'ergative_s','dative_s','genetive_s','instrumental_s','transformative_s','vocative_s',
                'nominative_p','ergative_p','dative_p','genetive_p','instrumental_p','transformative_p','vacative_p'
            ] as $f) {
                if (!$isDash($row[$f] ?? '-')) return false;
            }
            return true;

        case 2: // adjective
            foreach ([
                'normal_degree','comparative_degree','superlative_degree',
                'ergative_s','dative_s','genetive_s','instrumental_s','transformative_s','vocative_s',
                'nominative_p','ergative_p','dative_p','genetive_p','instrumental_p','transformative_p','vocative_p'
            ] as $f) {
                if (!$isDash($row[$f] ?? '-')) return false;
            }
            return true;

        case 4: // pronoun
            if (!$isDash($row['characteristic'] ?? '-')) return false;
            foreach ([
                'ergative_s','dative_s','genetive_s','instrumental_s','transformative_s','vocative_s',
                'ergative_p','dative_p','genetive_p','instrumental_p','transformative_p','vocative_p'
            ] as $f) {
                if (!$isDash($row[$f] ?? '-')) return false;
            }
            return true;

        case 5: // verb
            if ((string)($row['infinitive'] ?? '-') !== '-') return false;
            if ((string)($row['transilive_intransilive'] ?? '-') !== '-') return false;
            if ((string)($row['voice'] ?? '-') !== '-') return false;
            if ((string)($row['peculiarity'] ?? '-') !== '-') return false;
            foreach ([
                'present_lindicative','imperfect','present_stubjunctive','future','conditional','future_subjunctive',
                'aorist','conjuctive_II','resultative_I','resultative_II','conjuctive_III'
            ] as $f) {
                if ((string)($row[$f] ?? '-') !== '-') return false;
            }
            return true;

        default:
            return false;
    }
}

try {
    $pdo->beginTransaction();

    // Блокируем запись
    $st = $pdo->prepare("SELECT part_of_speech_id FROM words WHERE id = :id FOR UPDATE");
    $st->execute([':id' => $wordId]);
    $cur = $st->fetch(PDO::FETCH_ASSOC);
    if (!$cur) {
        $pdo->rollBack();
        api_error('Word not found', 404);
    }

    $oldPos = (int)$cur['part_of_speech_id'];
    if ($oldPos === $newPos) {
        $pdo->commit();
        echo json_encode(['success' => true, 'updated' => ['id' => $wordId, 'pos' => $newPos, 'oldPos' => $oldPos]], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Подтверждение изменения POS, если нужно
    $oldRow = grammar_row_fetch($pdo, $wordId, $oldPos);
    if ($oldRow && !grammar_is_empty_row($oldPos, $oldRow) && $confirm !== 1) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'error' => 'pos_change_confirm_required',
            'message' => 'При смене части речи будет удалена старая грамматика. Подтвердите.',
            'needs_confirm' => true,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Обновляем POS в таблице words
    $st = $pdo->prepare("UPDATE words SET part_of_speech_id = :p WHERE id = :id");
    $st->execute([':p' => $newPos, ':id' => $wordId]);

    // Грамматические изменения
    delete_grammar($pdo, $wordId, $oldPos);
    insert_empty_grammar($pdo, $wordId, $newPos);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'updated' => ['id' => $wordId, 'pos' => $newPos, 'oldPos' => $oldPos],
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('pos_change error: ' . $e->getMessage());
    api_error('DB error', 500);
}