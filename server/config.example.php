<?php
// Copy to config.php next to api.php. Never commit the real file.
return [
  'ims_token' => '',                 // Israel Meteorological Service API token
  'vapid_private_pem' => '',         // Web Push VAPID private key (PEM). Generate with vapid_generate() in push_lib.php
  'vapid_public' => '',              // Web Push VAPID public key (base64url)
  'vapid_subject' => 'mailto:you@example.com',
  // Optional limits for subscribe.php (defaults shown)
  // 'rl_per_hour' => 60,      // requests per client address per hour (unsubscribe is never limited)
  // 'new_per_day' => 5000,    // new subscribers per day, all users together
  // 'max_subs' => 50000,      // total subscribers
];
