<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

final class GrammarSaveException extends RuntimeException
{
    public function httpCode(): int
    {
        $code = $this->getCode();
        return ($code >= 100 && $code <= 599) ? $code : 400;
    }
}

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
 * Какие поля клиент ОБЯЗАН прислать для каждой части речи.
 * Имена должны совпадать с тем, что сейчас собирает collectGrammarData() в admn.js.
 */
function grammar_fields_for_pos(int $posId): array
{
    return match ($posId) {
        1 => [
            'nominative_p',
            'ergative_s',
            'ergative_p',
            'dative_s',
            'dative_p',
            'genetive_s',
            'genetive_p',
            'instrumental_s',
            'instrumental_p',
            'transformative_s',
            'transformative_p',
            'vocative_s',
            'vacative_p',
        ],

        2 => [
            'normal_degree',
            'comparative_degree',
            'superlative_degree',
            'nominative_p',
            'ergative_s',
            'ergative_p',
            'dative_s',
            'dative_p',
            'genetive_s',
            'genetive_p',
            'instrumental_s',
            'instrumental_p',
            'transformative_s',
            'transformative_p',
            'vocative_s',
            'vocative_p',
        ],

        3 => [
            'kind',
            'ergative_s',
            'dative_s',
            'genetive_s',
            'instrumental_s',
            'transformative_s',
            'vocative_s',
        ],

        4 => [
            'characteristic',
            'nominative_p',
            'ergative_s',
            'ergative_p',
            'dative_s',
            'dative_p',
            'genetive_s',
            'genetive_p',
            'instrumental_s',
            'instrumental_p',
            'transformative_s',
            'transformative_p',
            'vocative_s',
            'vocative_p',
        ],

        5 => [
            'infinitive',
            'transilive_intransilive',
            'voice',
            'peculiarity',
            'present_lindicative',
            'imperfect',
            'present_stubjunctive',
            'future',
            'conditional',
            'future_subjunctive',
            'aorist',
            'conjuctive_II',
            'resultative_I',
            'resultative_II',
            'conjuctive_III',
        ],

        6 => [
            'verb',
            'ergative_s',
            'dative_s',
            'genetive_s',
            'instrumental_s',
            'transformative_s',
            'vocative_s',
        ],

        7 => [
            'verb',
            'voice',
            'nominative_p',
            'ergative_s',
            'ergative_p',
            'dative_s',
            'dative_p',
            'genetive_s',
            'genetive_p',
            'instrumental_s',
            'instrumental_p',
            'transformative_s',
            'transformative_p',
            'vocative_s',
            'vocative_p',
        ],

        8 => ['semantic_group'],
        9 => ['semantic_group'],
        10 => ['semantic_group'],
        11 => ['case'],
        12 => ['emotic_group', 'semantic_group'],

        default => [],
    };
}

/**
 * Читает реальную структуру таблицы из БД.
 * Это позволяет не хардкодить длины varchar в PHP.
 */
function load_table_columns(PDO $pdo, string $table): array
{
    $st = $pdo->query("DESCRIBE `$table`");
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $result = [];
    foreach ($rows as $row) {
        $field = (string)($row['Field'] ?? '');
        if ($field === '') {
            continue;
        }

        $result[$field] = [
            'type'    => strtolower((string)($row['Type'] ?? '')),
            'null'    => strtoupper((string)($row['Null'] ?? 'NO')) === 'YES',
            'default' => $row['Default'] ?? null,
        ];
    }

    return $result;
}

function normalize_text_value(string $field, mixed $rawValue, string $columnType): string
{
    $value = trim((string)$rawValue);

    if ($value === '') {
        $value = '—';
    }

    if (preg_match('/^(?:varchar|char)\((\d+)\)$/i', $columnType, $m)) {
        $maxLen = (int)$m[1];
        if (mb_strlen($value, 'UTF-8') > $maxLen) {
            throw new GrammarSaveException("Field `$field` is too long", 400);
        }
    }

    return $value;
}

