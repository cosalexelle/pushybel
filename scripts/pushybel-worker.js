// pushybel service-worker

let processNotification = async (event) => {
  const payload = event.data ? event.data.text() : "{}";

  let {title, body, tag, icon, image} = notification = JSON.parse(payload)

  self.registration.showNotification(title, {
    body,
    icon,
    image,
    tag
  })
  
}

self.addEventListener("push", async (event) => {
  event.waitUntil(processNotification(event))
})