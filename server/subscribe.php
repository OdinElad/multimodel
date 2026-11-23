<?php
/**
 * MultiModel: alert subscriptions.
 * POST   {action:"subscribe", subscription:{endpoint,keys:{p256dh,auth}}, lat, lon, name, lang, imperial, tz}
 * POST   {action:"unsubscribe", endpoint}
 * POST   {action:"test", endpoint}            sends a test notification to that same subscription (max once a minute)
 * GET    ?key=1                                returns the public VAPID key
 * Privacy: only the push address, a rounded location (~1 km), language, units and time zone are stored.
 */
declare(strict_types=1);
require_once __DIR__ . '/alerts_lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === 'https://odinelad.github.io') { header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin'); }
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  header('Access-Control-Allow-Methods: POST, GET'); header('Access-Control-Allow-Headers: Content-Type'); header('Access-Control-Max-Age: 86400'); exit;
}
function reply(array $a, int $c = 200): void { http_response_code($c); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
  if (isset($_GET['key'])) reply(['ok' => true, 'key' => mm_vapid()['public_b64u']]);
  reply(['ok' => false], 400);
}
$raw = file_get_contents('php://input', false, null, 0, 8192);
$in = json_decode((string)$raw, true);
if (!is_array($in)) reply(['ok' => false, 'error' => 'bad_json'], 400);
$db = mm_db();
$action = (string)($in['action'] ?? '');

if ($action === 'subscribe') {
  $s = $in['subscription'] ?? [];
  $ep = (string)($s['endpoint'] ?? ''); $p = (string)($s['keys']['p256dh'] ?? ''); $a = (string)($s['keys']['auth'] ?? '');
  if (!push_endpoint_allowed($ep) || strlen($ep) > 1000 || strlen(b64u_dec($p)) !== 65 || strlen(b64u_dec($a)) < 16) reply(['ok' => false, 'error' => 'bad_subscription'], 400);
  $lat = filter_var($in['lat'] ?? null, FILTER_VALIDATE_FLOAT); $lon = filter_var($in['lon'] ?? null, FILTER_VALIDATE_FLOAT);
  if (!is_float($lat) || !is_float($lon) || abs($lat) > 90 || abs($lon) > 180) reply(['ok' => false, 'error' => 'bad_coords'], 400);
  $lang = in_array($in['lang'] ?? '', MM_LANGS, true) ? $in['lang'] : 'en';
  $tz = (string)($in['tz'] ?? 'UTC'); try { new DateTimeZone($tz); } catch (Throwable $e) { $tz = 'UTC'; }
  $name = mb_substr(trim(strip_tags((string)($in['name'] ?? ''))), 0, 60);
  $count = (int)$db->query('SELECT COUNT(*) FROM subs')->fetchColumn();
  $exists = $db->prepare('SELECT 1 FROM subs WHERE endpoint=?'); $exists->execute([$ep]);
  if (!$exists->fetchColumn() && $count >= 50000) reply(['ok' => false, 'error' => 'full'], 503);
  $now = time();
  $db->prepare('INSERT INTO subs (endpoint,p256dh,auth,lat,lon,name,lang,imperial,tz,created,updated,fails) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, lat=excluded.lat, lon=excluded.lon, name=excluded.name,
    lang=excluded.lang, imperial=excluded.imperial, tz=excluded.tz, updated=excluded.updated, fails=0')
    ->execute([$ep, $p, $a, round($lat, 2), round($lon, 2), $name, $lang, empty($in['imperial']) ? 0 : 1, $tz, $now, $now]);
  reply(['ok' => true]);
}
if ($action === 'unsubscribe') {
  $db->prepare('DELETE FROM subs WHERE endpoint=?')->execute([(string)($in['endpoint'] ?? '')]);
  reply(['ok' => true]);
}
if ($action === 'test') {
  $st = $db->prepare('SELECT * FROM subs WHERE endpoint=?'); $st->execute([(string)($in['endpoint'] ?? '')]);
  $s = $st->fetch(PDO::FETCH_ASSOC);
  if (!$s) reply(['ok' => false, 'error' => 'not_found'], 404);
  if (time() - (int)$s['last_test'] < 60) reply(['ok' => false, 'error' => 'too_soon'], 429);
  $db->prepare('UPDATE subs SET last_test=? WHERE endpoint=?')->execute([time(), $s['endpoint']]);
  $place = $s['name'] ?: '';
  $code = mm_push($s, mm_t('testTitle', $s['lang'], []), mm_t('testBody', $s['lang'], ['p' => $place]), 'mm-test');
  reply(['ok' => $code >= 200 && $code < 300, 'status' => $code]);
}
reply(['ok' => false, 'error' => 'bad_action'], 400);