function normalize_int_value(string $field, mixed $rawValue, string $columnType): int
{
    $value = trim((string)$rawValue);

    if ($value === '') {
        throw new GrammarSaveException("Field `$field` cannot be empty", 400);
    }

    if (!preg_match('/^-?\d+$/', $value)) {
        throw new GrammarSaveException("Field `$field` must be integer", 400);
    }

    $intValue = (int)$value;

    // Для postposition.case у нас допустимы только 1..8
    if ($field === 'case' && ($intValue < 1 || $intValue > 8)) {
        throw new GrammarSaveException('Field `case` is out of range', 400);
    }

    return $intValue;
}

$wordId = (int)($_POST['word_id'] ?? 0);
$posId  = (int)($_POST['pos_id'] ?? 0);

if ($wordId <= 0) {
    api_error('Bad word_id', 400);
}

if ($posId <= 0) {
    api_error('Bad pos_id', 400);
}

$table = grammar_table_for_pos($posId);
if (!$table) {
    api_error('Unknown part of speech', 400);
}

$expectedFields = grammar_fields_for_pos($posId);
if (!$expectedFields) {
    api_error('No grammar fields for this part of speech', 400);
}

try {
    $pdo->beginTransaction();

    // 1) Проверяем слово и фиксируем запись
    $stWord = $pdo->prepare('SELECT id, part_of_speech_id FROM `words` WHERE id = :id FOR UPDATE');
    $stWord->execute([':id' => $wordId]);
    $word = $stWord->fetch(PDO::FETCH_ASSOC);

    if (!$word) {
        throw new GrammarSaveException('Word not found', 404);
    }

    $dbPosId = (int)($word['part_of_speech_id'] ?? 0);
    if ($dbPosId !== $posId) {
        throw new GrammarSaveException('Part of speech mismatch', 409);
    }

    // 2) Проверяем/создаем строку грамматики
    $stGrammar = $pdo->prepare("SELECT id FROM `$table` WHERE word_ID = :wid LIMIT 1 FOR UPDATE");
    $stGrammar->execute([':wid' => $wordId]);
    $grammarRow = $stGrammar->fetch(PDO::FETCH_ASSOC);

    if (!$grammarRow) {
        $stInsert = $pdo->prepare("INSERT INTO `$table` (word_ID) VALUES (:wid)");
        $stInsert->execute([':wid' => $wordId]);
    }

    // 3) Получаем реальные колонки таблицы
    $columns = load_table_columns($pdo, $table);

    // 4) Подготавливаем UPDATE
    $setParts = [];
    $params = [':word_id' => $wordId];
    $saved = [];

    foreach ($expectedFields as $field) {
        if (!array_key_exists($field, $_POST)) {
            throw new GrammarSaveException("Missing field `$field`", 400);
        }

        if (!isset($columns[$field])) {
            throw new GrammarSaveException("Unknown column `$field` in table `$table`", 500);
        }

        $columnType = (string)$columns[$field]['type'];
        $rawValue = $_POST[$field];

        if (preg_match('/^(?:tinyint|smallint|mediumint|int|bigint)\b/i', $columnType)) {
            $value = normalize_int_value($field, $rawValue, $columnType);
        } else {
            $value = normalize_text_value($field, $rawValue, $columnType);
        }

        $setParts[] = "`$field` = :$field";
        $params[":$field"] = $value;
        $saved[$field] = $value;
    }

    if (!$setParts) {
        throw new GrammarSaveException('No fields to save', 400);
    }

    $sql = "
        UPDATE `$table`
        SET " . implode(",\n            ", $setParts) . "
        WHERE word_ID = :word_id
        LIMIT 1
    ";

    $stUpdate = $pdo->prepare($sql);
    $stUpdate->execute($params);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'saved' => [
            'word_id' => $wordId,
            'pos_id' => $posId,
            'table' => $table,
            'fields' => $saved,
        ],
    ], JSON_UNESCAPED_UNICODE);

} catch (GrammarSaveException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    api_error($e->getMessage(), $e->httpCode());
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('grammar_save error: ' . $e->getMessage());
    api_error('DB error: ' . $e->getMessage(), 500);
}
