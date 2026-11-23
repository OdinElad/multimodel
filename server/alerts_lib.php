<?php
/**
 * MultiModel: unusual-weather alerts.
 * Compares tomorrow's multi-model forecast with the local climate for the same time of year
 * (2010-2024, +-7 days around the date) and flags unusual cold or heat.
 */
declare(strict_types=1);
require_once __DIR__ . '/push_lib.php';

const MM_MODELS = 'ecmwf_ifs025,gfs_seamless,icon_seamless,ukmo_seamless,meteofrance_seamless';
const MM_LANGS = ['he','en','ar','ru','zh','ja','fr','de','es','it','pt','nl','pl','uk'];

function mm_cfg(): array {
  static $c = null;
  if ($c === null) { $f = __DIR__ . '/config.php'; $c = is_file($f) ? (array)(require $f) : []; }
  return $c;
}
/** Numeric limit from config.php, or the default. */
function mm_limit(string $k, int $def): int { $v = mm_cfg()[$k] ?? null; return is_int($v) && $v > 0 ? $v : $def; }
/** Private data folder, outside the public web root. No fallback inside public_html: if it is not usable, fail closed. */
function mm_data_dir(): string {
  static $d = null;
  if ($d !== null) return $d;
  $p = dirname(__DIR__, 2) . '/multimodel-data';
  if (!is_dir($p)) @mkdir($p, 0700, true);
  if (!is_dir($p) || !is_writable($p)) {
    error_log('multimodel: private data folder missing or not writable: ' . $p);
    throw new RuntimeException('storage');
  }
  return $d = $p;
}
function mm_db(): PDO {
  static $db = null;
  if ($db) return $db;
  $db = new PDO('sqlite:' . mm_data_dir() . '/subscriptions.sqlite');
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->exec('CREATE TABLE IF NOT EXISTS subs (
    endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    lat REAL NOT NULL, lon REAL NOT NULL, name TEXT, lang TEXT, imperial INTEGER DEFAULT 0, tz TEXT,
    created INTEGER, updated INTEGER, last_checked TEXT, last_sent TEXT, last_test INTEGER DEFAULT 0, fails INTEGER DEFAULT 0)');
  // Rate limiting for subscribe.php: one row per (keyed hash of the client address, hour). Rows are deleted after two hours.
  $db->exec('CREATE TABLE IF NOT EXISTS rl (k TEXT, win INTEGER, n INTEGER, PRIMARY KEY (k, win))');
  return $db;
}
/** Secret for hashing client addresses. Created once, kept in the private data folder (never in the repo). */
function mm_rl_secret(): string {
  $f = mm_data_dir() . '/rl_secret';
  $s = is_file($f) ? trim((string)@file_get_contents($f)) : '';
  if (strlen($s) >= 32) return $s;
  $s = bin2hex(random_bytes(32));
  $h = @fopen($f, 'x'); // exclusive create: if another request won the race, use its value
  if ($h) { fwrite($h, $s); fclose($h); @chmod($f, 0600); return $s; }
  $other = trim((string)@file_get_contents($f));
  return strlen($other) >= 32 ? $other : $s;
}
/** Keyed hash of the client address (IPv6 reduced to its /64). The raw address is never stored. */
function mm_client_key(): string {
  $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
  $bin = @inet_pton($ip);
  if ($bin !== false && strlen($bin) === 16) $bin = substr($bin, 0, 8);
  return hash_hmac('sha256', $bin !== false ? bin2hex($bin) : 'unknown', mm_rl_secret());
}

