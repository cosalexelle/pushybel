class Modal{

    #_root = null

    constructor(input_el){

        if(typeof input_el === "string"){
            let el = document.querySelector(input_el)
            if(el){
                this.#_initialise_from_element(el)
            } else {
                this.#_create_modal(input_el)
            }
        } else if(input_el instanceof HTMLElement){
            this.#_initialise_from_element(input_el)
        } else throw new Error("Modal - Modal() requires either an ID (string) or a HTMLElement")
    }

    #_validate_element = (el) => {
        return [...el.classList].indexOf("modal") > -1
    }

    #_initialise_from_element = (el) => {
        if(!this.#_validate_element(el)){
            throw new Error("Modal - This is not a valid modal element")
        }

        if(!document.body.contains(el)){
            // this element does not exist in the DOM
            document.body.appendChild(el)
        }

        this.#_root = el
    }

    #_create_modal = (id) => {
        let el = document.createElement("div")
        el.id = id
        el.classList.add("modal")

        let title_el = document.createElement("div")
        title_el.classList.add("title")
        el.appendChild(title_el)

        let content_el = document.createElement("div")
        content_el.classList.add("content")
        el.appendChild(content_el)

        let buttons_el = document.createElement("div")
        buttons_el.classList.add("buttons")
        el.appendChild(buttons_el)

        this.#_initialise_from_element(el)
    }

    #_get_element = (q) => {
        let els = this.#_root.querySelectorAll(q)
        return els.length == 1 && els[0]
    }

    #_set_button = (btn_el, title, action) => {
        let label_el = btn_el.querySelector("div.label")
        label_el.innerHTML = title;
        btn_el.onclick = () => {action && action()}
    }

    #_pause = (i = 1) => new Promise(r => setTimeout(r, i * 1000))

    #_show_modal = async (fadeIn) => {
        
        this.#_root.classList.add("fadeIn")
        this.#_root.classList.add("active")

        let post_fadein = () => {
            this.#_root.classList.remove("fadeIn")
            this.#_root.removeEventListener("animationend", post_fadein)
        }
        this.#_root.addEventListener("animationend", post_fadein)

    }

    #_hide_modal = async (fadeOut) => {

        this.#_root.classList.add("fadeOut")

        let post_fadeout = () => {

            this.#_root.classList.remove("active")
            this.#_root.classList.remove("fadeOut")
            
            this.#_root.removeEventListener("animationend", post_fadeout)
        }
        this.#_root.addEventListener("animationend", post_fadeout)

    }

    // Set modal contents

    setTitle(str){
        this.title.innerHTML = str
    }

    setContent(input_el){
        if(input_el instanceof HTMLElement){
            this.content.appendChild(input_el)
        } else if(typeof input_el == "string"){
            this.content.innerHTML = input_el
        }
    }

    setPrimaryButton(title, action){
        this.#_set_button(this.primaryButton, title, action)
    }
    
    setSecondaryButton(title, action){
        this.#_set_button(this.secondaryButton, title, action)
    }

    // Get modal contents

    get title(){
        return this.#_get_element("div.title")
    }
    get content(){
        return this.#_get_element("div.content")
    }

    get secondaryButton(){
        return this.#_get_element("div.buttons > div.button.secondary")
    }

    get primaryButton(){
        return this.#_get_element("div.buttons > div.button.primary")
    }

    get inputs(){
        return [...this.#_root.querySelectorAll("input")]
    }

    get buttons(){
        return [...this.#_root.querySelectorAll("div.button")]
    }

    show({fadeIn = true} = {}){
        this.#_show_modal(fadeIn)
    }

    hide(){
        this.#_hide_modal()
    }
    
}