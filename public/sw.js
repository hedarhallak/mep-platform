// public/sw.js
self.addEventListener("install", (event) => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { self.clients.claim(); });

// Server push required for background notifications when app is closed.
self.addEventListener("push", (event) => {
  try{
    const data = event.data ? event.data.json() : { title:"MEP Site Workforce", body:"Shift reminder" };
    event.waitUntil(self.registration.showNotification(data.title || "MEP Site Workforce", { body: data.body || "Shift reminder" }));
  }catch(e){}
});
