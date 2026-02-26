<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/config.php';

header('Content-Type: text/html; charset=utf-8');

$err = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $code = (string)($_POST['passcode'] ?? '');

    if ($code !== '' && defined('ADMIN_PASSWORD') && hash_equals(ADMIN_PASSWORD, $code)) {
        $_SESSION['admin_ok'] = 1;
        header('Location: index.php');
        exit;
    }

    $err = 'Неверный код';
}
?>
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Enter</title>
</head>
<body>
  <h3>Admin</h3>

  <?php if ($err): ?>
    <div style="color:red;"><?= htmlspecialchars($err, ENT_QUOTES, 'UTF-8') ?></div>
  <?php endif; ?>

  <form method="post" autocomplete="off">
    <input type="password" name="passcode" placeholder="Код доступа" autofocus>
    <button type="submit">Войти</button>
  </form>
</body>
</html>