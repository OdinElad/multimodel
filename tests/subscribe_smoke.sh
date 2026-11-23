#!/bin/sh
# Local smoke test for server/subscribe.php (needs php-cli with sqlite). Usage: sh tests/subscribe_smoke.sh
# Copies the server into a throwaway tree (so multimodel-data lands outside the web root, like on the real host).
set -e
ROOT=$(mktemp -d)
mkdir -p "$ROOT/public_html/weather"
cp "$(dirname "$0")"/../server/*.php "$ROOT/public_html/weather/"
cd "$ROOT/public_html/weather"
php -r 'require "push_lib.php"; $k=vapid_generate(); file_put_contents("config.php","<?php return ".var_export(["vapid_private_pem"=>$k["private_pem"],"vapid_public"=>$k["public_b64u"],"vapid_subject"=>"mailto:t@example.com"],true).";");'
PORT=18765
php -S 127.0.0.1:$PORT >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$ROOT"' EXIT
sleep 1
U=http://127.0.0.1:$PORT/subscribe.php
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got $2, want $3)"; fail=1; fi; }
P256=$(php -r 'echo rtrim(strtr(base64_encode("\x04".str_repeat("a",64)),"+/","-_"),"=");')
AUTH=$(php -r 'echo rtrim(strtr(base64_encode(str_repeat("b",16)),"+/","-_"),"=");')
EP="https://fcm.googleapis.com/fcm/send/abc123"
SUB="{\"action\":\"subscribe\",\"subscription\":{\"endpoint\":\"$EP\",\"keys\":{\"p256dh\":\"$P256\",\"auth\":\"$AUTH\"}},\"lat\":32.4747,\"lon\":34.9707,\"name\":\"Test\",\"lang\":\"en\",\"imperial\":false,\"tz\":\"Asia/Jerusalem\"}"
post() { curl -s -o /tmp/mm_smoke_body -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "$1" $U; }
check "GET ?key" "$(curl -s -o /dev/null -w '%{http_code}' "$U?key=1")" 200
check "PUT is 405" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $U)" 405
check "DELETE is 405" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $U)" 405
check "OPTIONS ok" "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS $U)" 200
check "subscribe (1st POST)" "$(post "$SUB")" 200
ls "$ROOT/multimodel-data/subscriptions.sqlite" >/dev/null && echo "ok   database is outside public_html"
test ! -e "$ROOT/public_html/weather/data" && echo "ok   no data folder inside public_html"
check "stored location is rounded" "$(php -r '$d=new PDO("sqlite:'"$ROOT"'/multimodel-data/subscriptions.sqlite");echo $d->query("select lat||\",\"||lon from subs")->fetchColumn();')" "32.47,34.97"
BIG=$(php -r 'echo json_encode(["action"=>"subscribe","pad"=>str_repeat("x",9000)]);')
check "body over 8KB is 413 (2nd POST)" "$(post "$BIG")" 413
check "bad json is 400 (3rd POST)" "$(post 'nope')" 400
check "unsubscribe deletes (4th POST)" "$(post "{\"action\":\"unsubscribe\",\"endpoint\":\"$EP\"}")" 200
check "row is gone" "$(php -r '$d=new PDO("sqlite:'"$ROOT"'/multimodel-data/subscriptions.sqlite");echo $d->query("select count(*) from subs")->fetchColumn();')" 0
# B1 strict validation, B3 endpoint rules, B2 atomic test slot (these use up some of the hourly allowance, so it is reset before the rate-limit check)
mk() { # $1=endpoint $2=p256dh $3=auth $4=lat json
  echo "{\"action\":\"subscribe\",\"subscription\":{\"endpoint\":\"$1\",\"keys\":{\"p256dh\":\"$2\",\"auth\":\"$3\"}},\"lat\":$4,\"lon\":34.97,\"name\":\"T\",\"lang\":\"en\",\"tz\":\"UTC\"}"
}
NOT04=$(php -r 'echo rtrim(strtr(base64_encode("\x05".str_repeat("a",64)),"+/","-_"),"=");')
AUTH15=$(php -r 'echo rtrim(strtr(base64_encode(str_repeat("b",15)),"+/","-_"),"=");')
AUTH17=$(php -r 'echo rtrim(strtr(base64_encode(str_repeat("b",17)),"+/","-_"),"=");')
check "p256dh not starting with 0x04 is 400" "$(post "$(mk $EP $NOT04 $AUTH 32.4)")" 400
check "auth of 15 bytes is 400" "$(post "$(mk $EP $P256 $AUTH15 32.4)")" 400
check "auth of 17 bytes is 400" "$(post "$(mk $EP $P256 $AUTH17 32.4)")" 400
check "base64 with + / = is 400" "$(post "$(mk $EP "${P256}==" $AUTH 32.4)")" 400
check "lat as a string is 400" "$(post "$(mk $EP $P256 $AUTH '\"32.4\"')")" 400
check "endpoint on port 8443 is 400" "$(post "$(mk https://fcm.googleapis.com:8443/fcm/send/abc $P256 $AUTH 32.4)")" 400
check "endpoint with userinfo is 400" "$(post "$(mk https://user:pw@fcm.googleapis.com/fcm/send/abc $P256 $AUTH 32.4)")" 400
check "endpoint with fragment is 400" "$(post "$(mk 'https://fcm.googleapis.com/fcm/send/abc#x' $P256 $AUTH 32.4)")" 400
check "endpoint on port 443 is accepted" "$(post "$(mk https://fcm.googleapis.com:443/fcm/send/ok443 $P256 $AUTH 32.4)")" 200
check "subscription as a string is 400, no PHP error" "$(post '{"action":"subscribe","subscription":"x","lat":1,"lon":1}')" 400
check "action as an array is 400" "$(post '{"action":["x"]}')" 400
check "endpoint as an array is 400" "$(post '{"action":"unsubscribe","endpoint":["x"]}')" 400
check "no PHP warning text in answers" "$(post '{"action":"subscribe","subscription":{"endpoint":5,"keys":"x"}}' >/dev/null; grep -c -i 'warning\|notice\|fatal' /tmp/mm_smoke_body)" 0
post "$SUB" >/dev/null
r1=$(post "{\"action\":\"test\",\"endpoint\":\"$EP\"}"); r2=$(post "{\"action\":\"test\",\"endpoint\":\"$EP\"}")
check "first test claims the slot (not 429)" "$([ "$r1" = 429 ] && echo 429 || echo ok)" ok
check "second test within a minute is 429" "$r2" 429
php -r '$d=new PDO("sqlite:'"$ROOT"'/multimodel-data/subscriptions.sqlite");$d->exec("DELETE FROM rl");$d->exec("DELETE FROM subs");'
n=0; last=0
while [ $n -lt 20 ]; do n=$((n+1)); last=$(post "{\"action\":\"unsubscribe\",\"endpoint\":\"x\"}"); done
check "20th POST still allowed" "$last" 200
check "21st POST from the same address is 429" "$(post "{\"action\":\"unsubscribe\",\"endpoint\":\"x\"}")" 429
check "no raw IP stored" "$(php -r '$d=new PDO("sqlite:'"$ROOT"'/multimodel-data/subscriptions.sqlite");echo (int)(strpos(json_encode($d->query("select * from rl")->fetchAll()),"127.0.0.1")!==false);')" 0
# daily cap on new subscribers (300): fill the table directly, then try one more
php -r '$d=new PDO("sqlite:'"$ROOT"'/multimodel-data/subscriptions.sqlite");$d->exec("DELETE FROM rl");$s=$d->prepare("INSERT INTO subs (endpoint,p256dh,auth,lat,lon,created,updated) VALUES (?,?,?,0,0,?,?)");for($i=0;$i<300;$i++)$s->execute(["https://fcm.googleapis.com/x$i","p","a",time(),time()]);'
check "301st new subscriber in 24h is 503" "$(post "$SUB")" 503
if [ $fail = 0 ]; then echo "ALL OK"; else echo "SOME FAILED"; exit 1; fi
