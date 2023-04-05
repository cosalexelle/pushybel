// mission-control

const express = require("express")
const path = require("path")
const crypto = require("crypto")
const PushybelServer = require("./pushybel-server.js")
const Database = require("./database.js")
const UserManager = require("./user-manager.js")

class MissionControl{
    #_http_root = null

    #_db = null

    #_pushybel_server = null

    #_user_manager = null

    constructor(pushybel_server, app, {
        root = "/pushybel/mission-control",
        encryption = {
            password: null
        },
        superuser = {
            user: null,
            password: null
        }
    } = {}){

        // initialise Pushybel.Server
        if(!pushybel_server instanceof PushybelServer){
            throw new Error("Not a Pushybel.Server instance.")
        }
        this.#_pushybel_server = pushybel_server

        // initialise database
        if(!encryption.password){
            throw new Error("Mission Control requires an encryption password. See documentation for info.")
        }

        // user account control
        this.#_user_manager = new UserManager({
            namespace: "pushybel-mission-control",
            encryption: {
                password: encryption.password
            }
        })

        if(superuser && superuser.user && superuser.password){
            this.#_user_manager.addUser({user: superuser.user, password: superuser.password})
        }

        this.#_db = new Database({
            namespace: "pushybel.mission-control",
            encryption_password: encryption.password
        })

        this.#_http_root = root

        this.#_initialise_app(app)
    }

    #_initialise_app = async (app) => {

        let module_root = path.join(path.dirname(__filename), "..")
        let mission_control_dir = path.join(module_root, "mission-control")

        app.use(`${this.#_http_root}`, express.static(mission_control_dir))

        app.post(`${this.#_http_root}/login`, async (req, res) => {

            let {user, password} = req.body

            let session = await this.#_user_manager.login({user, password})

            if(!session){
                return res.status(403).json({
                    error: "Incorrect username or password."
                })
            }

            return res.status(200).json({...session})

        })

        app.post(`${this.#_http_root}/logout`, async (req, res) => {

            let {auth} = req.body
            let {user, token, epoch} = auth

            let valid_session = await this.#_user_manager.verifySession({user, token, epoch})

            if(valid_session){
                this.#_user_manager.deleteSession({user, token, epoch})
            }

            return res.status(200).json({...session})

        })

        app.use(`${this.#_http_root}/api/:api`, async (req, res, route) => {
            let {auth} = req.body
            let {user, token, epoch} = auth

            let valid_session = await this.#_user_manager.verifySession({user, token, epoch})

            if(!valid_session){
                return res.status(403).json({
                    error: "Your session is invalid. Please re-login."
                })
            } else route()
        })

        app.post(`${this.#_http_root}/api/push`, async (req, res) => {

            let {to, subject, notification} = req.body
            if(!to || !subject || !notification){
                return res.status(400).json({
                    error: "This request is invalid."
                })
            }
            let added = this.queueNotification(to, subject, notification)
            return res.status(200).json({
                msg: "Notifications queued sucessfully.",
                added
            })

        })

        app.post(`${this.#_http_root}/api/status`, async (req, res) => {

            return res.status(200).json({
                status: {}
            })

        })

    }

    sendNotification(subscription = null, subject = null, notification = null){

        return new Promise((r, rej) => {

            if(!subscription){
                rej("invalid-subscription") 
            }
            if(!subject){
                rej("invalid-subject")
            }
            if(!notification){
                rej("invalid-notification")
            }
            
            const options = {
                vapidDetails: {
                    subject, 
                    ...this.#_pushybel_server.keys
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
        })
        
    }

    async addUser({user, password} = {}){
        return new Promise( async (r, rej) => {
            await this.#_user_manager.addUser({user, password}).then(res => {
                (res && r(res)) || rej(res)
            })
        })
    }

    async listUsers(){
        return await this.#_user_manager.listUsers()
    }

    async deleteUser({user} = {}){
        return new Promise( async (r, rej) => {
            await this.#_user_manager.deleteUser({user}).then(res => {
                (res && r(res)) || rej(res)
            })
        })
    }

}

module.exports = MissionControl