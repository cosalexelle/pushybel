const Database = require("./database.js")
const crypto = require("crypto")

class UserManager{

    #_db = null

    constructor({
        namespace = null, // pushybel.mission-control
        encryption = {
            password: null
        }
    } = {}){

        if(!namespace){
            throw new Error("You must specify a namespace.")
        }

        if(!encryption.password){
            throw new Error("You must specify a password to use encryption.")
        }

        this.#_db = new Database({
            namespace: `um-${namespace}`,
            encryption:{
                password: encryption.password
            } 
        })

    }

    #_generate_password_hash = (user, password, salt = crypto.randomBytes(16)) => {
        let hash = crypto.scryptSync(`${user}:${password}`, salt, 64);
        return {salt: salt.toString("hex"), hash: hash.toString("hex")}
    }

    #_user_exists = async (user) => {
        return await this.#_db.transact(db => {
            return db.table("users").where(({data}) => data.user === user).count > 0
        })
    }
    #_session_exists = async (user, token, epoch) => {
        return await this.#_db.transact(db => {
            return db.table("sessions").where(({data}) => data.user === user && db.decrypt(data.token) === token && data.epoch === epoch).count > 0
        })
    }

    #_create_user = async (user, password) => {

        if(await this.#_user_exists(user)){
            // throw new Error("This user already exists.")
            return false
        }

        let {salt, hash} = this.#_generate_password_hash(user, password)
        return await this.#_db.transact(db => {
            db.table("users").entry().set({
                user, salt: db.encrypt(salt), hash: db.encrypt(hash)
            })
            return "user-added"
        })
    }
    #_update_user = async (user, password) => {
        let {salt, hash} = this.#_generate_password_hash(user, password)
        await this.#_db.transact(db => {
            db.table("users").where(({data}) => data.user === user).at(0).set({
                salt, hash
            })
        })
    }
    #_delete_user = async (user) => {
        if(!await this.#_user_exists(user)){
            return false
        }

        return await this.#_db.transact(db => {
            db.table("users").where(({data}) => data.user === user).at(0).drop().confirm()
            db.table("sessions").where(({data}) => data.user === user).each(entry => {
                return entry.drop().confirm()
            })
            return "user-delete"
        })
    }
    #_load_user = async (user) => {

        return await this.#_db.transact(db => {
            let entries = db.table("users").where(({data}) => data.user === user)
            if(entries.count === 1){
                let data = entries.at(0).data;
                return {
                    ...data,
                    hash: db.decrypt(data.hash),
                    salt: db.decrypt(data.salt)
                }
            } else return null
            
        })
    }

    #_create_session = async (user) => {

        let token = null
        let epoch = null
        while(1){
            token = crypto.randomBytes(16).toString("hex"),
            epoch = new Date().getTime()
            if(!await this.#_session_exists(user, token, epoch)){
                break
            }
        }

        return await this.#_db.transact(db => {
            db.table("sessions").entry().set({
                user,
                token: db.encrypt(token),
                epoch: epoch
            })
            return {user, token, epoch}
        })  
    }

    async addUser({user = null, password = null} = {}){

        if(!user || !password){
            // throw new Error("User and password are required.")
            return false
        }

        return await this.#_create_user(user, password)

    }

    async deleteUser({user = null}){
        if(!user){
            // throw new Error("User and password are required.")
            return false
        }

        return await this.#_delete_user(user)
    }

    #_validate_login = async (user, password) => {

        let user_data = await this.#_load_user(user)

        if(user_data){
            let {hash, salt} = user_data
            let login_auth = this.#_generate_password_hash(user, password, Buffer.from(salt, "hex"));
            return login_auth.hash === hash
        } else return false

    }

    #_validate_session = async (user, token, epoch) => {
        let session_expired = new Date().getTime() - epoch > 24 * 60 * 60 * 1000
        return !session_expired && await this.#_session_exists(user, token, epoch)
    }

    #_delete_session = async (async, token, epoch) => {

        if(!await this.#_session_exists(user, token, epoch)){
            return false
        }

        return await this.#_db.transact(db => {
            return db.table("sessions").where(({data}) => {
                return data.user === user && 
                db.decrypt(data.token) === token && 
                data.epoch === epoch
            }).at(0).drop().confirm()
        })
    }

    async login({user = null, password = null} = {}){
        
        if(!user || !password){
            // throw new Error("User and password are required.")
            return false
        }

        if(await this.#_validate_login(user, password)){
            return await this.#_create_session(user)
        } else return false
    }

    async verifySession({user = null, token = null, epoch = null} = {}){

        if(!user || !token || !epoch){
            // throw new Error("User and a valid session object are required.")
            return false
        }

        return this.#_validate_session(user, token, epoch)

    }

    async deleteSession({user = null, token = null, epoch = null} = {}){
        if(!user || !token || !epoch){
            // throw new Error("User and a valid session object are required.")
            return false
        }
        return this.#_delete_session(user, token, epoch)
    }

    listUsers(){
        return new Promise(async (r, rej) => {
            await this.#_db.transact(db => {
                r(db.table("users").entries.data.map(({user}) => user)) 
            })
        })
    }

}

module.exports = UserManager