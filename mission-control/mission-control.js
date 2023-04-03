class MissionControlClient{

    #_session_uuid = null
    #_session_token = null

    isLoggedIn = false

    constructor(){

        

    }

    #_validate_session = async (session) => {
        try {
            return await http_POST("ping", {
                session
            })
        } catch(error){
            return false
        }
    }

    #_get_local = (key, namespace = "pushybel.mission-control") => {
        return window.localStorage.getItem(`${namespace}.${key}`)
    }
    #_set_local = (key, value, namespace = "pushybel.mission-control") => {
        return window.localStorage.setItem(`${namespace}.${key}`, value)
    }
    #_remove_local = (key, namespace = "pushybel.mission-control") => {
        return window.localStorage.removeItem(`${namespace}.${key}`)
    }

    #_restore_session = async () => {

        // see if session token is available

        let uuid = this.#_get_local("session_uuid")
        let token = this.#_get_local("session_token")

        if(uuid && token){
            // check token is valid
            let valid = await this.#_validate_session({uuid, token})
            if(valid){
                console.log("Pushybel - Mission Control - Restoring session ... ")
                console.log("Pushybel - Mission Control - Session:", uuid)
                this.#_session_uuid = uuid
                this.#_session_token = token
                this.isLoggedIn = true
            } else {
                console.log("Pushybel - Mission Control - Local session is invalid ... ")
                console.log("Pushybel - Mission Control - Deleting session ... ")
                console.log("Pushybel - Mission Control - Login is required ... ")
                this.#_remove_local("session_uuid")
                this.#_remove_local("session_token")
                this.isLoggedIn = false
            }

        } else {
            console.log("Pushybel - Mission Control - No session to restore ... ")
            console.log("Pushybel - Mission Control - Login is required ... ")
            this.isLoggedIn = false
        }

    }

    #_new_session = async (user, password) => {

        try {
            let data = await http_POST("login", {user, password})

            let {uuid, token} = JSON.parse(data)

            this.#_session_uuid = uuid
            this.#_session_token = token

            this.#_set_local("session_uuid", uuid)
            this.#_set_local("session_token", token)

            console.log("Pushybel - Mission Control - Login successful ... ")

            this.isLoggedIn = true

            return uuid

        } catch(error){
            console.log("Pushybel - Mission Control - Login failure ... ")
            this.isLoggedIn = false
            return false
        }

    }

    async login(user, password){

        await this.#_restore_session()

        if(!this.isLoggedIn && user && password){
            await this.#_new_session(user, password)
        }

        return this.isLoggedIn
        
    }

    #_api = (api, data) => new Promise((r, rej) => {
        if(!this.isLoggedIn){
            return rej(new Error("Pushybel - Mission Control - You are not logged in."))
        }

        http_POST("api/" + api, {
            session: {
                uuid: this.#_session_uuid,
                token: this.#_session_token
            },
            ...data
        }).then((res, status) => {
            let output = res.length > 0 ? JSON.parse(res) : null
            r(output)
        }).catch(error => {
            rej(error)
        })

    })

    async sendNotification(to, subject, notification) {
        return new Promise((r, rej) => {
            this.#_api("push", {to, subject, notification}).then(r).catch(rej)
        })
    }

    async getClients(){
        return new Promise((r, rej) => {
            this.#_api("clients").then(r).catch(rej)
        })
    }

    async getNotificationSchedule(){
        return new Promise((r, rej) => {
            this.#_api("notification-queue").then(r).catch(rej)
        })
    }
}