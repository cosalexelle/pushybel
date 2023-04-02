// pushybel service-worker

const channel = new BroadcastChannel("pushybel-notifications-worker")

let processNotification = async (event) => {
  const payload = event.data ? event.data.text() : "no payload";

  let {title, body, tag, icon, image} = notification = JSON.parse(payload)

  let msg = {
    notification
  }

  // tell client message received
  channel.postMessage(msg)

  // show a notification 
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