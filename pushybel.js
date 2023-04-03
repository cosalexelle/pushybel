const fs = require("fs")
const path = require("path")
const webpush = require("web-push")
const crypto = require("crypto");
const express = require("express")

const {Database} = require("./database.js")

// global helper functions 

function sha256(str){
    return crypto.createHash("sha256").update(str).digest("hex");
}

class PushybelServer{

    // private variables
    #_http_root = null

    // vapidKeys
    #_keys = null

    // events
    #_events = null

    #_db_interface = null

    constructor(app, config){

        if(!app){
            throw new Error("Pushybel - An Express app parameter is required.")
        }

        if(!config){
            // use default configuration if none is provided
            // mission control is disabled
            config = {
                encryption: {
                    enable: false, // encryption is reccomended
                    key: null // key, hex-string?
                },
                mission_control: {
                    enable: false, // set true to enable mission-control
                    user: "pushy", // default username
                    hash: "" // password sha256 hash
                }
            }
        }

        this.#_http_root = "/pushybel"

        this.#_events = []

        this.#_initialise(app, config)

    }

    #_initialise = (app, config) => {

        // db

        if(config.encryption && config.encryption.enable){
            if(!config.encryption.key){
                throw new Error("Pushybel - You need to supply a key to use database encryption.")
            }
        }
        
