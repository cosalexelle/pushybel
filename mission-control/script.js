// main

console.log("/--/ pushybel mission-control /--/")

let mission_control = new MissionControlClient()

let pushNotifications = async () => new Promise((r, rej) => {
    mission_control.getClients().then(clients => {
        mission_control.sendNotification(clients, "mailto:no-reply@pushybel.dev", {
            title: "hello from pushhybel mission-control!",
            body: "this is a demo notification"
        }).then(r).catch(rej)
    }).catch(rej)
})

let login = (user, password) => new Promise(async (r, rej) => {
    let res = await mission_control.login(user, password)
    mission_control.isLoggedIn ? r(res) : rej(res)
})


let request_login = () => new Promise((r, rej) => {

    let modal_el = document.querySelector("div.modal#login")

    let modal = new Modal(modal_el)

    let user_el = modal.inputs.filter(x => x.id == "user")[0]
    let password_el = modal.inputs.filter(x => x.id == "password")[0]

    let validate_inputs = () => {
        let [user, password] = [user_el, password_el].map(x => x.value)
        if(user.length > 0 && password.length > 0){
            modal.primaryButton.classList.remove("disabled")
        } else {
            modal.primaryButton.classList.add("disabled")
        }
    }

    let try_login = async () => {
        let [user, password] = [user_el, password_el].map(x => x.value)
        login(user, password).then(async (res) => {
            // login sucessful
            modal.hide()
            setTimeout(() => r(), 1000)
        }).catch(error => {
            // login error
            modal_el.classList.add("error")
            password_el.value = ""
            modal.primaryButton.classList.add("disabled")
            let post_animation = () => {
                modal_el.classList.remove("error")
                modal_el.removeEventListener("animationend", post_animation)
            }
            modal_el.addEventListener("animationend", post_animation)
        })
    }

    user_el.addEventListener("keyup", validate_inputs)
    password_el.addEventListener("keyup", validate_inputs)
    modal.primaryButton.addEventListener("click", try_login)

    modal.show()

})

let post_login = () => {
    // User is logged in
    // to send test notifications to all
    // subscribed clients, run
    pushNotifications()
}

let load = (async () => {

    login().then(post_login).catch(() => {
        request_login().then(post_login).catch(() => {
            // login rejected by user
        })
    })

})

load()