"use strict";
class MopidyClient {
    constructor(url) {
        this.pendingRequests = new Map();
        this.currentId = 0;
        this.handlers = new Map();
        this.createSocket(url, 5000);
    }
    createSocket(url, reconnectInterval) {
        this.socket = new WebSocket(url);
        this.socket.onopen = () => {
            this.emit('socket:connect');
            this.call('core.describe')
                .then((api) => {
                Object.assign(this, exports.createApiObject(api, this.call));
                this.emit('state:online');
            });
        };
        this.socket.onmessage = event => {
            var data = JSON.parse(event.data);
            if (isRpcResponse(data)) {
                var handler = this.pendingRequests.get(data.id);
                if (!handler)
                    return;
                handler.resolve(data.result);
                this.pendingRequests.delete(data.id);
            }
            else if (isRpcEvent(data)) {
                var type = data.event;
                delete data.event;
                this.emit('event:' + snakeToCamel(type), data);
            }
            else {
                console.warn('Unknown message type received');
                console.info(data);
            }
        };
        this.socket.onerror = error => this.emit('socket:error', error);
        this.socket.onclose = () => setTimeout(() => this.createSocket(url, reconnectInterval), reconnectInterval);
    }
    getNextId() {
        return this.currentId++;
    }
    call(method, params) {
        return new Promise((resolve, reject) => {
            if (this.socket.readyState !== WebSocket.OPEN) {
                reject('Socket is not connected');
                return;
            }
            var id = this.getNextId();
            this.pendingRequests.set(id, { resolve, reject });
            this.sendRequest(params ? { jsonrpc: '2.0', method, id, params } : { jsonrpc: '2.0', method, id });
        });
    }
    sendRequest(request) {
        this.socket.send(JSON.stringify(request));
    }
    emit(event, message) {
        for (var handler of this.handlers.get(event) || []) {
            handler(message);
        }
    }
    on(event, handler) {
        var existing = this.handlers.get(event);
        if (existing) {
            existing.push(handler);
        }
        else {
            this.handlers.set(event, [handler]);
        }
    }
    off(event, handler) {
        if (!event) {
            this.handlers.clear();
            return;
        }
        if (this.handlers.has(event)) {
            var handlers = this.handlers.get(event);
            if (handlers) {
                var newHandlers = handler ? handlers.filter(h => h !== handler) : [];
                this.handlers.set(event, newHandlers);
            }
        }
    }
    close() {
        this.socket.close();
        this.pendingRequests.forEach(f => f.reject('Socket has been closed'));
        this.pendingRequests.clear();
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MopidyClient;
function isRpcResponse(arg) {
    return arg.id !== undefined;
}
function isRpcEvent(arg) {
    return arg.event !== undefined;
}
var snakeToCamel = (name) => name.replace(/(_[a-z])/g, match => match.toUpperCase().replace("_", ""));
function isKwargsArgument(arg) {
    return arg.kwargs === true;
}
exports.createApiObject = (api, call) => {
    var root = {};
    var getPath = (fullName) => {
        var path = fullName.split(".");
        if (path.length >= 1 && path[0] === "core") {
            path = path.slice(1);
        }
        return path;
    };
    var initaliseObjectPath = (objPath) => {
        var parent = root;
        for (var objName of objPath) {
            objName = snakeToCamel(objName);
            parent[objName] = parent[objName] || {};
            parent = parent[objName];
        }
        return parent;
    };
    for (let fullMethodName of Object.keys(api)) {
        let method = api[fullMethodName];
        let methodPath = getPath(fullMethodName);
        let methodName = snakeToCamel(methodPath.slice(-1)[0]);
        let objectPathEnd = initaliseObjectPath(methodPath.slice(0, -1));
        if (method.params && method.params.length > 0) {
            objectPathEnd[methodName] = (...args) => {
                var params = {};
                var i = 0;
                for (var param of method.params) {
                    if (!isKwargsArgument(param)) {
                        params[param.name] = args[i];
                    }
                }
                return call(fullMethodName, params);
            };
        }
        else {
            objectPathEnd[methodName] = () => call(fullMethodName);
        }
    }
    return root;
};
