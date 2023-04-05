# Pushybel
Push notifications for the web. (for NodeJS)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V6K2071)

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
const Pushybel = require("@pushybel/pushybel")

// Pushybel configuration
let config = {
  encryption: {
    password: "XXX" // a secure password used to encrypt the vapidKeys
  }
}

// Create a Pushybel server
// app - Express app object
// config - configuration object
let pushybel = new Pushybel.Server(app, config)

// Add event listeners
// client_object - sent to pushybel with subscription request
// subscription - object with subscription details
pushybel.on("subscribe", ({client_object, subscription}) => { 

})
```

4. Include the following on any pages using pushybel
```html
<script src="/pushybel/network.js"></script>
<script src="/pushybel/pushybel-client.js"></script>
```
```js
// Create a Pushybel client
let pushybel = new PushybelClient()

// ...

// call subscribe() from a user-iniated event
button_element.addEventListener("click", () => {
    let client_object = {
        id: 1234, // an identifier for this user
        // ... any other info to identify this subscription
    }
    pushybel.subscribe(client_object)
})
```

## Sending Notifications

1. To send a notification to a user, run the following:
```js
// subscription - subscription object
// subject - must be mailto or web address
// notification - {title, body}
pushybel.sendNotification(subscription, subject, notification)
```

## Mission Control

**Mission Control** provides a control panel from which you can store subscription details and send notifications to users.

Add the following to your server:
```js
// ...

// MissionControl configuration
let config = {
  encryption: {
    password: "XXX" // password used to encrypt subscription details
  }
}

// Create MissionControl instance
let MissionControl = new Pushybel.MissionControl(pushybel, app, config)
```

**Mission Control** adds listeners to receive and store subscription details.

You won't be able to log in straight away. You'll need to set **superuser** details.

When you run ```new Pushybel.MissionControl()``` for the first time, add a **superuser** object to the configuration object.

```js
let config = {
    encryption: {
        password: "" // password used to encrypt subscription details
    },
    // add the super user
    // but remove this once the account has been created.
    superuser: {
        user: "pushy",
        password: "pushybel"
    }
}
```
If the **superuser** object is present each time the **Mission Control** object is created (on server start for example), the account will be re-added to the user database. If the password has been changed using the API, the new password will be overwritten with the password in the **superuser** object. 

_You should remove the **superuser** object from the configuration adn restart the server once the account has been created to prevent this._

Point your browser to ```/pushybel/mission-control``` to login.

### Adding other users
**Mission Control** features methods to add and remove users:

```js
// add a new user
MissionControl.addUser({user, password})
// delete a user
MissionControl.deleteUser({user})
```

## Under the Hood
Pushybel uses service workers to receive web-push events.

## Security
The security of this project has not been fully tested. 

The **vapidKeys** are stored encrypted in a database.
```js
new Pushybel.Server(app, {
    encryption: {
        password: "A1B2..." // a secure password
    }
})
```
For **Mission Control**, all subscription details and user accounts are encrypted too.

The password you provide will be salted and hashed to create the encryption key.

**Passwords should not be stored in your source code, and could instead be loaded from ```process.env```.**

**If you lose either password, the data will be unrecoverable!**

## Supported platforms
Currently, pushybel only works with NodeJS, for apps using Express.

|Platform|Requirements|
|---|---|
|Safari (macOS)|16.4| 
|Safari (iOS)|16.4+ (add to homescreen)|
|Google Chrome|unknown|
|Firefox|unknown|
|Edge (Chromium)|unknown|
|Edge|unknown|

## TODO:
Basically everything... Pull requests are welcome

## Important
This project is **unstable**! 

## License
MIT