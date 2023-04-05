const path = require("path")
const webpush = require("web-push")
const express = require("express")

const Database = require("./database.js")

class Server{

    // private variables
    #_http_root = null

    // vapidKeys
    #_keys = null

    // events
    #_events = null

    // db
    #_db_interface = null

    constructor(app, {
        root = "/pushybel",
        encryption = {
            password: null
        }
    } = {}){

        if(!app){
            throw new Error("Pushybel - An Express app parameter is required.")
        }

        if(!encryption.password){
            throw new Error("Pushybel - You need to supply an encryption password.")
        }

        this.#_http_root = root
        this.#_events = []

        // db
        this.#_db_interface = new Database({
            namespace: "pushybel.server", 
            encryption: {
                password: encryption.password
            }
        })

        // pushybel keys
        this.#_load_keys().then(keys => {
            this.#_keys = keys
        })

        this.#_initialise_app(app)

    }

    #_initialise_app = (app) => {

        // pushybel express app hooks
        app.use(`${this.#_http_root}`, express.json())

        // to allow the service worker to run from root
        // even though it's served from /#_http_root/
        app.use((req, res, route) => {
            res.set("Service-Worker-Allowed", "/")
            route()
        })

        let module_root = path.join(path.dirname(__filename), "..")
        let scripts_dir = path.join(module_root, "scripts")
        
        // serve pushybel scripts
        app.use(`${this.#_http_root}`, express.static(scripts_dir))

        // vapid public key
        app.get(`${this.#_http_root}/public-key`, async (req, res) => {
            return res.status(200).send({
                publicKey: this.#_keys.publicKey
            })
        })

        // subscribe 
        app.post(`${this.#_http_root}/subscribe`, async (req, res) => {
            
            let {client_object, subscription} = req.body;

            if(!client_object){
                return res.status(400).json({
                    error: "A client object is required to subscribe. See documentation for more info."
                })
            }

            if(!this.#_validate_subscription(subscription)){
                return res.status(400).json({
                    error: "This subscription is invalid. Please try again."
                })
            }

            this.#_on_subscribe({client_object, subscription})
            return res.status(200).json({
                msg: "Subscription successful.",
                client_object
            })
        })

    }

    #_validate_subscription = (subscription) => {
        return subscription !== null
    }

    #_load_config = (config_key) => {
        return new Promise((r, rej) => {
            this.#_db_interface.transact(db => {
                let entries = db.table("config").where(({data}) => data.key === config_key)
                if(entries.count > 1){
                    throw new Error("Pushybel - Config - Multiple keys for input key.")
                } else if(entries.count == 1){
                    let entry = entries.at(0)
                    let data = entry.data;
                    let value = data.value
                    if(data.encrypt){
                        value = db.decrypt(value)
                    }
                    return JSON.parse(value)
                } else  {
                    return null
                }
            }).then(output => r(output)).catch(rej)
        })
    }

    #_store_config = (config_key, config_value, encrypt = false) => {
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

                config_value = JSON.stringify(config_value)

                if(encrypt){
                    config_value = db.encrypt(config_value)
                }
    
                entry.set({
                    key: config_key,
                    value: config_value,
                    encrypt
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
                    this.#_store_config("vapidKeys", keys, true).then(() => {
                        // keys stored sucessfully
                        r(keys)
                    }).catch(rej)
                } else r(keys)
            }).catch(rej)
        })
    }

    #_get_listeners = (event) => {
        return this.#_events.filter((listener) => listener.event === event)
    }

    #_on_subscribe = (event) => {
        let listeners = this.#_get_listeners("subscribe")
        for(let i = 0; i < listeners.length; i++){
            listeners[i].fn(event)
        }
    }

    // on(event: String, fn: Function)
    // event - event to listen for ["subscribe"]
    // fn receives event.{client, subscription}
    // returns PushybelServer (this)
    on(event, fn){
        if(!event || !(["subscribe"].indexOf(event) > -1) ){
            throw new Error("Pushybel - on(event, fn) - event is not a valid event.")
        }
        if(!fn instanceof Function){
            throw new Error("Pushybel - on(event, fn) - fn is not a Function.")
        }

        this.#_events.push({event, fn})

        return this
    }

    // public access to vapidKeys
    get keys(){
        return {
            publicKey: this.#_keys.publicKey, 
            privateKey: this.#_keys.privateKey
        }
    }
}

module.exports = Server