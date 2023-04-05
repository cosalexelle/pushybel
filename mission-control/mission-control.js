class MissionControlClient{

    #_api_auth = null
    isLoggedIn = false

    constructor(){

        

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

    #_validate_stored_token = async () => {

        // see if session token is available

        let auth = JSON.parse(this.#_get_local("api_auth"))

        if(auth && auth.user && auth.token && auth.epoch){
            // check token is valid
            let valid = null;
            try {
                valid = await http_POST("api/status", {auth})
            } catch(error){
                valid = false
            }

            if(valid){
                this.#_api_auth = auth
                this.isLoggedIn = true
            } else {
                this.#_remove_local("api_auth")
                this.isLoggedIn = false
            }

        } else {
            this.isLoggedIn = false
        }

    }

    #_request_token = async (user, password) => {
        try {
            let str = await http_POST("login", {user, password})

            let obj = JSON.parse(str)

            this.#_set_local("api_auth", JSON.stringify(obj))

            this.isLoggedIn = true

            return obj

        } catch(error){
            this.isLoggedIn = false
            return false
        }

    }

    async login(user, password){

        await this.#_validate_stored_token()

        if(!this.isLoggedIn && user && password){
            await this.#_request_token(user, password)
        }

        return this.isLoggedIn
        
    }

    #_api = (api, data) => new Promise((r, rej) => {
        if(!this.isLoggedIn){
            return rej(new Error("Pushybel - Mission Control - You are not logged in."))
        }

        http_POST("api/" + api, {
            auth: this.#_api_auth,
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

}