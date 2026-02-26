<?php
declare(strict_types=1);

if (empty($_SESSION['admin_ok'])) {
  header('Location: enter.php');
  exit;
}