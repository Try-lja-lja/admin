<?php
// /admin/index.php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php'; // <- включает session + guard

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/connect.php';
?>
<!doctype html>
<html lang="ka">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Admn — Dictionary Admin</title>
  <link rel="stylesheet" href="resource/css/admn.css">
</head>
<body>

<header class="topbar">
  <div class="topbar-inner">
    <div class="title">Admin — ლექსიკონი (აღმართი)</div>

    <form id="searchForm" class="search-form" autocomplete="off" onsubmit="return false;">
      <input id="form_Search" name="word" type="search" placeholder="სიტყვა" />

      <select id="form_level" name="level">
        <option value="" selected hidden>დონეები</option>
        <?php foreach ($LEVEL as $id => $label): ?>
          <option value="<?= $id ?>"><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></option>
        <?php endforeach; ?>
      </select>

      <select id="form_part_of_speech" name="part_of_speech">
        <option value="" selected hidden>მეტყველების ნაწილები</option>
        <?php foreach ($PARTS_OF_SPEECH as $id => $label): ?>
          <option value="<?= $id ?>"><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></option>
        <?php endforeach; ?>
      </select>

      <select id="form_tema" name="tema">
        <option value="" selected hidden>თემატური ჯგუფები</option>
        <?php foreach ($TOPICS as $id => $label): ?>
          <option value="<?= $id ?>"><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></option>
        <?php endforeach; ?>
      </select>
    </form>
  </div>
</header>

<main class="layout">
  <section class="left">
    <div id="results" class="results"></div>
  </section>

  <aside class="right" id="details-panel">
    <div class="center-message">აირჩიე სიტყვა მარცხნიდან</div>
  </aside>
</main>

<script src="resource/js/admn.js" type="module"></script>
</body>
</html>