        this.#_db_interface = new Database({
            namespace: "pushybel.server", 
            encrypt: config.encryption && config.encryption.enable, 
            key: config.encryption && config.encryption.key
        })

        // pushybel keys
        this.#_load_keys().then(keys => {
            this.#_keys = keys
        })

        // pushybel express app hooks
        app.use(express.json())
        // to allow the service worker to run from root
        // even though it's served from /pushybel/
        app.use((req, res, route) => {
            res.set("Service-Worker-Allowed", "/")
            route()
        })

        let pushybel_dir = path.dirname(__filename)
        let pushybel_scripts_dir = path.join(pushybel_dir, "scripts")
        
        // serve pushybel scripts
        app.use(`${this.#_http_root}`, express.static(pushybel_scripts_dir))

        // serve mission-control
        if(config.mission_control && config.mission_control.enable){
            let mission_control_config = config.mission_control;
            if(config.encryption && config.encryption.enable){
                mission_control_config = {
                    ...mission_control_config,
                    encryption: config.encryption
                }
            }
            let mission_control = new MissionControl(this, app, mission_control_config)
        }

        // vapid public key
        app.get(`${this.#_http_root}/key`, async (req, res) => {
            return res.status(200).send({
                publicKey: this.#_keys.publicKey
            })
        })
        // subscribe a client
        app.post(`${this.#_http_root}/subscribe`, async (req, res) => {
            
            let {uuid, auth, subscription, custom_uuid} = req.body;

            // no or invalid subscription provided
            if(!this.#_validate_subscription(subscription)){
                return res.status(400).json({
                    error: "This subscription is invalid. Please try again."
                })
            }

            // some user credentials but not both
            if( (uuid && !auth) || (!uuid && auth)){
                return res.status(400).json({
                    error: "To update a subscription, both a UUID and client authentication are required."
                })
            }

            // both login credentials 
            if(uuid && auth){
                 // update subscription for this user
                this.#_get_client(uuid).then(client => {
                    if(client){
                        // verify that the requested client has valid authentication
                        if(this.#_validate_client_authentication(client, auth)){
                            this.#_update_client(client, subscription).then(() => {
                                this.#_on_update(client, custom_uuid)
                                return res.status(200).json({
                                    uuid: client.uuid,
                                    token: client.token,
                                    msg: "Client updated sucessfully."
                                })
                            }).catch(error => {
                                return res.status(500).json({
                                    error: "Unable to update the client subscription. Please try again."
                                })
                            })
                        } else {
                            return res.status(403).send({
                                error: "The authentication provided for this client is invalid."
                            })
                        }
                    } else {
                        return res.status(403).send({
                            error: "Unable to locate this client. Please ensure the UUID is valid."
                        })
                    }
                })
                
            } else {
                // no uuid or authentication provided
                // create a client
                this.#_create_client(subscription).then(client => {
                    this.#_on_subscribe(client, custom_uuid)
                    return res.status(200).json({
                        uuid: client.uuid,
                        token: client.token
                    })
                }).catch(error => {
                    return res.send(500).json({
                        error: "There was an error creating a client for this subscription."
                    })
                })
                
            }
        })

    }

    get database(){
        return this.#_db_interface
    }

    #_validate_subscription = (subscription) => {

        return subscription !== null

    }

    #_validate_client_authentication = (client, auth) => {

        let checksum_str = client.uuid + ":" + client.token + ":" + auth.salt
        let checksum = sha256(checksum_str)

        return auth.hash === checksum

    }

    #_load_config = (config_key) => {
        return new Promise((r, rej) => {
            this.#_db_interface.transact(db => {
                let entries = db.table("config").where(({data}) => data.key === config_key)
                if(entries.count > 1){
                    throw new Error("Pushybel - Config - Multiple keys for input key.")
                } else if(entries.count == 1){
                    return entries.at(0).data.value
                } else  {
                    return null
                }
            }).then(output => r(output)).catch(rej)
        })
    }

    #_store_config = (config_key, config_value) => {
        return new Promise((r, rej) => {
            this.#_db_interface.transact(db => {
                let table = db.table("config")
                let entry = null;
                let entries = table.where(entry => entry.data.key === config_key)
                if(entries.count > 1){
                    throw new Error("Pushybel - Config - Multiple keys for input key.")
                } else if(entries.count == 1){
                    // update this key
                    entry = entries.at(0)
                } else {
                    // create this key
                    entry = table.entry()
                }
    
                entry.set({
                    key: config_key,
                    value: config_value
                })
            }).then(() => {
                // key storage sucessful
                r()
            }).catch(rej)
        })
    }

    #_load_keys = () => {
        return new Promise((r, rej) => {
            this.#_load_config("vapidKeys").then(keys => {
                if(!keys){
                    // generate keys and store them
                    keys = webpush.generateVAPIDKeys()
                    this.#_store_config("vapidKeys", keys).then(() => {
                        // keys stored sucessfully
                        r(keys)
                    }).catch(rej)
                } else r(keys)
            }).catch(rej)
        })

    }

    #_create_client = (subscription) => {

        return new Promise( async (r, rej) => {

            let uuid = crypto.randomUUID()

            while(await this.#_get_client(uuid)){
                uuid = crypto.randomUUID()
            }

            let token = crypto.randomBytes(16).toString("hex")

            this.#_db_interface.transact(db => {
                return db.table("clients").entry().set({
                    uuid,
                    token,
                    subscription
                }).data
            }).then(output => r(output)).catch(rej)
        })
    }

    #_update_client = async (client, subscription) => {
        return new Promise((r, rej) => {
            this.#_db_interface.transact(db => {
                let entries = db.table("clients").where(entry => {
                    return entry.data.uuid == client.uuid
                })
                if(entries.count > 1){
                    throw new Error("Pushybel - Clients - Multiple clients with uuid.")
                } else if(entries.count == 1){
                    let entry = entries.at(0)
                    entry.set({
                        ...entry.data,
                        subscription
                    })
                } else {
                    throw new Error("Pushybel - Clients - This client does not exist")
                }
            }).then(output => r(output)).catch(rej)
        })
    }
    #_remove_client = async (client) => {
        return await this.#_db_interface.transact(db => {
            let table = db.table("clients")
            let entries = table.where(entry => entry.data.uuid == client.uuid)
            if(entries.count > 1){
                throw new Error("Pushybel - Clients - Multiple clients with uuid.")
            } else if(entries.count == 1){
                let entry = entries.at(0)
                entry.drop().confirm()
            } else {
                throw new Error("Pushybel - Clients - This client does not exist")
            }
        })
    }

    #_get_client = (uuid) => {
        return new Promise((r, rej) => {
            this.#_db_interface.transact(db => {
                let table = db.table("clients")
                let entries = table.where(entry => {
                    return entry.data.uuid === uuid
                })
                if(entries.count > 1){
                    throw new Error("Pushybel - Clients - Multiple clients with uuid.")
                } else if(entries.count == 1){
                    return entries.at(0).data
                } else {
                    return null
                }
            }).then(output => r(output)).catch(rej)
        })
    }

    #_get_subscription_for = (uuid) => {
        return new Promise((r, rej) => {
            this.#_get_client(uuid).then(client => {
                if(client.subscription){
                    r(client.subscription)
                } else {
                    rej(new Error("Pushybel - #_get_subscription_for - No subscription found for UUID."))
                }
            }).catch(rej)        
        })
    }

    async getClients(){
        return new Promise((r, rej) => {
            this.#_db_interface.transact(db => {
                let table = db.table("clients")
                let entries = table.entries;
                return entries.data.map(x => x.uuid)
            }).then(output => {
                r(output)
            }).catch(rej)
        })
    }

    async sendNotification(uuid = null, subject = null, notification = null){

        return new Promise((r, rej) => {

            if(!uuid){
                rej(new Error("Pushybel - sendNotification - UUID parameter is required to send a notification.")) 
            }
            if(!notification){
                rej(new Error("Pushybel - sendNotification - Notification object is requied to send a notification."))
            }
            if(!subject){
                rej(new Error("Pushybel - sendNotification - Subject parameter is required."))
            }

            this.#_get_subscription_for(uuid).then(subscription => {

                const options = {
                    vapidDetails: {
                        subject, 
                        publicKey: this.#_keys.publicKey, 
                        privateKey: this.#_keys.privateKey
                    }
                }
        
                let payload = JSON.stringify(notification)

                webpush.sendNotification(subscription, payload, options).then(({statusCode}) => {
                    // webpush sucessfully sent notification
                    // could fail if status is not 200 or 201?
                    if(statusCode == 201 || statusCode == 200){
                        r(statusCode)
                     } else rej(statusCode)
                }).catch(rej)
            }).catch(rej)
        })
        
    }

    #_get_listeners = (event) => {
        return this.#_events.filter((listener) => listener.event === event)
    }

    #_on_update = (client, other_data) => {
        let listeners = this.#_get_listeners("update")
        for(let i = 0; i < listeners.length; i++){
            listeners[i].fn(client, other_data)
        }
    }

    #_on_subscribe = (client, other_data) => {
        let listeners = this.#_get_listeners("subscribe")
        for(let i = 0; i < listeners.length; i++){
            listeners[i].fn(client, other_data)
        }
    }

    // on(event: String, fn: Function)
    // event - event to listen for ["subscribe"]
    // returns PushybelServer (this)
    on(event, fn){
        if(!event || !(["subscribe", "update"].indexOf(event) > -1) ){
            throw new Error("Pushybel - on(event, fn) - event is not a valid event.")
        }
        if(!fn instanceof Function){
            throw new Error("Pushybel - on(event, fn) - fn is not a Function.")
        }

        this.#_events.push({event, fn})

        return this
    }
}

