class PushybelClient{

    #_root = null
    #_channel = null

    constructor(force_reinstall = false){
        this.#_root = "pushybel"
        this.#_initialise(force_reinstall)

    }

    #_initialise = async (force_reinstall) => {
        if(await this.#_get_serviceworker_registration()){
            if(force_reinstall){
                await this.#_reinstall_serviceworker()
            } else await this.#_update_serviceworker()
        } else await this.#_install_serviceworker()

        navigator.serviceWorker.ready.then(() => {
            console.log("Pushybel - service worker ready")
        })

        this.#_channel = new BroadcastChannel("pushybel-notifications-worker");
        this.#_channel.addEventListener("message", (event) => {
            console.log(event.data)
        })
    }

    #_install_serviceworker = async () => {
        // install notifications service worker
        await navigator.serviceWorker.register(`/${this.#_root}/pushybel-worker.js`, { scope: "/" })
    }
    
    #_update_serviceworker = async () => {
        // update current service workers
        let reg = await this.#_get_serviceworker_registration()
        return reg && await reg.update()
    }
    
    #_uninstall_serviceworker = async () => {
        // unregister previous service worker
        let reg = await this.#_get_serviceworker_registration()
        return reg && await reg.unregister()
    }
    
    #_reinstall_serviceworker = async () => {
        // deletes and re-installs the serviceworker
        await this.#_uninstall_serviceworker()
        await this.#_install_serviceworker()
    }
    
    #_get_serviceworker_registration = async () => {
        // await navigator.serviceWorker.ready
        return await navigator.serviceWorker.getRegistration("/")
    }

    #_sha256 = async (str) => {
        const buf = new TextEncoder("utf-8").encode(str)
        const hash_buf = await crypto.subtle.digest("SHA-256", buf)
        const hash_arr = Array.from(new Uint8Array(hash_buf))
        const hex = hash_arr.map(b => ("00" + b.toString(16)).slice(-2)).join("")
        return hex
    }
    
    #_generate_auth = async (uuid, token) => {
        let salt = Math.random() * new Date().getTime()
        let hash = await this.#_sha256(uuid + ":" + token + ":" + salt)
        return {
            hash,
            salt
        }
    }

    async subscribe(){
        let permission = await window.Notification.requestPermission()

        if(permission == "granted"){

            // user authentication
            let client_uuid = window.localStorage.getItem("pushybel.client.uuid")
            let client_token = window.localStorage.getItem("pushybel.client.token")

            let user_auth = {}
            if(client_uuid && client_token){
                let auth = await this.#_generate_auth(client_uuid, client_token)
                user_auth = {
                    uuid: client_uuid,
                    auth
                }
            }

            // validate server key

            let stored_publicKey = window.localStorage.getItem("pushybel.server.publicKey")
            let server_publicKey = await http_GET(`${this.#_root}/key`)
            window.localStorage.setItem("pushybel.server.publicKey", server_publicKey)
            let update_required = stored_publicKey !== server_publicKey

            if(update_required){
                // the server key doesn't match so re-install service worker
                await this.#_reinstall_serviceworker()
            }

            let reg = await this.#_get_serviceworker_registration()

            // get current subscription if available
            let subscription = reg && await new Promise(r => {
                return reg.pushManager.getSubscription().then(subscription => {
                    return r(subscription)
                }).catch(error => {
                    console.log("Unable to fetch current subscription:", error)
                    return r(null)
                })
            })
            
            // request a new subscription if required
            if(!subscription || update_required){
                subscription = reg && await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: server_publicKey
                }).catch(error => {
                    console.log("Unable to generate subscription:", error)
                })
            }

            // send subscription to server

            if(subscription){

                try{
                    let data = await http_POST(`${this.#_root}/subscribe`, {
                        ...user_auth,
                        subscription
                    })
                    let client = JSON.parse(data)
                    window.localStorage.setItem("pushybel.client.uuid", client.uuid)
                    window.localStorage.setItem("pushybel.client.token", client.token)
                } catch(error){
                    throw new Error("Pushybel - Subscription failed.")
                }
                return "subscribed"
            } else {
                throw new Error("Pushybel - A subscription could not be generated.")
            }

        } else {
            throw new Error("Pushybel - Notification permissions were denied.")
        }

    }

}

