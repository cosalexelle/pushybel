# Pushybel
Push notifications for the web. (for NodeJS)

_Browser support may be limited._

## How to use
1. Install pushybel 

```bash
npm i pushybel
```

2. Import pushybel 

```js 
const {PushybelServer} = require("pushybel")
```

3. Add pushybel to your Express app:

```js
// import Express and build your web app
const express = require("express")
const app = express()

// ...

// import Pushybel
const {PushybelServer} = require("pushybel")

// Create a PushybelServer on your Express app
let pushybel = new PushybelServer(app, configuration)
pushybel.on("subscribe", (client_id) => {
    /* 
    client_id has subscribed to pushybel
    pushybel automatically stores this information in a database.
    you can use this on("subscribe", () => {}) method to store the client_id ready to use with sendNotification()
    */
})
pushybel.on("update", (client_id) => {
    /* client_id has updated their subscription details if you're keeping a record of these, you may want to update your records */
})
```

4. Include the following on any pages using pushybel
```html
<script src="/pushybel/network.js"></script>
<script src="/pushybel/pushybel-client.js"></script>
```
```js
let pushybel = new PushybelClient()

// ...

// call subscribe() from a user-iniated event
button_element.addEventListener("click", () => {
    pushybel.subscribe()
})
```

## Sending Notifications

1. To send a notification to a user, run the following:
```js
// client_id - uuid of client
// subject - must be mailto or web address
// notification - {title, body}
pushybel.sendNotification(client_id, subject, notification)
```

## Mission Control
You can optionally enable and use **Mission Control** to send notifications to users. **Mission Control** provides access to a list of **client_ids** who have subscribed to pushybel.

_Please note: **Mission Control** is a work in progress._

You'll need to manually provide a username and the hex encoding of a sha256 hash of a password. Pushybel reccomends storing this in an environment file, and loading them with ```process.env```

To enable **Mission Control**:
```js
// ...

let configuration = {
    mission_control: {
        enable: true,
        user: pushybel // or any username
        password: "FFFF..." // (sha256 of password, in hex)
    }
}

let pushybel = new PushybelServer(app, configuration)

```

Point your browser to ```/pushybel/mission-control``` to login.

## Under the Hood
Pushybel uses service workers to receive web-push events.

## Security
The security of this project has not been fully tested. 

Currently, information is stored as JSON objects in a folder located in ./.data/.databases/

**Mission Control** uses a basic username and password, set by the installing user, to login.

When a client subscribes to pushybel, the client browser receives a UUID and token used to authenticate the user. Requests to update a subscription are authenticated using a sha256 hash of the token and a random salt - these are sent along with the subscription details to the pushybel server to authenticate the update.

## Supported platforms
Currently, pushybel only works with NodeJS, for apps using Express.

## TODO:
Basically everything... Pull requests are welcome

## Important
This project is **unstable**! 

## License
MIT