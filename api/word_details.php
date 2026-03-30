<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php'; // <- включает session + guard

$DEBUG = isset($_GET['debug']) && $_GET['debug'] == '1';

function jerr(string $msg, int $code = 500): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

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

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($id <= 0) jerr('Bad id', 400);

try {
    // === 1) слово
            $sqlWord = "SELECT w.id, w.word, w.word_view, w.part_of_speech_id AS pos_id
            FROM `words` AS w
            WHERE w.id = :id";
            $st = $pdo->prepare($sqlWord);
            $st->execute([':id' => $id]);
            $word = $st->fetch(PDO::FETCH_ASSOC);
            if (!$word) jerr('Word not found', 404);

    $posId = (string)($word['pos_id'] ?? '13');
    $posKa = $PARTS_OF_SPEECH[$posId] ?? $PARTS_OF_SPEECH['13'];
    $posEnMap = [
        '1'=>'Noun','2'=>'Adjective','3'=>'Numeral','4'=>'Pronoun','5'=>'Verb',
        '6'=>'Verbal Noun','7'=>'Participle','8'=>'Adverb','9'=>'Particle',
        '10'=>'Conjunction','11'=>'Postposition','12'=>'Interjection',
    ];
    $posEn = $posEnMap[$posId] ?? '—';
    $grammarTable = grammar_table_for_pos((int)$posId);

    // === 2) все употребления (use) для слова
    $sqlUse = "SELECT 
                  u.id,
                  u.level,
                  u.interpretation,
                  u.`use` AS use_text,
                  u.translate,
                  u.tema1, u.tema2, u.tema3
               FROM `use` AS u
               WHERE u.word_id = :id
               ORDER BY u.id ASC";
    $st = $pdo->prepare($sqlUse);
    $st->execute([':id' => $id]);
    $uses = $st->fetchAll(PDO::FETCH_ASSOC);

    // === 3) синонимы / антонимы / идиомы на каждый use
    $synSql = "SELECT s.sinonim FROM `dictionary_sinonim` AS s
               WHERE s.use_ID = :use_id ORDER BY s.id ASC";
    $antSql = "SELECT a.antonim FROM `dictionary_antonim` AS a
               WHERE a.use_id = :use_id ORDER BY a.id ASC";
    $idiomSql = "SELECT i.idiom, i.idiom_interpretation, i.idiom_use
                 FROM `idiom` AS i
                 WHERE i.use_ID = :use_id
                 ORDER BY i.id ASC";

    $sqlGrammar = "SELECT * FROM `$grammarTable` WHERE word_ID = :id LIMIT 1";
    $stGrammar = $pdo->prepare($sqlGrammar);
    $stGrammar->execute([':id' => $id]);
    $grammar = $stGrammar->fetch(PDO::FETCH_ASSOC); 

    if (!$grammar) {
        $stInsertGrammar = $pdo->prepare("INSERT INTO `$grammarTable` (word_ID) VALUES (:id)");
        $stInsertGrammar->execute([':id' => $id]);

        // Повторный запрос для получения только что вставленной записи
        $stGrammar->execute([':id' => $id]);
        $grammar = $stGrammar->fetch(PDO::FETCH_ASSOC);
    }

    $stSyn = $pdo->prepare($synSql);
    $stAnt = $pdo->prepare($antSql);
    $stIdm = $pdo->prepare($idiomSql);

    $topicName = function (?int $tid) use ($TOPICS): ?array {
        if ($tid === null) return null;
        $key = (string)$tid;
        return ['id' => $tid, 'label' => $TOPICS[$key] ?? (string)$tid];
    };

    foreach ($uses as &$u) {
        $uid = (int)$u['id'];

        // синонимы
        $stSyn->execute([':use_id' => $uid]);
        $u['synonyms'] = array_column($stSyn->fetchAll(PDO::FETCH_ASSOC), 'sinonim');

        // антонимы
        $stAnt->execute([':use_id' => $uid]);
        $u['antonyms'] = array_column($stAnt->fetchAll(PDO::FETCH_ASSOC), 'antonim');

        // темы
        $t1 = isset($u['tema1']) ? (int)$u['tema1'] : 0;
        $t2 = isset($u['tema2']) ? (int)$u['tema2'] : 0;
        $t3 = isset($u['tema3']) ? (int)$u['tema3'] : 0;
        $u['topics'] = array_values(array_filter([
            $topicName($t1),
            $topicName($t2),
            $topicName($t3),
        ]));

        // идиомы
        $stIdm->execute([':use_id' => $uid]);
        $idiomsRaw = $stIdm->fetchAll(PDO::FETCH_ASSOC);
        $idioms = [];
        foreach ($idiomsRaw as $ir) {
            $title = trim((string)($ir['idiom'] ?? ''));
            $interp = trim((string)($ir['idiom_interpretation'] ?? ''));
            $example = trim((string)($ir['idiom_use'] ?? ''));
            // Пустые строки превращаем в null, чтобы потом красиво отображать «—»
            $idioms[] = [
                'idiom' => ($title !== '') ? $title : null,
                'interpretation' => ($interp !== '') ? $interp : null,
                'use' => ($example !== '') ? $example : null,
            ];
        }
        $u['idioms'] = $idioms;

        // нормализация текстов use
        foreach (['interpretation','use_text','translate'] as $fld) {
            if (isset($u[$fld])) {
                $v = trim((string)$u[$fld]);
                $u[$fld] = ($v === '') ? null : $v;
            }
        }
    }
    unset($u);

    $metaLevels = [];
    foreach ($LEVEL as $value => $label) {
        // "all" нужно только для фильтра поиска, в форме use не нужно
        if ((string)$value === 'all') {
            continue;
        }

        $metaLevels[] = [
            'value' => (string)$value,
            'label' => (string)$label,
        ];
    }

    $metaTopics = [];
    foreach ($TOPICS as $value => $label) {
        // "43 => ყველა" нужно только для фильтра поиска, в форме use не нужно
        if ((string)$value === '43') {
            continue;
        }

        $metaTopics[] = [
            'value' => (string)$value,
            'label' => (string)$label,
        ];
    }

echo json_encode([
    'success' => true,
    'word' => [
        'id' => (int)$word['id'],
        'word' => (string)$word['word'],
        'word_view' => (string)$word['word_view'],
        'part_of_speech' => [
            'id' => (int)$posId,
            'ka' => $posKa,
            'en' => $posEn,
        ],
    ],
    'uses' => $uses,
    'meta' => [
        'levels' => $metaLevels,
        'topics' => $metaTopics,
    ],
    'grammar' => $grammar,
    'grammar_table' => $grammarTable,
], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if ($DEBUG) jerr('DB error: ' . $e->getMessage(), 500);
    jerr('DB error', 500);
}
