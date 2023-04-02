let _HTTP = (url, method, data = {}, fn, fn_err) => {
    let x = new XMLHttpRequest();
    x.open(method, url);
    x.onload = () => [200, 201].indexOf(x.status) > -1 ? (fn && fn(x.response, x.status)) : (fn_err && fn_err(x.status))
    x.onerror = () => fn_err && fn_err(x.status)

    if(method == "POST"){
        x.setRequestHeader("Content-type", "application/json")
    }
    
    x.send(JSON.stringify(data))
}

let http_GET = (url) => 
    new Promise((r, rej) => _HTTP(url, "GET", null, r, rej))

let http_POST = (url, data) => 
    new Promise((r, rej) => _HTTP(url, "POST", data, r, rej))