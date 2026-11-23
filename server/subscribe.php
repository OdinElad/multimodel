<?php
/**
 * MultiModel: alert subscriptions.
 * POST   {action:"subscribe", subscription:{endpoint,keys:{p256dh,auth}}, lat, lon, name, lang, imperial, tz}
 * POST   {action:"unsubscribe", endpoint}
 * POST   {action:"test", endpoint}            sends a test notification to that same subscription (max once a minute)
 * Limits: POST only (405 otherwise), body up to 8 KB (413), 20 POST requests per client address per hour (429),
 *         300 new subscribers per day overall (503 full). The client address is stored only as a keyed hash for up to two hours.
 * GET    ?key=1                                returns the public VAPID key
 * Privacy: only the push address, a rounded location (~1 km), language, units and time zone are stored.
 */
declare(strict_types=1);
ini_set('display_errors', '0'); // never print PHP errors into the JSON answer
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

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
  if (isset($_GET['key'])) reply(['ok' => true, 'key' => mm_vapid()['public_b64u']]);
  reply(['ok' => false], 400);
}
if ($method !== 'POST') { header('Allow: GET, POST, OPTIONS'); reply(['ok' => false, 'error' => 'method'], 405); }
try { $db = mm_db(); } catch (Throwable $e) { reply(['ok' => false, 'error' => 'storage'], 503); } // reason is already in error_log
// Rate limit: at most 20 POST requests per client address per hour (counted before anything else is done).
$win = intdiv(time(), 3600);
$db->prepare('DELETE FROM rl WHERE win < ?')->execute([$win - 1]);
$rk = mm_client_key();
$db->prepare('INSERT INTO rl (k, win, n) VALUES (?, ?, 1) ON CONFLICT(k, win) DO UPDATE SET n = n + 1')->execute([$rk, $win]);
$q = $db->prepare('SELECT n FROM rl WHERE k=? AND win=?'); $q->execute([$rk, $win]);
if ((int)$q->fetchColumn() > 20) { header('Retry-After: 3600'); reply(['ok' => false, 'error' => 'rate_limited'], 429); }
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) reply(['ok' => false, 'error' => 'too_large'], 413);
$raw = (string)file_get_contents('php://input', false, null, 0, 8193);
if (strlen($raw) > 8192) reply(['ok' => false, 'error' => 'too_large'], 413);
$in = json_decode($raw, true);
if (!is_array($in)) reply(['ok' => false, 'error' => 'bad_json'], 400);
$action = $in['action'] ?? '';
if (!is_string($action)) reply(['ok' => false, 'error' => 'bad_action'], 400);
// Endpoint of unsubscribe/test must be a plain string (anything else is rejected before it reaches the database).
$epIn = $in['endpoint'] ?? '';
if (!is_string($epIn) || strlen($epIn) > 1000) reply(['ok' => false, 'error' => 'bad_endpoint'], 400);

if ($action === 'subscribe') {
  // B1: strict validation. Expected types only; anything else is a 400 (never a PHP warning or error).
  $s = $in['subscription'] ?? null;
  if (!is_array($s) || !is_string($s['endpoint'] ?? null) || !is_array($s['keys'] ?? null)
      || !is_string($s['keys']['p256dh'] ?? null) || !is_string($s['keys']['auth'] ?? null)) reply(['ok' => false, 'error' => 'bad_subscription'], 400);
  $ep = $s['endpoint']; $p = $s['keys']['p256dh']; $a = $s['keys']['auth'];
  $b64u = fn(string $x): bool => preg_match('/^[A-Za-z0-9_-]+$/', $x) === 1; // base64url only (no padding, no + or /)
  if (!push_endpoint_allowed($ep) || strlen($ep) > 1000 || !$b64u($p) || !$b64u($a)) reply(['ok' => false, 'error' => 'bad_subscription'], 400);
  $pRaw = b64u_dec($p); $aRaw = b64u_dec($a);
  if (strlen($pRaw) !== 65 || $pRaw[0] !== "\x04" || strlen($aRaw) !== 16) reply(['ok' => false, 'error' => 'bad_subscription'], 400);
  $lat = $in['lat'] ?? null; $lon = $in['lon'] ?? null;
  if (!(is_int($lat) || is_float($lat)) || !(is_int($lon) || is_float($lon)) || !is_finite((float)$lat) || !is_finite((float)$lon)
      || abs($lat) > 90 || abs($lon) > 180) reply(['ok' => false, 'error' => 'bad_coords'], 400);
  $lat = (float)$lat; $lon = (float)$lon;
  foreach (['lang', 'tz', 'name'] as $f) if (isset($in[$f]) && !is_string($in[$f])) reply(['ok' => false, 'error' => 'bad_' . $f], 400);
  if (isset($in['imperial']) && !is_bool($in['imperial']) && $in['imperial'] !== 0 && $in['imperial'] !== 1) reply(['ok' => false, 'error' => 'bad_imperial'], 400);
  $lang = in_array($in['lang'] ?? '', MM_LANGS, true) ? $in['lang'] : 'en';
  $tz = (string)($in['tz'] ?? 'UTC'); try { new DateTimeZone($tz); } catch (Throwable $e) { $tz = 'UTC'; }
  $name = mb_substr(trim(strip_tags((string)($in['name'] ?? ''))), 0, 60);
  $count = (int)$db->query('SELECT COUNT(*) FROM subs')->fetchColumn();
  $exists = $db->prepare('SELECT 1 FROM subs WHERE endpoint=?'); $exists->execute([$ep]);
  if (!$exists->fetchColumn()) {
    $new24 = $db->prepare('SELECT COUNT(*) FROM subs WHERE created >= ?'); $new24->execute([time() - 86400]);
    if ($count >= 50000 || (int)$new24->fetchColumn() >= 300) reply(['ok' => false, 'error' => 'full'], 503); // global caps: 300 new per day
  }
  $now = time();
  $db->prepare('INSERT INTO subs (endpoint,p256dh,auth,lat,lon,name,lang,imperial,tz,created,updated,fails) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, lat=excluded.lat, lon=excluded.lon, name=excluded.name,
    lang=excluded.lang, imperial=excluded.imperial, tz=excluded.tz, updated=excluded.updated, fails=0')
    ->execute([$ep, $p, $a, round($lat, 2), round($lon, 2), $name, $lang, empty($in['imperial']) ? 0 : 1, $tz, $now, $now]);
  reply(['ok' => true]);
}
if ($action === 'unsubscribe') {
  $db->prepare('DELETE FROM subs WHERE endpoint=?')->execute([$epIn]);
  reply(['ok' => true]);
}
if ($action === 'test') {
  $st = $db->prepare('SELECT * FROM subs WHERE endpoint=?'); $st->execute([$epIn]);
  $s = $st->fetch(PDO::FETCH_ASSOC);
  if (!$s) reply(['ok' => false, 'error' => 'not_found'], 404);
  // B2: atomic claim of the one-per-minute slot (two parallel requests cannot both pass)
  $now = time();
  $claim = $db->prepare('UPDATE subs SET last_test=? WHERE endpoint=? AND last_test<?'); $claim->execute([$now, $s['endpoint'], $now - 60]);
  if ($claim->rowCount() !== 1) reply(['ok' => false, 'error' => 'too_soon'], 429);
  $place = $s['name'] ?: '';
  $code = mm_push($s, mm_t('testTitle', $s['lang'], []), mm_t('testBody', $s['lang'], ['p' => $place]), 'mm-test');
  reply(['ok' => $code >= 200 && $code < 300, 'status' => $code]);
}
reply(['ok' => false, 'error' => 'bad_action'], 400);
