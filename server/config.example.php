<?php
// Copy to config.php next to api.php. Never commit the real file.
return [
  'ims_token' => '',                 // Israel Meteorological Service API token
  'vapid_private_pem' => '',         // Web Push VAPID private key (PEM). Generate with vapid_generate() in push_lib.php
  'vapid_public' => '',              // Web Push VAPID public key (base64url)
  'vapid_subject' => 'mailto:you@example.com',
];