function mm_http_json(string $url, int $timeout = 20): ?array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 6,
    CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4, CURLOPT_USERAGENT => 'MultiModel/1.0 (free personal weather app)']);
  $b = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($code !== 200 || !is_string($b)) { mm_log("HTTP $code $url"); return null; }
  $j = json_decode($b, true);
  return is_array($j) ? $j : null;
}
function mm_log(string $msg): void {
  try { $f = mm_data_dir() . '/alerts.log'; } catch (Throwable $e) { return; }
  $old = is_file($f) ? array_slice((array)@file($f), -499) : [];
  @file_put_contents($f, implode('', $old) . gmdate('Y-m-d H:i:s') . "Z $msg\n", LOCK_EX);
}
function mm_percentile(array $v, float $p): float {
  sort($v); $n = count($v); if (!$n) return NAN;
  $i = ($n - 1) * $p; $lo = (int)floor($i); $hi = (int)ceil($i);
  return $v[$lo] + ($v[$hi] - $v[$lo]) * ($i - $lo);
}
function mm_median(array $v): float { return mm_percentile($v, 0.5); }

/** Climate for a place around a date: samples of daily min/max, 2010-2024 (ERA5), +-7 days. Cached ~1 week per 0.25 degree cell.
 *  The request is sent for the centre of the 0.25 degree cell (never for one subscriber's own position). */
function mm_climate(float $lat, float $lon, string $date): ?array {
  $cLat = round($lat * 4) / 4 + 0.0; $cLon = round($lon * 4) / 4 + 0.0; // cell centre (ERA5 native resolution is 0.25)
  $key = sprintf('clim2_%.2f_%.2f_%s', $cLat, $cLon, substr($date, 5, 5));
  $f = mm_data_dir() . '/' . sha1($key) . '.json';
  if (is_file($f) && time() - filemtime($f) < 8 * 86400) { $j = json_decode((string)file_get_contents($f), true); if ($j) return $j; }
  $mins = []; $maxs = [];
  [$y0, $m, $d] = array_map('intval', explode('-', $date));
  for ($y = 2010; $y <= 2024; $y++) {
    $dd = ($m === 2 && $d === 29 && !checkdate(2, 29, $y)) ? 28 : $d; // 29 February in a non-leap year: use 28 February
    $c = mktime(12, 0, 0, $m, $dd, $y);
    $s = date('Y-m-d', $c - 7 * 86400); $e = date('Y-m-d', $c + 7 * 86400);
    $j = mm_http_json('https://archive-api.open-meteo.com/v1/archive?latitude=' . $cLat . '&longitude=' . $cLon .
      "&start_date=$s&end_date=$e&daily=temperature_2m_max,temperature_2m_min&models=era5&timezone=auto");
    if (!$j) continue;
    foreach ((array)($j['daily']['temperature_2m_min'] ?? []) as $v) if (is_numeric($v)) $mins[] = (float)$v;
    foreach ((array)($j['daily']['temperature_2m_max'] ?? []) as $v) if (is_numeric($v)) $maxs[] = (float)$v;
  }
  if (count($mins) < 100 || count($maxs) < 100) { mm_log("climate too few samples for $key"); return null; }
  $r = ['min_p02' => mm_percentile($mins, 0.02), 'min_mean' => array_sum($mins) / count($mins),
        'max_p98' => mm_percentile($maxs, 0.98), 'max_mean' => array_sum($maxs) / count($maxs), 'n' => count($mins)];
  @file_put_contents($f, json_encode($r), LOCK_EX);
  return $r;
}

/** Tomorrow's forecast (in the location's own time zone) from all models. */
function mm_tomorrow(float $lat, float $lon): ?array {
  $j = mm_http_json('https://api.open-meteo.com/v1/forecast?latitude=' . $lat . '&longitude=' . $lon .
    '&daily=temperature_2m_max,temperature_2m_min&models=' . MM_MODELS . '&timezone=auto&forecast_days=3');
  if (!$j || empty($j['daily']['time'][1])) return null;
  $mins = []; $maxs = [];
  foreach (explode(',', MM_MODELS) as $m) {
    $a = $j['daily']["temperature_2m_min_$m"][1] ?? null; $b = $j['daily']["temperature_2m_max_$m"][1] ?? null;
    if (is_numeric($a)) $mins[] = (float)$a;
    if (is_numeric($b)) $maxs[] = (float)$b;
  }
  if (count($mins) < 3 || count($maxs) < 3) return null;
  return ['date' => $j['daily']['time'][1], 'tz' => $j['timezone'] ?? 'UTC', 'mins' => $mins, 'maxs' => $maxs];
}

