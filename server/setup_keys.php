<?php
// One-time server setup (CLI only): adds Web Push VAPID keys to config.php if missing.
// Keeps every existing value. The private key is created on the server and never leaves it.
// Usage: php setup_keys.php mailto:you@example.com
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/push_lib.php';

$f = __DIR__ . '/config.php';
$c = is_file($f) ? (array)(require $f) : [];
$subject = $argv[1] ?? '';

$changed = false;
if (empty($c['vapid_private_pem']) || empty($c['vapid_public'])) {
  $k = vapid_generate();
  $c['vapid_private_pem'] = $k['private_pem'];
  $c['vapid_public'] = $k['public_b64u'];
  $changed = true;
}
if ($subject !== '' && ($c['vapid_subject'] ?? '') !== $subject) { $c['vapid_subject'] = $subject; $changed = true; }

if ($changed) {
  $tmp = $f . '.tmp';
  file_put_contents($tmp, "<?php\nreturn " . var_export($c, true) . ";\n");
  @chmod($tmp, 0600);
  rename($tmp, $f);
}
echo ($changed ? 'updated' : 'unchanged'), ' public=', $c['vapid_public'] ?? '', ' ims=', empty($c['ims_token']) ? 'missing' : 'ok', "\n";
