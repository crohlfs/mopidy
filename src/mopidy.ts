export default class MopidyClient {
  socket: WebSocket;
  pendingRequests = new Map<number, {resolve: (value?: any) => void, reject: (reason?: any) => void}>();
  currentId = 0;
  handlers = new Map<string, Function[]>();

  constructor(url: string) {
    this.createSocket(url, 5000);
  }

  private createSocket(url: string, reconnectInterval: number) {
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.emit('socket:connect');

      this.call('core.describe')
        .then((api: ApiDescription) => {
          Object.assign(this, createApiObject(api, (method, params) => this.call(method, params)));
          this.emit('state:online');
        });
    };

    this.socket.onmessage = event => {
      var data = JSON.parse(event.data);

      if (isRpcResponse(data)) {
        var handler = this.pendingRequests.get(data.id);

        if (!handler) return;

        handler.resolve(data.result);

        this.pendingRequests.delete(data.id);
      } else if (isRpcEvent(data)) {
        var type = data.event;
        delete data.event;

        this.emit('event:' + snakeToCamel(type), data);
      } else {
        console.warn('Unknown message type received');
        console.info(data);
      }
    };

    this.socket.onerror = error => this.emit('socket:error', error);

    this.socket.onclose = () => setTimeout(() => this.createSocket(url, reconnectInterval), reconnectInterval);
  }
  
  private getNextId(): number {
    return this.currentId++;
  }

  private call(method: string, params?: any) {
    return new Promise((resolve, reject) => {
      if (this.socket.readyState !== WebSocket.OPEN) {
        reject('Socket is not connected');
        return;
      }

      var id = this.getNextId();

      this.pendingRequests.set(id, {resolve, reject});
      this.sendRequest(params ? { jsonrpc: '2.0', method, id, params } : { jsonrpc: '2.0', method, id });
    });
  }

  private sendRequest(request: JsonRpcRequest) {
    this.socket.send(JSON.stringify(request));
  }

  emit(event: string, message?: any) {
    for (var handler of this.handlers.get(event) || []) {
      handler(message);
    }
  }

  on(event: string, handler: Function) {
    var existing = this.handlers.get(event);

    if (existing) {
      existing.push(handler);
    } else {
      this.handlers.set(event, [handler]);
    }
  }

  off(event?: string, handler?: Function) {
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

interface JsonRpcRequest {
  jsonrpc: '2.0',
  id: number,
  method: string,
  params?: any
}

interface JsonRpcResponse {
  jsonrpc: '2.0',
  id: number,
  method: string,
  result: any
}

function isRpcResponse(arg: any): arg is JsonRpcResponse {
  return arg.id !== undefined;
}

interface JsonRpcEvent {
  jsonrpc: '2.0',
  event: string
}

function isRpcEvent(arg: any): arg is JsonRpcEvent {
  return arg.event !== undefined;
}

var snakeToCamel = (name: string) => name.replace(/(_[a-z])/g, match => match.toUpperCase().replace("_", ""));

type ApiDescription = {[fullMethodName: string]: MethodDescription};

interface MethodDescription {
  description: string,
  params: (ParameterDescription | KwargsParameterDescription)[]
}

interface ParameterDescription {
  default: any,
  name: string
}

function isKwargsArgument(arg: any): arg is KwargsParameterDescription {
  return arg.kwargs === true;
}

interface KwargsParameterDescription {
  kwargs: true
}

export var createApiObject = (api: ApiDescription, call: (method: string, params?: any) => any): any => {
  var root = {};

  var getPath = (fullName: string) => {
    var path = fullName.split(".");
    
    if (path.length >= 1 && path[0] === "core") {
      path = path.slice(1);
    }

    return path;
  };

  var initaliseObjectPath = (objPath: string[]) => {
    var parent = root as any;

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
      objectPathEnd[methodName] = (...args: any[]) => {
        var params = {} as any;

        var i = 0;
        for (var param of method.params) {
          if (!isKwargsArgument(param)) {
            params[param.name] = args[i++]; 
          }
        }

        return call(fullMethodName, params);
      }
    } else {
      objectPathEnd[methodName] = () => call(fullMethodName);
    }
  }

  return root;
};
