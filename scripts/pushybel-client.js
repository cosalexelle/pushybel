class PushybelClient{

    #_root = null

    constructor({
        root = "/pushybel" 
    } = {}){
        this.#_root = root
        this.#_initialise()
    }

    #_initialise = async () => {

        if(!this.browserSupported){
            console.log("Pushybel is not supported by this browser.")
            return false
        }

        if(await this.#_get_serviceworker_registration()){
            await this.#_update_serviceworker()
        } else await this.#_install_serviceworker()

        navigator.serviceWorker.ready.then(() => {
            console.log("Pushybel - service worker ready")
        })

    }

    #_install_serviceworker = async () => {
        // install notifications service worker
        await navigator.serviceWorker.register(`${this.#_root}/pushybel-worker.js`, { scope: "/" })
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

    get browserSupported(){
        return window.localStorage && 
        navigator.serviceWorker && 
        window.PushManager && 
        window.Notification && 
        window.BroadcastChannel
    }

    subscribe(client_object){
        return new Promise(async (r, rej) => {

            if(!this.browserSupported){
                rej(new Error("Cannot subscribe to pushybel as this browser does not meet pushybel requirements."))
            }

            if(!client_object){
                rej(new Error("The client_object paramater is required. See documentation for more info."))
            }

            let permission = await window.Notification.requestPermission()

            if(permission == "granted"){

                // validate server key
                http_GET(`${this.#_root}/public-key`).then(async data => {
                    let obj = JSON.parse(data)
                    let server_publicKey = obj.publicKey
                    let stored_publicKey = window.localStorage.getItem("pushybel.server.publicKey")

                    if(stored_publicKey && stored_publicKey !== server_publicKey){
                        // the server key doesn't match so re-install service worker
                        await this.#_reinstall_serviceworker()
                    }

                    this.#_get_serviceworker_registration().then(reg => {
                        reg.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: server_publicKey
                        }).then(subscription => {
                            http_POST(`${this.#_root}/subscribe`, {
                                subscription,
                                client_object
                            }).then(r).catch(error => rej(new Error("Pushybel was not able to process this subscription.")))
                        }).catch(error => rej(new Error("Unable to generate a subscription.")))
                    }).catch(error => rej(new Error("Unable to get service woker registration.")))
                }).catch(error => rej(new Error("Unable to fetch public key.")))
            } else {
                // notification permissions were denied.
                rej(new Error("Pushybel - Notification permissions were denied."))
            }
        })
    }
}