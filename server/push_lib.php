<?php
/**
 * Minimal Web Push sender (RFC 8291 aes128gcm encryption + RFC 8292 VAPID).
 * No external libraries: only the PHP openssl extension.
 */
declare(strict_types=1);

function b64u_enc(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec(string $s): string { $s = strtr($s, '-_', '+/'); return (string)base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4)); }

/** Raw uncompressed P-256 point (65 bytes) -> PEM public key. */
function p256_raw_to_pem(string $raw): string {
  $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw;
  return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** Public key (65 bytes uncompressed) of an EC private key resource/PEM. */
function p256_public_raw($key): string {
  $d = openssl_pkey_get_details($key);
  $x = str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT);
  $y = str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
  return "\x04" . $x . $y;
}

/** Create a new VAPID key pair. Returns ['private_pem' => ..., 'public_b64u' => ...]. */
function vapid_generate(): array {
  $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
  openssl_pkey_export($k, $pem);
  return ['private_pem' => $pem, 'public_b64u' => b64u_enc(p256_public_raw($k))];
}

/** DER ECDSA signature -> raw 64-byte r||s (JWS ES256 format). */
function ecdsa_der_to_raw(string $der): string {
  $off = 2; if (ord($der[1]) & 0x80) { $off += ord($der[1]) & 0x7f; }
  $parts = [];
  for ($i = 0; $i < 2; $i++) {
    if (ord($der[$off]) !== 0x02) throw new RuntimeException('bad DER');
    $len = ord($der[$off + 1]);
    $v = substr($der, $off + 2, $len);
    $v = ltrim($v, "\0");
    $parts[] = str_pad($v, 32, "\0", STR_PAD_LEFT);
    $off += 2 + $len;
  }
  return $parts[0] . $parts[1];
}

function vapid_header(string $endpoint, string $privPem, string $pubB64u, string $subject): string {
  $u = parse_url($endpoint);
  $aud = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
  $h = b64u_enc(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
  $c = b64u_enc(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => $subject]));
  $key = openssl_pkey_get_private($privPem);
  if (!openssl_sign("$h.$c", $der, $key, OPENSSL_ALGO_SHA256)) throw new RuntimeException('sign failed');
  $jwt = "$h.$c." . b64u_enc(ecdsa_der_to_raw($der));
  return "vapid t=$jwt, k=$pubB64u";
}

/** Encrypt a payload for a subscription (aes128gcm). Returns the request body. */
function webpush_encrypt(string $payload, string $uaPublicB64u, string $authB64u): string {
  $uaPub = b64u_dec($uaPublicB64u); $auth = b64u_dec($authB64u);
  if (strlen($uaPub) !== 65 || $uaPub[0] !== "\x04" || strlen($auth) < 16) throw new InvalidArgumentException('bad subscription keys');
  $as = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
  $asPub = p256_public_raw($as);
  $shared = openssl_pkey_derive(openssl_pkey_get_public(p256_raw_to_pem($uaPub)), $as, 32);
  if ($shared === false) throw new RuntimeException('ECDH failed');
  $prkKey = hash_hmac('sha256', $shared, $auth, true);
  $ikm = hash_hmac('sha256', "WebPush: info\0" . $uaPub . $asPub . "\x01", $prkKey, true);
  $salt = random_bytes(16);
  $prk = hash_hmac('sha256', $ikm, $salt, true);
  $cek = substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\0\x01", $prk, true), 0, 16);
  $nonce = substr(hash_hmac('sha256', "Content-Encoding: nonce\0\x01", $prk, true), 0, 12);
  $tag = '';
  $ct = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
  if ($ct === false) throw new RuntimeException('encrypt failed');
  return $salt . pack('N', 4096) . chr(65) . $asPub . $ct . $tag;
}

/** Only known browser push services are accepted (prevents the server being used to call arbitrary URLs). */
function push_endpoint_allowed(string $endpoint): bool {
  $u = parse_url($endpoint);
  if (!$u || ($u['scheme'] ?? '') !== 'https' || empty($u['host'])) return false;
  $h = strtolower($u['host']);
  foreach (['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'] as $ok) {
    if ($h === $ok || str_ends_with($h, '.' . $ok)) return true;
  }
  return false;
}

/** Send one notification. Returns HTTP status (201 = accepted, 404/410 = subscription gone). */
function webpush_send(array $sub, string $payload, array $vapid, int $ttl = 43200): int {
  if (!push_endpoint_allowed($sub['endpoint'])) return 400;
  $body = webpush_encrypt($payload, $sub['p256dh'], $sub['auth']);
  $ch = curl_init($sub['endpoint']);
  curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => [
      'Content-Type: application/octet-stream', 'Content-Encoding: aes128gcm', 'TTL: ' . $ttl, 'Urgency: normal',
      'Authorization: ' . vapid_header($sub['endpoint'], $vapid['private_pem'], $vapid['public_b64u'], $vapid['subject']),
    ],
  ]);
  curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return $code;
}
