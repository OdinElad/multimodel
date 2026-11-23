<?php
/**
 * MultiModel: runs every 30 minutes from cron. For every subscriber whose location is now between 20:00 and 20:59
 * local time and who was not checked today, checks tomorrow for unusual cold/heat and sends a notification if needed.
 * CLI only. Options: --dry (evaluate and log, send nothing), --force (ignore the 20:00 window, for testing).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/alerts_lib.php';
$dry = in_array('--dry', $argv, true); $force = in_array('--force', $argv, true);
$db = mm_db();
$subs = $db->query('SELECT * FROM subs')->fetchAll(PDO::FETCH_ASSOC);
$groups = []; $due = 0;
foreach ($subs as $s) {
  try { $now = new DateTime('now', new DateTimeZone($s['tz'] ?: 'UTC')); } catch (Throwable $e) { $now = new DateTime('now', new DateTimeZone('UTC')); }
  $today = $now->format('Y-m-d');
  if (!$force && ((int)$now->format('G') !== 20 || $s['last_checked'] === $today)) continue;
  $due++;
  $groups[sprintf('%.1f,%.1f', $s['lat'], $s['lon'])][] = $s + ['_today' => $today];
}
$sent = 0; $checked = 0;
foreach ($groups as $key => $list) {
  $s0 = $list[0];
  $fc = mm_tomorrow((float)$s0['lat'], (float)$s0['lon']);
  $res = null;
  if ($fc) {
    $cl = mm_climate((float)$s0['lat'], (float)$s0['lon'], $fc['date']);
    if ($cl) $res = mm_evaluate($fc, $cl);
    mm_log(sprintf('check %s %s: min %s max %s | clim min_p02 %.1f max_p98 %.1f -> %s', $key, $fc['date'],
      json_encode($fc['mins']), json_encode($fc['maxs']), $cl['min_p02'] ?? NAN, $cl['max_p98'] ?? NAN, $res ? $res['type'] : 'normal'));
  }
  foreach ($list as $s) {
    $checked++;
    if (!$dry) $db->prepare('UPDATE subs SET last_checked=? WHERE endpoint=?')->execute([$s['_today'], $s['endpoint']]);
    if (!$res || $dry) continue;
    $imp = (bool)$s['imperial']; $place = $s['name'] ?: '';
    $title = mm_t($res['type'] . 'Title', $s['lang'], ['p' => $place]);
    $body = mm_t($res['type'] . 'Body', $s['lang'], ['t' => mm_fmt_temp($res['value'], $imp), 'n' => mm_fmt_temp($res['normal'], $imp), 'k' => $res['k'], 'm' => $res['n']]);
    $code = mm_push($s, $title, $body, 'mm-' . $res['type'] . '-' . $fc['date']);
    if ($code >= 200 && $code < 300) { $sent++; $db->prepare('UPDATE subs SET last_sent=? WHERE endpoint=?')->execute([$fc['date'], $s['endpoint']]); }
  }
}
$msg = sprintf('run: %d subscribers, %d due, %d checked, %d sent%s', count($subs), $due, $checked, $sent, $dry ? ' (dry)' : '');
mm_log($msg); echo $msg, "\n";
