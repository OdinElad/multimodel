<?php
/**
 * MultiModel: station observations proxy.
 * Israel: Israel Meteorological Service (IMS Envista API, needs a token in config.php).
 * Everywhere else (and fallback): NOAA Aviation Weather Center METAR (public, no key).
 * Results are cached for 10 minutes so the source APIs get very few requests.
 *
 * Diagnostics: run `php api.php diag` on the server (command line only; over HTTP ?diag returns 404).
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
// Cache lives outside the public web folder, so it is never reachable from the internet. No fallback inside public_html.
$CACHE = dirname(__DIR__, 2) . '/multimodel-cache';
if (!is_dir($CACHE)) { @mkdir($CACHE, 0700, true); }
$CACHE_OK = is_dir($CACHE) && is_writable($CACHE);
if (!$CACHE_OK) { error_log('multimodel: private cache folder missing or not writable: ' . $CACHE); }

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

// ---------- representativeness helpers ----------
// A station only stands for the user's place if it is in a similar setting. Distance alone is not enough:
// a coastal station 6 km away can be 4 degrees warmer at night than a town 9 km inland.
// So every candidate carries its elevation and (in Israel) its distance from the Mediterranean coast,
// and the app picks a station only if both are close to the user's own values.
const IL_COAST = [ // Israel's Mediterranean coastline, north to south (lat, lon), accurate to about 1 km
  [33.093,35.105],[33.005,35.088],[32.920,35.068],[32.865,35.040],[32.820,35.000],[32.828,34.957],
  [32.760,34.950],[32.690,34.930],[32.610,34.915],[32.500,34.890],[32.470,34.877],[32.410,34.866],
  [32.330,34.845],[32.250,34.825],[32.170,34.800],[32.080,34.765],[32.050,34.750],[32.020,34.740],
  [31.930,34.690],[31.800,34.630],[31.670,34.550],[31.610,34.510],[31.520,34.430],[31.320,34.220]];
function coast_km(float $lat, float $lon): ?float {
  if ($lat < 31.2 || $lat > 33.4 || $lon > 35.95) return null; // only meaningful for the Mediterranean side of Israel
  $kx = 111.32 * cos($lat * M_PI / 180); $ky = 110.57; $best = INF;
  for ($i = 0; $i < count(IL_COAST) - 1; $i++) {
    [$a1, $o1] = IL_COAST[$i]; [$a2, $o2] = IL_COAST[$i + 1];
    $ax = ($o1 - $lon) * $kx; $ay = ($a1 - $lat) * $ky; $bx = ($o2 - $lon) * $kx; $by = ($a2 - $lat) * $ky;
    $dx = $bx - $ax; $dy = $by - $ay; $l2 = $dx * $dx + $dy * $dy;
    $t = $l2 > 0 ? max(0.0, min(1.0, -($ax * $dx + $ay * $dy) / $l2)) : 0.0;
    $best = min($best, hypot($ax + $t * $dx, $ay + $t * $dy));
  }
  return round($best, 1);
}
// Elevation of station points (never the user's position) from the Open-Meteo elevation API (90 m DEM), up to 100 per request.
function station_elevations(array $pts): array {
  $out = [];
  foreach (array_chunk($pts, 100, true) as $chunk) {
    $la = implode(',', array_map(fn($p) => sprintf('%.4f', $p[0]), $chunk));
    $lo = implode(',', array_map(fn($p) => sprintf('%.4f', $p[1]), $chunk));
    [$code, $body] = http_get("https://api.open-meteo.com/v1/elevation?latitude=$la&longitude=$lo", [], 15);
    $e = $code === 200 ? (json_decode($body, true)['elevation'] ?? null) : null;
    if (!is_array($e)) { log_issue('ELEV', "elevation lookup failed: HTTP $code"); continue; }
    $keys = array_keys($chunk);
    foreach ($keys as $i => $k) if (isset($e[$i]) && is_numeric($e[$i])) $out[$k] = (float)$e[$i];
  }
  return $out;
}

// ---------- IMS (Israel) ----------
function ims_stations(string $tok): array {
  $c = cache_get('ims_stations_v2', 86400);
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
    if ($hasTD) $list[] = ['id' => (int)$s['stationId'], 'name' => (string)$s['name'], 'lat' => (float)$la, 'lon' => (float)$lo,
                           'coast_km' => coast_km((float)$la, (float)$lo), 'elev' => null];
  }
  $el = station_elevations(array_map(fn($s) => [$s['lat'], $s['lon']], $list));
  foreach ($list as $i => &$s) { if (isset($el[$i])) $s['elev'] = round($el[$i]); } unset($s);
  // Without elevations the list is cached for 1 hour only, so a temporary failure is retried soon.
  if ($list) cache_put('ims_stations_v2', $list);
  if ($list && count($el) < count($list)) @touch($GLOBALS['CACHE'] . '/' . sha1('ims_stations_v2') . '.json', time() - 86400 + 3600);
  return $list;
}
function ims_candidates(float $lat, float $lon, string $tok): array {
  $st = ims_stations($tok);
  foreach ($st as &$s) { $s['d'] = dist_km($lat, $lon, $s['lat'], $s['lon']); } unset($s);
  usort($st, fn($a, $b) => $a['d'] <=> $b['d']);
  $out = [];
  foreach (array_slice($st, 0, 6) as $s) {
    if ($s['d'] > 25) break;
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
    $out[] = ['source' => 'IMS', 'name' => ucwords(strtolower($s['name'])), 'lat' => $s['lat'], 'lon' => $s['lon'],
              'dist_km' => round($s['d'], 1), 'elev' => $s['elev'], 'coast_km' => $s['coast_km'], 'temp_c' => $td, 'time' => $ts];
  }
  return $out;
}

// ---------- METAR (worldwide) ----------
function metar_candidates(float $lat, float $lon): array {
  // The query area is snapped to a 0.5 degree grid, so NOAA gets an area and never the user's own (rounded) position.
  // Half-width 1.25 degrees keeps every station within the 50 km limit inside the box (up to about 63 degrees latitude).
  $g = 0.5; $b = 1.25; $cLat = round($lat / $g) * $g; $cLon = round($lon / $g) * $g;
  $bbox = sprintf('%.2f,%.2f,%.2f,%.2f', $cLat - $b, $cLon - $b, $cLat + $b, $cLon + $b);
  [$code, $body, $err] = http_get('https://aviationweather.gov/api/data/metar?format=json&bbox=' . $bbox);
  if ($code !== 200 && $code !== 204) { log_issue('METAR', "bbox $bbox failed: HTTP $code $err"); return []; }
  $j = json_decode($body, true);
  if (!is_array($j)) return [];
  $out = [];
  foreach ($j as $m) {
    if (!is_array($m)) continue;
    $la = $m['lat'] ?? null; $lo = $m['lon'] ?? null; $t = $m['temp'] ?? null; $ts = $m['obsTime'] ?? null;
    if (!is_numeric($la) || !is_numeric($lo) || !is_numeric($t) || !is_numeric($ts)) continue;
    if (time() - (int)$ts > 3 * 3600) continue;
    $d = dist_km($lat, $lon, (float)$la, (float)$lo);
    if ($d > 25) continue;
    $nm = trim(explode(',', (string)($m['name'] ?? ''))[0]);
    $out[] = ['source' => 'METAR', 'name' => $nm !== '' ? $nm : (string)($m['icaoId'] ?? ''), 'icao' => (string)($m['icaoId'] ?? ''),
              'lat' => (float)$la, 'lon' => (float)$lo, 'dist_km' => round($d, 1), 'elev' => is_numeric($m['elev'] ?? null) ? round((float)$m['elev']) : null,
              'coast_km' => coast_km((float)$la, (float)$lo), 'temp_c' => (float)$t, 'time' => (int)$ts];
  }
  usort($out, fn($a, $b) => $a['dist_km'] <=> $b['dist_km']);
  return array_slice($out, 0, 4);
}

// ---------- diagnostics (command line only) ----------
// Run on the server:  php api.php diag     Over HTTP the diagnostics do not exist (404).
if (PHP_SAPI !== 'cli' && isset($_GET['diag'])) out(['ok' => false, 'error' => 'not_found'], 404);
if (PHP_SAPI === 'cli' && ($argv[1] ?? '') === 'diag') {
  $r = ['php' => PHP_VERSION, 'curl' => function_exists('curl_init'), 'cache_writable' => $CACHE_OK, 'ims_token_set' => $IMS_TOKEN !== ''];
  if ($r['curl']) {
    [$c, , $e] = http_get('https://aviationweather.gov/api/data/metar?ids=LLBG&format=json');
    $r['aviationweather_http'] = $c; if ($e) $r['aviationweather_error'] = $e;
    $r['metar_test_tel_aviv'] = metar_candidates(32.08, 34.78);
    if ($IMS_TOKEN !== '') {
      [$c2, , $e2] = http_get('https://api.ims.gov.il/v1/envista/stations/178/data/latest', ['Authorization: ApiToken ' . $IMS_TOKEN]);
      $r['ims_http'] = $c2; if ($e2) $r['ims_error'] = $e2;
      $r['ims_test_pardes_hanna'] = ims_candidates(32.47, 34.97, $IMS_TOKEN);
      $r['user_coast_km_pardes_hanna'] = coast_km(32.47, 34.97);
    }
  }
  $r['recent_issues'] = recent_issues();
  out($r);
}

// ---------- main ----------
// Without the private cache the 10 minute cache (which protects the IMS and NOAA rate limits) cannot work: refuse.
if (!$CACHE_OK) out(['ok' => false, 'error' => 'storage'], 503);
$lat = filter_var($_GET['lat'] ?? null, FILTER_VALIDATE_FLOAT);
$lon = filter_var($_GET['lon'] ?? null, FILTER_VALIDATE_FLOAT);
if (!is_float($lat) || !is_float($lon) || abs($lat) > 90 || abs($lon) > 180) out(['ok' => false, 'error' => 'bad_coords'], 400);
$lat = round($lat, 2); $lon = round($lon, 2);
$key = 'obs2_' . str_replace(['.', '-'], ['p', 'm'], $lat . '_' . $lon);
$hit = cache_get($key, 600);
if ($hit !== null) out((array)$hit['v']);

$cands = [];
$inIsrael = $lat >= 29.4 && $lat <= 33.4 && $lon >= 34.2 && $lon <= 35.95;
if ($inIsrael && $IMS_TOKEN !== '') $cands = ims_candidates($lat, $lon, $IMS_TOKEN);
if (!$cands) $cands = metar_candidates($lat, $lon);
// The app chooses among the candidates (it knows the elevation of the user's place from the forecast).
// The nearest candidate is also returned at the top level for older app versions.
$v = $cands ? ['ok' => true] + $cands[0] + ['user_coast_km' => coast_km($lat, $lon), 'cands' => $cands] : ['ok' => false, 'error' => 'no_station'];
cache_put($key, $v);
out($v);
