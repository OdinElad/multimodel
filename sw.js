// Tahazit service worker: offline app shell + unusual-weather notifications.
const CACHE='mm-shell-v13';
const SHELL=['./','index.html','manifest.json','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));
});
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(err){d={title:'Tahazit',body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(d.title||'Tahazit',{
    body:d.body||'',tag:d.tag||'mm',renotify:true,icon:'icons/icon-192.png',badge:'icons/badge-96.png',
    data:{url:d.url||self.registration.scope},lang:d.lang||undefined
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||self.registration.scope;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if(c.url.startsWith(self.registration.scope)&&'focus' in c)return c.focus()}
    return self.clients.openWindow(url);
  }));
});
