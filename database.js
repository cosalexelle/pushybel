// a JSON database

const path = require("path")
const fs = require("fs")
const crypto = require("crypto")

// .data/db-{namespace}/{table_name}/{entry_id}.json
// entry xxx-xxx-xxx-xxx.json
// {
//     key: value,
//     key2: value2
// }

class Database{

    #_root = null

    #_transaction_queue = null

    constructor(namespace = "default", root = path.resolve(".data")){
        this.#_root = path.join(root, ".databases", `db-${namespace}`)

        if(!fs.existsSync(this.#_root)){
            fs.mkdirSync(this.#_root, {recursive: true})
        }

        this.#_transaction_queue = new TransactionQueue(this)

    }

    // public access to _root
    // prevents _root being overridden
    get root(){
        return this.#_root
    }

    // transact(transaction: Function)
    // transaction - run transaction on db
    // returns Promise resolve: transaction sucessful, reject: transaction error
    transact(transaction){
        return this.#_transaction_queue.add(transaction)
    }

    // table(table_name: String)
    // table_name - the name of the table to load
    // return Table
    table(table_name){
        if(!table_name){
            throw new Error("Database - table() - Missing table_name parameter.")
        }
        return new Table(this, table_name)
    }

}

class Table{
    #_db = null
    #_root = null
    constructor(db, table_name){
        if(!db instanceof Database){
            throw new Error("Database - Table - () - db is not a Database instance")
        }
        if(!table_name){
            throw new Error("Database - Table - () - Missing table_name parameter.")
        }

        this.#_db = db

        this.#_root = path.join(this.#_db.root, table_name)

        try{
            if(!fs.existsSync(this.#_root)){
                fs.mkdirSync(this.#_root, {recursive: true})
            }
        } catch(error){
            throw new Error("Database - Table - () - Unable to create table.")
        }
    }

    // public access to table _root
    // prevents table _root being overridden
    get root(){
        return this.#_root
    }

    // public access
    // list all entry_ids in this table
    get entries(){
        let entries = fs.readdirSync(this.root, {withFileTypes: true})
            .filter(x => !x.isDirectory())
            .map(x => x.name.split(".json")[0])
            .map(entry_id => new Entry(this, entry_id))
        return new EntryCollection(entries)
    }

    // entry(entry_id: String)
    // entry_id - loads or creates entry with ID
    // returns Entry
    entry(entry_id){
        return new Entry(this, entry_id)
    }

    // get(where: Function, {limit: Int})
    // where - filters entries with function
    // options - filtering options
    //  - limit - returns max entries
    // return EntryCollection
    where(where = (entry) => {return entry}, {limit = null} = {}){
        return this.entries.filter(where)
    }

    // drop(null)
    // none - call confirm to delete the table
    // return DropRequest
    drop(){
        return new DropRequest(this)
    }
}

class DropRequest{
    #_item = null
    constructor(item){
        if(!item instanceof Table || !item instanceof Entry){
            throw new Error("Database - DropRequest - () - Not a valid Table or Entry instance.")
        }
        this.#_item = item
    }

    confirm(){
        try{
            fs.rmSync(this.#_item.root, {recursive: true})
            return this.#_item
        } catch(error){
            throw new Error("Database - Table - drop() - Unable to delete table.")
        }
    }

    cancel(){
        return this.#_item
    }
}

class Entry{
    #_table = null
    #_id = null
    #_root = null
    constructor(table, entry_id){
        if(!table instanceof Table){
            throw new Error("Database - Entry - () - Table is not a Table instance.")
        }

        if(entry_id){
            this.#_root = path.join(table.root, `${entry_id}.json`)
            if(!fs.existsSync(this.#_root)){
                throw new Error("Database - Entry - () - This entry does not exist.")
            }
        } else {
            // No entry_id was supplied
            // creating an entry ...
            entry_id = crypto.randomUUID()
            this.#_root = path.join(table.root, `${entry_id}.json`)
            if(!fs.existsSync(this.#_root)){
                this.#_write()
            }
        }

        this.#_table = table
        this.#_id = entry_id

    }

    #_write = (obj = {}) => {
        try {
            fs.writeFileSync(this.#_root, JSON.stringify(obj, null, 2))
        } catch(error){
            throw new Error("Database - Entry - set() - Unable to write to Entry file.")
        }
    }

    // public access to _root
    // prevents _root being overridden
    get root(){
        return this.#_root
    }
    // public access to _id
    // prevents _id being overridden
    get id(){
        return this.#_id
    }

    // data
    // none - this function reads the entry from the disk
    // returns Object
    get data(){
        try{
            return JSON.parse(fs.readFileSync(this.#_root))
        } catch(error) {
            throw new Error("Database - Entry - Entry.data - Unable to read from file.")
        }
    }

    // set(data: Object, options: Object)
    // data - an object with key/values to store
    // options - 
    //  - overwrite: false (default) - merge data, true - removes all keys and inputs new data
    set(data, {overwrite = false} = {}){

        if(!data instanceof Object){
            new Error("Database - Entry - set() - data paramter is not Obejct instance.")
        }

        let obj = overwrite ? data : {
            ...this.data,
            ...data
        }

        this.#_write(obj)

        return this

    }

    // drop(null)
    // none - call confirm to delete the entry
    // return DropRequest
    drop(){
        return new DropRequest(this)
    }

    get table(){
        return this.#_table
    }
}

class EntryCollection{

    #_items = []

    constructor(entries){

        if(!entries instanceof Array){
            throw new Error("Database - EntryCollection - () - Not an array.")
        }

        // remove non valid entries
        this.#_items = entries.filter(x => x instanceof Entry)

    }

    // public access entries collection
    // prevents entries being overridden
    get items(){
        return this.#_items
    }

    // public access to array
    // of all entries' data
    get data(){
        return this.#_items.map(entry => entry.data)
    }

    // filter(where: Function)
    // where - filters entries with function
    // return EntryCollection
    filter(where){
        if(!where instanceof Function){
            throw new Error("Database - EntryCollection - filter() - where parameter is not a valid Function.")
        }
        this.#_items = this.#_items.filter(where)
        return this
    }

    // each(fn: Function)
    // fn - functon to run with each Entry
    // return EntryCollection
    each(fn){
        if(!fn instanceof Function){
            throw new Error("Database - EntryCollection - each() - parameter is not a valid Function.")
        }

        for(let i = 0; i < this.#_items.length; i++){
            fn && fn(this.#_items[i], i)
        }

        return this
    }

    // at(i: int)
    // i - index
    // return Entry
    at(i){
        if(! (i >= 0 && i < this.#_items.length)){
            throw new Error("Database - EntryCollection - at() - index is invalid.")
        }
        return this.#_items[i]
    }

    // public access to items.length
    get count(){
        return this.#_items.length
    }

}

class TransactionQueue{
    #_db = null
    #_queue = null
    #_queue_running
    constructor(db){

        if(!db instanceof Database){
            throw new Error("Database - TransactionQueue - Not a Database instance.")
        }

        this.#_db = db

        this.#_queue = []

        this.#_queue_running = false
        
    }


    // add(transaction: Function)
    // transaction - function with db as parameter
    add(transaction){
        if(!transaction instanceof Function){
            throw new Error("Database - TransactionQueue - add() - Transaction parameter is not a Function instance.")
        }

        return new Promise((r, rej) => {

            this.#_queue.push({
                transaction,
                r,
                rej
            })

            this.run()

        })
    }

    run(){
        if(!this.#_queue_running){
            this.#_queue_running = true
            while(1){
                if(!(this.#_queue.length > 0)){
                    break
                }

                let {transaction, r, rej} = this.#_queue[0]

                try{
                    let res = transaction(this.#_db)
                    r(res)
                } catch(error){
                    rej(error)
                }

                this.#_queue = this.#_queue.slice(1)
            }
            this.#_queue_running = false
        } 
    }

    get queue(){
        return this.#_queue
    }

    get isRunning(){
        return this.#_queue_running
    }
}

module.exports = {
    Database
}