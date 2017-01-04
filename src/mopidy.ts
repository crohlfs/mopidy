export default class MopidyClient {
  socket: WebSocket;
  pendingRequests = new Map<number, {resolve: (value?: any) => void, reject: (reason?: any) => void}>();
  currentId = 0;
  handlers = new Map<string, Function[]>();

  constructor(url: string) {
    this.createSocket(url, 5000);
  }

  private createSocket(url: string, reconnectTimeout: number) {
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.emit('socket:connect');

      this.call('core.describe')
        .then(methods => {
          this.attachApi(methods);
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

    this.socket.onclose = () => setTimeout(() => this.createSocket(url, reconnectTimeout), reconnectTimeout);
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
      this.sendRequest({ jsonrpc: '2.0', method, id, params });
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

  private attachApi(api: any) {
    var getPath = (fullName: string) => {
      var path = fullName.split(".");
      
      if (path.length >= 1 && path[0] === "core") {
        path = path.slice(1);
      }

      return path;
    };

    var initaliseObjectPath = (objPath: string[]) => {
      var parent = this as any;

      for (var objName of objPath) {
        objName = snakeToCamel(objName);
        
        parent[objName] = parent[objName] || {};
        parent = parent[objName];
      }

      return parent;
    };

    var createMethod = (fullMethodName: string) => {
      var methodPath = getPath(fullMethodName);
      var methodName = snakeToCamel(methodPath.slice(-1)[0]);
      
      var objectPathEnd = initaliseObjectPath(methodPath.slice(0, -1));
      
      objectPathEnd[methodName] = (params?: any) => () => this.call(methodName, params);
    };

    Object.keys(api).forEach(createMethod);
    this.emit("state:online");
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