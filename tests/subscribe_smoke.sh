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
n=4; last=0
while [ $n -lt 20 ]; do n=$((n+1)); last=$(post "{\"action\":\"unsubscribe\",\"endpoint\":\"x\"}"); done
check "20th POST still allowed" "$last" 200
check "21st POST from the same address is 429" "$(post "{\"action\":\"unsubscribe\",\"endpoint\":\"x\"}")" 429
check "no raw IP stored" "$(php -r '$d=new PDO("sqlite:'"$ROOT"'/multimodel-data/subscriptions.sqlite");echo (int)(strpos(json_encode($d->query("select * from rl")->fetchAll()),"127.0.0.1")!==false);')" 0
# daily cap on new subscribers (300): fill the table directly, then try one more
php -r '$d=new PDO("sqlite:'"$ROOT"'/multimodel-data/subscriptions.sqlite");$d->exec("DELETE FROM rl");$s=$d->prepare("INSERT INTO subs (endpoint,p256dh,auth,lat,lon,created,updated) VALUES (?,?,?,0,0,?,?)");for($i=0;$i<300;$i++)$s->execute(["https://fcm.googleapis.com/x$i","p","a",time(),time()]);'
check "301st new subscriber in 24h is 503" "$(post "$SUB")" 503
if [ $fail = 0 ]; then echo "ALL OK"; else echo "SOME FAILED"; exit 1; fi