// mission-control

class MissionControl{
    #_http_root = null

    #_db = null

    #_pushybel_server = null

    #_user = null
    #_hash = null

    #_queue_running = null

    constructor(pushybel_server, app, config){

        this.#_pushybel_server = pushybel_server

        this.#_http_root = "/pushybel/mission-control"

        this.#_initialise(app, config)
    }

    #_initialise = async (app, config) => {

        let {user, hash, enable, encryption} = config

        if(!enable){
            // do not enable
            return false;
        }

        // initialise login information
        if( !user || !hash ){
            console.log(" --- Unable to start Pushybel Mission Control --- ")
            console.log(" --- Both user and password hash are required. --- ")
            console.log(" --- See documentation for more information. --- ")
            return false
        }

        this.#_db = new Database({
            namespace: "pushybel.mission-control",
            encrypt: encryption && encryption.enable,
            key: encryption && encryption.key
        })

        this.#_set_authentication(user, hash)

        let pushybel_dir = path.dirname(__filename)
        let mission_control_dir = path.join(pushybel_dir, "mission-control")

        app.use(`${this.#_http_root}`, express.static(mission_control_dir))

        app.post(`${this.#_http_root}/login`, async (req, res) => {

            let {user, password} = req.body

            if(!this.#_validate_authentication(user, password)){
                return res.status(403).send({
                    error: "Invalid username or password"
                })
            } 

            let session = await this.#_generate_session()

            return res.status(200).json(session)

        })

        app.post(`${this.#_http_root}/ping`, async (req, res) => {

            let {session} = req.body

            if(! await this.#_validate_session(session)){
                return res.status(403).send()
            }

            return res.status(200).json({
                ping: "pong"
            })

        })

        app.post(`${this.#_http_root}/api/:api`, async (req, res) => {

            let {session} = req.body

            if(! await this.#_validate_session(session)){
                return res.status(403).send()
            }

            let {api} = req.params

            if(!api){
                return res.status(403).send()
            }

            if(api == "push"){

                let {to, subject, notification} = req.body

                if(!to || !subject || !notification){
                    return res.status(400).send()
                }

                let added = this.queueNotification(to, subject, notification)

                return res.status(200).send({
                    msg: "Notifications queued.",
                    added
                })

            } else if(api == "clients"){

                this.#_pushybel_server.getClients().then(clients => {
                    return res.status(200).json(clients)
                }).catch(error => {
                    return res.status(500).json({
                        error: "There was an error loading the client list."
                    })
                })
                
            } else if(api == "notifications-queue"){
                let queue = this.notificationsQueue;
                return res.status(200).json(queue)
            }

        })

    }

    // authentication

    // store config user and hash
    #_set_authentication = (user, hash) => {
        this.#_user = user
        this.#_hash = hash
    }
    // validate login credentials
    #_validate_authentication = (user, password) => {
        return user === this.#_user && sha256(password) === this.#_hash
    }

    // geneate a session object
    #_generate_session = async () => {

        let uuid = crypto.randomUUID()

        let token = crypto.randomBytes(16).toString("hex")
        let epoch = new Date().getTime()

        let session_obj = {
            uuid,
            token,
            epoch
        }

        await this.#_db.transact(db => {
            return db.table("sessions").entry().set(session_obj).data
        })

        return {
            uuid,
            token
        }

    }

    // find session by uuid
    #_get_session = async (uuid) => {
        return await this.#_db.transact(db => {
            let table = db.table("sessions");
            let entries = table.where(entry => {
                return entry.data.uuid === uuid
            })
            if(entries.count > 1){
                throw new Error("Mission Control - Multiple sessions with UUID.")
            } else if(entries.count == 1){
                let entry = entries.at(0);
                return {
                    entry_id: entry.id,
                    entry_data: entry.data
                }
            } else {
                return {}
            }
        })
    }

    // ensure session is valid
    #_validate_session = async ({uuid, token} = {}) => {
        if(!uuid || !token){
            return false
        }

        let {entry_data, entry_id} = await this.#_get_session(uuid)

        if(entry_id){
            let session = entry_data
            let session_epoch_valid = session && new Date().getTime() < ( session.epoch + 24 * 60 * 60 * 1000 )
            let session_token_valid = session && session.token == token
            if(!session_epoch_valid){
                // remove session from the array
                await this.#_db.transact(db => {
                    db.table("sessions").entry(entry_id).drop().confirm()
                })
            }
            return session_token_valid && session_epoch_valid
        } else return false
    }

    // notifications queue

    // run loop to send notifications from queue
    #_queue_run = async () => {
        if(!this.#_queue_running){
            this.#_queue_running = true
            while(this.#_queue_running){
                let {entry_data, entry_id} = await this.#_db.transact(db => {
                    let table = db.table("queue")
                    if(table.entries.count > 0){
                        let entry = table.entries.at(0)
                        return {
                            entry_data: entry.data,
                            entry_id: entry.id
                        }
                    } else return {}
                })

                if(entry_id){
                    let {to_uuid, notification, subject, attempts} = entry_data
                    // let subject = "mailto:no-reply@pushybel.dev"

                    if(attempts < 3){
                        await this.#_pushybel_server.sendNotification(to_uuid, subject, notification).then( async success_status => {
                            // notification sent sucessfully
                            await this.#_db.transact(db => {
                                // copy entry to queue-sent
                                db.table("queue-sent").entry().set(entry_data)
                                // remove from the queue
                                db.table("queue").entry(entry_id).drop().confirm()
                            })
                        }).catch(async error => {
                            // this notification could not be sent
                            // increment attempts

                            await this.#_db.transact(db => {
                                db.table("queue").entry(entry_id).set({
                                    ...entry_data,
                                    attempts: attempts + 1
                                })
                            })

                        })
                    } else {
                        // max retries for this notification
                        // move to queue-failed

                        await this.#_db.transact(db => {
                            db.table("queue-failed").entry().set(entry_data)
                            db.table("queue").entry(entry_id).drop().confirm()
                        })

                    }
                    
                } else {
                    // there are no items in the queue
                    break
                }

                await new Promise(r => setTimeout(r, 500))

            }

            this.#_queue_running = false

        }
    }

    // add notification to the queue
    #_queue_notification = async (to_uuid, subject, notification) => {
        let obj = {
            to_uuid, subject, notification, attempts: 0
        }

        await this.#_db.transact(db => {
            db.table("queue").entry().set(obj)
        })

        this.#_queue_run()
        return obj
    }

    get notificationsQueue(){
        return [] // this.#_queue
    }

    // public function to queue notification
    queueNotification(to, subject, notification){

        let added = []

        to = to instanceof Array ? to : [to]

        // send notifcations to all in array
        for(let i = 0; i < to.length; i++){
            let uuid = to[i]
            let obj = this.#_queue_notification(uuid, subject, notification)
            added.push(obj)
        }

        return added

    }

}

module.exports = {
    PushybelServer
}