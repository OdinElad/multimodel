<?php
/**
 * MultiModel: station observations proxy.
 * Israel: Israel Meteorological Service (IMS Envista API, needs a token in config.php).
 * Everywhere else (and fallback): NOAA Aviation Weather Center METAR (public, no key).
 * Results are cached for 10 minutes so the source APIs get very few requests.
 *
 * Diagnostics: open api.php?diag=1 in the browser after uploading.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
// Allow the app (hosted on GitHub Pages) to call this endpoint.
$allowed = ['https://odinelad.github.io'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed, true)) { header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin'); }

$cfgFile = __DIR__ . '/config.php';
$cfg = is_file($cfgFile) ? (require $cfgFile) : [];
$IMS_TOKEN = is_array($cfg) ? trim((string)($cfg['ims_token'] ?? '')) : '';
// Cache lives outside the public web folder when possible, so it is never reachable from the internet.
$CACHE = dirname(__DIR__, 2) . '/multimodel-cache';
if (!is_dir($CACHE)) { @mkdir($CACHE, 0700, true); }
if (!is_dir($CACHE) || !is_writable($CACHE)) { $CACHE = __DIR__ . '/cache'; if (!is_dir($CACHE)) { @mkdir($CACHE, 0700, true); } }

function out(array $a, int $code = 200): void { http_response_code($code); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }

if (!function_exists('http_get')) {
  function http_get(string $url, array $headers = [], int $timeout = 8): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 5,
      CURLOPT_HTTPHEADER => $headers, CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4, CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_USERAGENT => 'MultiModel/1.0 (free personal weather app)',
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$code, $body === false ? '' : (string)$body, $err];
  }
}
function cache_get(string $key, int $ttl): ?array {
  $f = $GLOBALS['CACHE'] . '/' . sha1($key) . '.json';
  if (is_file($f) && time() - filemtime($f) < $ttl) { $d = json_decode((string)file_get_contents($f), true); return is_array($d) ? $d : null; }
  return null;
}
function cache_put(string $key, $data): void { @file_put_contents($GLOBALS['CACHE'] . '/' . sha1($key) . '.json', json_encode(['v' => $data], JSON_UNESCAPED_UNICODE), LOCK_EX); }
// Monitoring (IMS terms, section 10): every failed or stale fetch is logged with a timestamp,
// so interruptions in the data feed can be identified and reported. The log is capped at ~200 lines.
function log_issue(string $src, string $msg): void {
  $f = $GLOBALS['CACHE'] . '/monitor.log';
  $line = gmdate('Y-m-d H:i:s') . "Z [$src] $msg\n";
  $old = is_file($f) ? (array)@file($f) : [];
  $old = array_slice($old, -199);
  @file_put_contents($f, implode('', $old) . $line, LOCK_EX);
}
function recent_issues(int $n = 20): array {
  $f = $GLOBALS['CACHE'] . '/monitor.log';
  return is_file($f) ? array_map('trim', array_slice((array)@file($f), -$n)) : [];
}
function dist_km(float $a, float $b, float $c, float $d): float {
  $r = M_PI / 180; $h = sin(($c - $a) * $r / 2) ** 2 + cos($a * $r) * cos($c * $r) * sin(($d - $b) * $r / 2) ** 2;
  return 2 * 6371 * asin(min(1.0, sqrt($h)));
}

// ---------- IMS (Israel) ----------
function ims_stations(string $tok): array {
  $c = cache_get('ims_stations', 86400);
  if ($c !== null) return (array)$c['v'];
  [$code, $body, $err] = http_get('https://api.ims.gov.il/v1/envista/stations', ['Authorization: ApiToken ' . $tok], 20);
  if ($code !== 200) { log_issue('IMS', "stations list failed: HTTP $code $err"); return []; }
  $list = [];
  foreach ((array)json_decode($body, true) as $s) {
    if (!is_array($s) || (isset($s['active']) && !$s['active'])) continue;
    $la = $s['location']['latitude'] ?? null; $lo = $s['location']['longitude'] ?? null;
    if (!is_numeric($la) || !is_numeric($lo)) continue;
    $hasTD = false;
    foreach ((array)($s['monitors'] ?? []) as $m) {
      if (($m['name'] ?? '') === 'TD' && (!isset($m['active']) || $m['active'])) { $hasTD = true; break; }
    }
    if ($hasTD) $list[] = ['id' => (int)$s['stationId'], 'name' => (string)$s['name'], 'lat' => (float)$la, 'lon' => (float)$lo];
  }
  if ($list) cache_put('ims_stations', $list);
  return $list;
}
function ims_nearest(float $lat, float $lon, string $tok): ?array {
  $st = ims_stations($tok);
  foreach ($st as &$s) { $s['d'] = dist_km($lat, $lon, $s['lat'], $s['lon']); } unset($s);
  usort($st, fn($a, $b) => $a['d'] <=> $b['d']);
  foreach (array_slice($st, 0, 3) as $s) {
    if ($s['d'] > 30) break;
    $ck = 'ims_' . $s['id'];
    $c = cache_get($ck, 600);
    if ($c === null) {
      [$code, $body, $err] = http_get("https://api.ims.gov.il/v1/envista/stations/{$s['id']}/data/latest", ['Authorization: ApiToken ' . $tok]);
      $d = $code === 200 ? json_decode($body, true) : null;
      if ($code !== 200) log_issue('IMS', "station {$s['id']} latest failed: HTTP $code $err");
      cache_put($ck, $d);
    } else { $d = $c['v']; }
    $row = $d['data'][0] ?? null;
    if (!is_array($row)) continue;
    $td = null;
    foreach ((array)($row['channels'] ?? []) as $ch) {
      if (($ch['name'] ?? '') === 'TD' && (!isset($ch['valid']) || $ch['valid']) && is_numeric($ch['value'] ?? null)) { $td = (float)$ch['value']; break; }
    }
    $ts = strtotime((string)($row['datetime'] ?? ''));
    if ($td === null || !$ts || time() - $ts > 7200) { log_issue('IMS', "station {$s['id']} has no valid recent TD reading"); continue; }
    $name = ucwords(strtolower($s['name']));
    return ['source' => 'IMS', 'name' => $name, 'lat' => $s['lat'], 'lon' => $s['lon'], 'dist_km' => round($s['d'], 1), 'temp_c' => $td, 'time' => $ts];
  }
  return null;
}

// ---------- METAR (worldwide) ----------
function metar_nearest(float $lat, float $lon): ?array {
  $b = 0.7;
  $bbox = sprintf('%.2f,%.2f,%.2f,%.2f', $lat - $b, $lon - $b, $lat + $b, $lon + $b);
  [$code, $body, $err] = http_get('https://aviationweather.gov/api/data/metar?format=json&bbox=' . $bbox);
  if ($code !== 200 && $code !== 204) { log_issue('METAR', "bbox $bbox failed: HTTP $code $err"); return null; }
  $j = json_decode($body, true);
  if (!is_array($j)) return null;
  $best = null;
  foreach ($j as $m) {
    if (!is_array($m)) continue;
    $la = $m['lat'] ?? null; $lo = $m['lon'] ?? null; $t = $m['temp'] ?? null; $ts = $m['obsTime'] ?? null;
    if (!is_numeric($la) || !is_numeric($lo) || !is_numeric($t) || !is_numeric($ts)) continue;
    if (time() - (int)$ts > 3 * 3600) continue;
    $d = dist_km($lat, $lon, (float)$la, (float)$lo);
    if ($best === null || $d < $best['dist_km']) {
      $nm = trim(explode(',', (string)($m['name'] ?? ''))[0]);
      $best = ['source' => 'METAR', 'name' => $nm !== '' ? $nm : (string)($m['icaoId'] ?? ''), 'icao' => (string)($m['icaoId'] ?? ''),
               'lat' => (float)$la, 'lon' => (float)$lo, 'dist_km' => round($d, 1), 'temp_c' => (float)$t, 'time' => (int)$ts];
    }
  }
  return ($best !== null && $best['dist_km'] <= 50) ? $best : null;
}

// ---------- diagnostics ----------
if (isset($_GET['diag'])) {
  $r = ['php' => PHP_VERSION, 'curl' => function_exists('curl_init'), 'cache_writable' => is_writable($CACHE), 'ims_token_set' => $IMS_TOKEN !== ''];
  if ($r['curl']) {
    [$c, , $e] = http_get('https://aviationweather.gov/api/data/metar?ids=LLBG&format=json');
    $r['aviationweather_http'] = $c; if ($e) $r['aviationweather_error'] = $e;
    $r['metar_test_tel_aviv'] = metar_nearest(32.08, 34.78);
    if ($IMS_TOKEN !== '') {
      [$c2, , $e2] = http_get('https://api.ims.gov.il/v1/envista/stations/178/data/latest', ['Authorization: ApiToken ' . $IMS_TOKEN]);
      $r['ims_http'] = $c2; if ($e2) $r['ims_error'] = $e2;
      $r['ims_test_pardes_hanna'] = ims_nearest(32.47, 34.97, $IMS_TOKEN);
    }
  }
  $r['recent_issues'] = recent_issues();
  out($r);
}

// ---------- main ----------
$lat = filter_var($_GET['lat'] ?? null, FILTER_VALIDATE_FLOAT);
$lon = filter_var($_GET['lon'] ?? null, FILTER_VALIDATE_FLOAT);
if (!is_float($lat) || !is_float($lon) || abs($lat) > 90 || abs($lon) > 180) out(['ok' => false, 'error' => 'bad_coords'], 400);
$lat = round($lat, 2); $lon = round($lon, 2);
$key = 'obs_' . str_replace(['.', '-'], ['p', 'm'], $lat . '_' . $lon);
$hit = cache_get($key, 600);
if ($hit !== null) out((array)$hit['v']);

$res = null;
$inIsrael = $lat >= 29.4 && $lat <= 33.4 && $lon >= 34.2 && $lon <= 35.95;
if ($inIsrael && $IMS_TOKEN !== '') $res = ims_nearest($lat, $lon, $IMS_TOKEN);
if ($res === null) $res = metar_nearest($lat, $lon);
$v = $res ? ['ok' => true] + $res : ['ok' => false, 'error' => 'no_station'];
cache_put($key, $v);
out($v);