function mm_need(int $n): int { return max(2, intdiv($n, 2) + 1); } // strict majority, at least 2 (same rule as src/calc.js)
/** Decide whether tomorrow is unusual. Returns null or ['type'=>'cold'|'heat', 'value', 'normal', 'k', 'n']. */
function mm_evaluate(array $fc, array $cl): ?array {
  $nMin = count($fc['mins']); $nMax = count($fc['maxs']); // cold and heat each use their own number of models
  $minMed = mm_median($fc['mins']); $maxMed = mm_median($fc['maxs']);
  $kCold = count(array_filter($fc['mins'], fn($v) => $v < $cl['min_p02']));
  $kHeat = count(array_filter($fc['maxs'], fn($v) => $v > $cl['max_p98']));
  if ($minMed < $cl['min_p02'] && $cl['min_mean'] - $minMed >= 5 && $kCold >= mm_need($nMin))
    return ['type' => 'cold', 'value' => $minMed, 'normal' => $cl['min_mean'], 'k' => $kCold, 'n' => $nMin];
  if ($maxMed > $cl['max_p98'] && $maxMed - $cl['max_mean'] >= 5 && $kHeat >= mm_need($nMax))
    return ['type' => 'heat', 'value' => $maxMed, 'normal' => $cl['max_mean'], 'k' => $kHeat, 'n' => $nMax];
  return null;
}

