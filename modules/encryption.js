const crypto = require("crypto");

class Encrypter {
    #_key = null
    #_algo = null
    constructor(secret_key, salt) {
        this.#_algo = "aes-256-cbc";
        this.#_key = crypto.scryptSync(secret_key, salt, 32)
    }
    
    encrypt(str) {
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv(this.#_algo, this.#_key, iv)
        const encrypted = cipher.update(str, "utf8", "hex")
        return [
            encrypted + cipher.final("hex"),
            Buffer.from(iv).toString("hex"),
        ].join("|");
    }

    decrypt(encrypted_str) {
        const [encrypted, iv] = encrypted_str.split("|")
        if(!iv){
            throw new Error("An iv is required.")
        }
        const decipher = crypto.createDecipheriv(
            this.#_algo,
            this.#_key,
            Buffer.from(iv, "hex")
        )
        return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
    }
}

module.exports = Encrypter