function mm_texts(): array {
  return [
    'coldTitle' => ['he'=>'קור חריג מחר ב{p}','en'=>'Unusual cold tomorrow in {p}','ar'=>'برد غير اعتيادي غدًا في {p}','ru'=>'Аномальный холод завтра: {p}','zh'=>'{p}明天异常寒冷','ja'=>'{p}は明日、異例の寒さ','fr'=>'Froid inhabituel demain à {p}','de'=>'Ungewöhnliche Kälte morgen in {p}','es'=>'Frío inusual mañana en {p}','it'=>'Freddo insolito domani a {p}','pt'=>'Frio invulgar amanhã em {p}','nl'=>'Ongewone kou morgen in {p}','pl'=>'Nietypowe zimno jutro: {p}','uk'=>'Аномальний холод завтра: {p}'],
    'heatTitle' => ['he'=>'חום חריג מחר ב{p}','en'=>'Unusual heat tomorrow in {p}','ar'=>'حر غير اعتيادي غدًا في {p}','ru'=>'Аномальная жара завтра: {p}','zh'=>'{p}明天异常炎热','ja'=>'{p}は明日、異例の暑さ','fr'=>'Chaleur inhabituelle demain à {p}','de'=>'Ungewöhnliche Hitze morgen in {p}','es'=>'Calor inusual mañana en {p}','it'=>'Caldo insolito domani a {p}','pt'=>'Calor invulgar amanhã em {p}','nl'=>'Ongewone hitte morgen in {p}','pl'=>'Nietypowy upał jutro: {p}','uk'=>'Аномальна спека завтра: {p}'],
    'coldBody' => ['he'=>'צפויה טמפרטורת מינימום של {t}, לעומת {n} בממוצע בעונה הזו. {k}/{m} מודלים מסכימים.','en'=>'Expected low {t}, versus a usual {n} at this time of year. {k}/{m} models agree.','ar'=>'الحد الأدنى المتوقع {t}، مقابل {n} في المعتاد في هذا الوقت من السنة. {k}/{m} نماذج متفقة.','ru'=>'Ожидаемый минимум {t}, обычно в это время {n}. Согласны {k}/{m} моделей.','zh'=>'预计最低气温{t}，而往年此时通常为{n}。{k}/{m}个模型一致。','ja'=>'予想最低気温{t}（例年この時期は{n}）。{k}/{m}モデルが一致。','fr'=>"Minimum prévu {t}, contre {n} habituellement à cette période. {k}/{m} modèles sont d'accord.",'de'=>'Erwartetes Minimum {t}, sonst um diese Zeit {n}. {k}/{m} Modelle stimmen überein.','es'=>'Mínima prevista {t}, frente a {n} habitual en esta época. {k}/{m} modelos coinciden.','it'=>'Minima prevista {t}, contro {n} di solito in questo periodo. {k}/{m} modelli concordano.','pt'=>'Mínima prevista {t}, contra {n} habitual nesta época. {k}/{m} modelos concordam.','nl'=>'Verwachte minimumtemperatuur {t}, normaal rond deze tijd {n}. {k}/{m} modellen zijn het eens.','pl'=>'Prognozowane minimum {t}, zwykle o tej porze {n}. Zgodnych {k}/{m} modeli.','uk'=>'Очікуваний мінімум {t}, зазвичай у цей час {n}. Згодні {k}/{m} моделей.'],
    'heatBody' => ['he'=>'צפויה טמפרטורת מקסימום של {t}, לעומת {n} בממוצע בעונה הזו. {k}/{m} מודלים מסכימים.','en'=>'Expected high {t}, versus a usual {n} at this time of year. {k}/{m} models agree.','ar'=>'الحد الأقصى المتوقع {t}، مقابل {n} في المعتاد في هذا الوقت من السنة. {k}/{m} نماذج متفقة.','ru'=>'Ожидаемый максимум {t}, обычно в это время {n}. Согласны {k}/{m} моделей.','zh'=>'预计最高气温{t}，而往年此时通常为{n}。{k}/{m}个模型一致。','ja'=>'予想最高気温{t}（例年この時期は{n}）。{k}/{m}モデルが一致。','fr'=>"Maximum prévu {t}, contre {n} habituellement à cette période. {k}/{m} modèles sont d'accord.",'de'=>'Erwartetes Maximum {t}, sonst um diese Zeit {n}. {k}/{m} Modelle stimmen überein.','es'=>'Máxima prevista {t}, frente a {n} habitual en esta época. {k}/{m} modelos coinciden.','it'=>'Massima prevista {t}, contro {n} di solito in questo periodo. {k}/{m} modelli concordano.','pt'=>'Máxima prevista {t}, contra {n} habitual nesta época. {k}/{m} modelos concordam.','nl'=>'Verwachte maximumtemperatuur {t}, normaal rond deze tijd {n}. {k}/{m} modellen zijn het eens.','pl'=>'Prognozowane maksimum {t}, zwykle o tej porze {n}. Zgodnych {k}/{m} modeli.','uk'=>'Очікуваний максимум {t}, зазвичай у цей час {n}. Згодні {k}/{m} моделей.'],
    'testTitle' => ['he'=>'בדיקת התראות','en'=>'Test notification','ar'=>'إشعار تجريبي','ru'=>'Тестовое уведомление','zh'=>'测试通知','ja'=>'テスト通知','fr'=>'Notification de test','de'=>'Testbenachrichtigung','es'=>'Notificación de prueba','it'=>'Notifica di prova','pt'=>'Notificação de teste','nl'=>'Testmelding','pl'=>'Powiadomienie testowe','uk'=>'Тестове сповіщення'],
    'testBody' => ['he'=>'ההתראות פועלות. התראה על מזג אוויר חריג ב{p} תגיע בערב שלפני, בסביבות 20:00.','en'=>'Notifications work. Alerts about unusual weather in {p} arrive the evening before, around 20:00.','ar'=>'الإشعارات تعمل. تصل تنبيهات الطقس غير الاعتيادي في {p} في المساء السابق قرابة الساعة 20:00.','ru'=>'Уведомления работают. Предупреждения о необычной погоде ({p}) приходят накануне вечером, около 20:00.','zh'=>'通知已开启。{p}的异常天气预警将在前一天晚上20:00左右发送。','ja'=>'通知は有効です。{p}の異常気象の警報は前日の20:00頃に届きます。','fr'=>"Les notifications fonctionnent. Les alertes de météo inhabituelle à {p} arrivent la veille vers 20 h.",'de'=>'Benachrichtigungen funktionieren. Warnungen vor ungewöhnlichem Wetter in {p} kommen am Vorabend gegen 20:00 Uhr.','es'=>'Las notificaciones funcionan. Las alertas de tiempo inusual en {p} llegan la noche anterior, hacia las 20:00.','it'=>'Le notifiche funzionano. Le allerte per meteo insolito a {p} arrivano la sera prima, verso le 20:00.','pt'=>'As notificações funcionam. Os alertas de tempo invulgar em {p} chegam na véspera, por volta das 20:00.','nl'=>'Meldingen werken. Waarschuwingen voor ongewoon weer in {p} komen de avond ervoor, rond 20:00.','pl'=>'Powiadomienia działają. Ostrzeżenia o nietypowej pogodzie ({p}) przychodzą wieczorem dzień wcześniej, około 20:00.','uk'=>'Сповіщення працюють. Попередження про незвичну погоду ({p}) надходять напередодні ввечері, близько 20:00.'],
  ];
}
function mm_t(string $key, string $lang, array $p): string {
  $T = mm_texts(); $s = $T[$key][$lang] ?? $T[$key]['en'];
  foreach ($p as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
  return $s;
}
function mm_fmt_temp(float $c, bool $imp): string { return (string)round($imp ? $c * 9 / 5 + 32 : $c) . ($imp ? '°F' : '°C'); }

function mm_vapid(): array {
  $c = mm_cfg();
  return ['private_pem' => (string)($c['vapid_private_pem'] ?? ''), 'public_b64u' => (string)($c['vapid_public'] ?? ''),
          'subject' => (string)($c['vapid_subject'] ?? 'mailto:admin@example.com')];
}
function mm_app_url(): string { return 'https://odinelad.github.io/multimodel/'; }

/** Send to one subscriber; drops subscriptions the push service reports as gone. */
function mm_push(array $s, string $title, string $body, string $tag): int {
  $payload = json_encode(['title' => $title, 'body' => $body, 'tag' => $tag, 'url' => mm_app_url()], JSON_UNESCAPED_UNICODE);
  // Web Push allows about 4 KB of encrypted payload: stay well below it. Shorten the body if needed, otherwise do not send.
  if (strlen($payload) >= 3000) {
    $over = strlen($payload) - 2900;
    $body = mb_strcut($body, 0, max(0, strlen($body) - $over - 3), 'UTF-8') . '...';
    $payload = json_encode(['title' => $title, 'body' => $body, 'tag' => $tag, 'url' => mm_app_url()], JSON_UNESCAPED_UNICODE);
  }
  if (!is_string($payload) || strlen($payload) >= 3000) { mm_log('push payload too large, not sent'); return 413; }
  try { $code = webpush_send($s, $payload, mm_vapid()); }
  catch (Throwable $e) { mm_log('push error: ' . $e->getMessage()); $code = 0; }
  $db = mm_db();
  if ($code === 404 || $code === 410) { $db->prepare('DELETE FROM subs WHERE endpoint=?')->execute([$s['endpoint']]); }
  elseif ($code < 200 || $code >= 300) {
    $db->prepare('UPDATE subs SET fails=fails+1 WHERE endpoint=?')->execute([$s['endpoint']]);
    mm_log("push failed HTTP $code");
  }
  return $code;
}
