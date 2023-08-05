(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.rpcWebsocketClient = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (factory((global.rpcWebsocketClient = {})));
}(this, (function (exports) { 'use strict';

    var v1 = require('uuid/v1');
    var WebSocket = require('isomorphic-ws');
    (function (RpcVersions) {
        RpcVersions["RPC_VERSION"] = "2.0";
    })(exports.RpcVersions || (exports.RpcVersions = {}));
    var RpcWebSocketClient = /** @class */ (function () {
        // constructor
        /**
         * Does not start WebSocket connection!
         * You need to call connect() method first.
         * @memberof RpcWebSocketClient
         */
        function RpcWebSocketClient() {
            this.idAwaiter = {};
            this.onOpenHandlers = [];
            this.onAnyMessageHandlers = [];
            this.onNotification = [];
            this.onRequest = [];
            this.onSuccessResponse = [];
            this.onErrorResponse = [];
            this.onErrorHandlers = [];
            this.onCloseHandlers = [];
            this.config = {
                responseTimeout: 10000
            };
            this.ws = undefined;
        }
        // public
        /**
         * Starts WebSocket connection. Returns Promise when connection is established.
         * @param {string} url
         * @param {(string | string[])} [protocols]
         * @memberof RpcWebSocketClient
         */
        RpcWebSocketClient.prototype.connect = function (url, protocols) {
            this.ws = new WebSocket(url, protocols);
            return this.listen();
        };
        // events
        RpcWebSocketClient.prototype.onOpen = function (fn) {
            this.onOpenHandlers.push(fn);
        };
        /**
         * Native onMessage event. DO NOT USE THIS unless you really have to or for debugging purposes.
         * Proper RPC events are onRequest, onNotification, onSuccessResponse and onErrorResponse (or just awaiting response).
         * @param {RpcMessageEventFunction} fn
         * @memberof RpcWebSocketClient
         */
        RpcWebSocketClient.prototype.onAnyMessage = function (fn) {
            this.onAnyMessageHandlers.push(fn);
        };
        RpcWebSocketClient.prototype.onError = function (fn) {
            this.onErrorHandlers.push(fn);
        };
        RpcWebSocketClient.prototype.onClose = function (fn) {
            this.onCloseHandlers.push(fn);
        };
        /**
         * Appends onmessage listener on native websocket with RPC handlers.
         * If onmessage function was already there, it will call it on beggining.
         * Useful if you want to use RPC WebSocket Client on already established WebSocket along with function changeSocket().
         * @memberof RpcWebSocketClient
         */
        RpcWebSocketClient.prototype.listenMessages = function () {
            var _this = this;
            var previousOnMessage;
            if (this.ws.onmessage) {
                previousOnMessage = this.ws.onmessage.bind(this.ws);
            }
            this.ws.onmessage = function (e) {
                if (previousOnMessage) {
                    previousOnMessage(e);
                }
                for (var _i = 0, _a = _this.onAnyMessageHandlers; _i < _a.length; _i++) {
                    var handler = _a[_i];
                    handler(e);
                }
                var data = JSON.parse(e.data.toString());
                if (_this.isNotification(data)) {
                    // notification
                    for (var _b = 0, _c = _this.onNotification; _b < _c.length; _b++) {
                        var handler = _c[_b];
                        handler(data);
                    }
                }
                else if (_this.isRequest(data)) {
                    // request
                    for (var _d = 0, _e = _this.onRequest; _d < _e.length; _d++) {
                        var handler = _e[_d];
                        handler(data);
                    }
                    // responses
                }
                else if (_this.isSuccessResponse(data)) {
                    // success
                    for (var _f = 0, _g = _this.onSuccessResponse; _f < _g.length; _f++) {
                        var handler = _g[_f];
                        handler(data);
                    }
                    // resolve awaiting function
                    _this.idAwaiter[data.id](data.result);
                }
                else if (_this.isErrorResponse(data)) {
                    // error
                    for (var _h = 0, _j = _this.onErrorResponse; _h < _j.length; _h++) {
                        var handler = _j[_h];
                        handler(data);
                    }
                    // resolve awaiting function
                    _this.idAwaiter[data.id](data.error);
                }
            };
        };
        // communication
        /**
         * Creates and sends RPC request. Resolves when appropirate response is returned from server or after config.responseTimeout.
         * @param {string} method
         * @param {*} [params]
         * @returns
         * @memberof RpcWebSocketClient
         */
        RpcWebSocketClient.prototype.call = function (method, params) {
            var _this = this;
            return new Promise(function (resolve, reject) {
                var data = _this.buildRequest(method, params);
                // give limited time for response
                var timeout;
                if (_this.config.responseTimeout) {
                    timeout = setTimeout(function () {
                        // stop waiting for response
                        delete _this.idAwaiter[data.id];
                        reject("Awaiting response to \"" + method + "\" with id: " + data.id + " timed out.");
                    }, _this.config.responseTimeout);
                }
                // expect response
                _this.idAwaiter[data.id] = function (responseData) {
                    // stop timeout
                    clearInterval(timeout);
                    // stop waiting for response
                    delete _this.idAwaiter[data.id];
                    if (_this.isRpcError(responseData)) {
                        reject(responseData);
                        return;
                    }
                    resolve(responseData);
                };
                var json = JSON.stringify(data);
                _this.ws.send(json);
            });
        };
        /**
         * Creates and sends RPC Notification.
         * @param {string} method
         * @param {*} [params]
         * @memberof RpcWebSocketClient
         */
        RpcWebSocketClient.prototype.notify = function (method, params) {
            this.ws.send(JSON.stringify(this.buildNotification(method, params)));
        };
        // setup
        /**
         * You can provide custom id generation function to replace default uuid/v1.
         * @param {() => string} idFn
         * @memberof RpcWebSocketClient
         */
        RpcWebSocketClient.prototype.customId = function (idFn) {
            this.idFn = idFn;
        };
        /**
         * Removed jsonrpc from sent messages. Good if you don't care about standards or need better performance.
         * @memberof RpcWebSocketClient
         */
        RpcWebSocketClient.prototype.noRpc = function () {
            this.buildRequest = this.buildRequestBase;
            this.buildNotification = this.buildNotificationBase;
            this.buildRpcSuccessResponse = this.buildRpcSuccessResponseBase;
            this.buildRpcErrorResponse = this.buildRpcErrorResponseBase;
        };
        /**
         * Allows modifying configuration.
         * @param {RpcWebSocketConfig} options
         * @memberof RpcWebSocketClient
         */
        RpcWebSocketClient.prototype.configure = function (options) {
            Object.assign(this.config, options);
        };
        /**
         * Allows you to change used native WebSocket client to another one.
         * If you have already-connected WebSocket, use this with listenMessages().
         * @param {WebSocket} ws
         * @memberof RpcWebSocketClient
         */
        RpcWebSocketClient.prototype.changeSocket = function (ws) {
            this.ws = ws;
        };
        // private
        // events
        RpcWebSocketClient.prototype.listen = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                _this.ws.onopen = function (e) {
                    for (var _i = 0, _a = _this.onOpenHandlers; _i < _a.length; _i++) {
                        var handler = _a[_i];
                        handler(e);
                    }
                    resolve(e);
                };
                // listen for messages
                _this.listenMessages();
                // called before onclose
                _this.ws.onerror = function (e) {
                    for (var _i = 0, _a = _this.onErrorHandlers; _i < _a.length; _i++) {
                        var handler = _a[_i];
                        handler(e);
                    }
                };
                _this.ws.onclose = function (e) {
                    for (var _i = 0, _a = _this.onCloseHandlers; _i < _a.length; _i++) {
                        var handler = _a[_i];
                        handler(e);
                    }
                    reject(e);
                };
            });
        };
        // request
        RpcWebSocketClient.prototype.buildRequest = function (method, params) {
            var data = this.buildRequestBase(method, params);
            data.jsonrpc = exports.RpcVersions.RPC_VERSION;
            return data;
        };
        RpcWebSocketClient.prototype.buildRequestBase = function (method, params) {
            var data = {};
            data.id = this.idFn();
            data.method = method;
            if (params) {
                data.params = params;
            }
            return data;
        };
        // notification
        RpcWebSocketClient.prototype.buildNotification = function (method, params) {
            var data = this.buildNotificationBase(method, params);
            data.jsonrpc = exports.RpcVersions.RPC_VERSION;
            return data;
        };
        RpcWebSocketClient.prototype.buildNotificationBase = function (method, params) {
            var data = {};
            data.method = method;
            if (params) {
                data.params = params;
            }
            return data;
        };
        // success response
        RpcWebSocketClient.prototype.buildRpcSuccessResponse = function (id, result) {
            var data = this.buildRpcSuccessResponseBase(id, result);
            data.jsonrpc = exports.RpcVersions.RPC_VERSION;
            return data;
        };
        RpcWebSocketClient.prototype.buildRpcSuccessResponseBase = function (id, result) {
            var data = {};
            data.id = id;
            data.result = result;
            return data;
        };
        // error response
        RpcWebSocketClient.prototype.buildRpcErrorResponse = function (id, error) {
            var data = this.buildRpcErrorResponseBase(id, error);
            data.jsonrpc = exports.RpcVersions.RPC_VERSION;
            return data;
        };
        RpcWebSocketClient.prototype.buildRpcErrorResponseBase = function (id, error) {
            var data = {};
            data.id = id;
            data.error = error;
            return data;
        };
        RpcWebSocketClient.prototype.idFn = function () {
            return v1();
        };
        // tests
        RpcWebSocketClient.prototype.isNotification = function (data) {
            return !data.id;
        };
        RpcWebSocketClient.prototype.isRequest = function (data) {
            return data.method;
        };
        RpcWebSocketClient.prototype.isSuccessResponse = function (data) {
            return data.hasOwnProperty("result");
        };
        RpcWebSocketClient.prototype.isErrorResponse = function (data) {
            return data.hasOwnProperty("error");
        };
        RpcWebSocketClient.prototype.isRpcError = function (data) {
            return typeof (data === null || data === void 0 ? void 0 : data.code) !== 'undefined';
        };
        return RpcWebSocketClient;
    }());

    exports.RpcWebSocketClient = RpcWebSocketClient;

    Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"isomorphic-ws":2,"uuid/v1":5}],2:[function(require,module,exports){
(function (global){(function (){
// https://github.com/maxogden/websocket-stream/blob/48dc3ddf943e5ada668c31ccd94e9186f02fafbd/ws-fallback.js

var ws = null

if (typeof WebSocket !== 'undefined') {
  ws = WebSocket
} else if (typeof MozWebSocket !== 'undefined') {
  ws = MozWebSocket
} else if (typeof global !== 'undefined') {
  ws = global.WebSocket || global.MozWebSocket
} else if (typeof window !== 'undefined') {
  ws = window.WebSocket || window.MozWebSocket
} else if (typeof self !== 'undefined') {
  ws = self.WebSocket || self.MozWebSocket
}

module.exports = ws

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],3:[function(require,module,exports){
/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
var byteToHex = [];
for (var i = 0; i < 256; ++i) {
  byteToHex[i] = (i + 0x100).toString(16).substr(1);
}

function bytesToUuid(buf, offset) {
  var i = offset || 0;
  var bth = byteToHex;
  // join used to fix memory issue caused by concatenation: https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
  return ([
    bth[buf[i++]], bth[buf[i++]],
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]],
    bth[buf[i++]], bth[buf[i++]],
    bth[buf[i++]], bth[buf[i++]]
  ]).join('');
}

module.exports = bytesToUuid;

},{}],4:[function(require,module,exports){
// Unique ID creation requires a high quality random # generator.  In the
// browser this is a little complicated due to unknown quality of Math.random()
// and inconsistent support for the `crypto` API.  We do the best we can via
// feature-detection

// getRandomValues needs to be invoked in a context where "this" is a Crypto
// implementation. Also, find the complete implementation of crypto on IE11.
var getRandomValues = (typeof(crypto) != 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto)) ||
                      (typeof(msCrypto) != 'undefined' && typeof window.msCrypto.getRandomValues == 'function' && msCrypto.getRandomValues.bind(msCrypto));

if (getRandomValues) {
  // WHATWG crypto RNG - http://wiki.whatwg.org/wiki/Crypto
  var rnds8 = new Uint8Array(16); // eslint-disable-line no-undef

  module.exports = function whatwgRNG() {
    getRandomValues(rnds8);
    return rnds8;
  };
} else {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var rnds = new Array(16);

  module.exports = function mathRNG() {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return rnds;
  };
}

},{}],5:[function(require,module,exports){
var rng = require('./lib/rng');
var bytesToUuid = require('./lib/bytesToUuid');

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html

var _nodeId;
var _clockseq;

// Previous uuid creation time
var _lastMSecs = 0;
var _lastNSecs = 0;

// See https://github.com/uuidjs/uuid for API details
function v1(options, buf, offset) {
  var i = buf && offset || 0;
  var b = buf || [];

  options = options || {};
  var node = options.node || _nodeId;
  var clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;

  // node and clockseq need to be initialized to random values if they're not
  // specified.  We do this lazily to minimize issues related to insufficient
  // system entropy.  See #189
  if (node == null || clockseq == null) {
    var seedBytes = rng();
    if (node == null) {
      // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
      node = _nodeId = [
        seedBytes[0] | 0x01,
        seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]
      ];
    }
    if (clockseq == null) {
      // Per 4.2.2, randomize (14 bit) clockseq
      clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 0x3fff;
    }
  }

  // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
  var msecs = options.msecs !== undefined ? options.msecs : new Date().getTime();

  // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock
  var nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;

  // Time since last uuid creation (in msecs)
  var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

  // Per 4.2.1.2, Bump clockseq on clock regression
  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  }

  // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  }

  // Per 4.2.1.2 Throw error if too many uuids are requested
  if (nsecs >= 10000) {
    throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;

  // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
  msecs += 12219292800000;

  // `time_low`
  var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff;

  // `time_mid`
  var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff;

  // `time_high_and_version`
  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
  b[i++] = tmh >>> 16 & 0xff;

  // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
  b[i++] = clockseq >>> 8 | 0x80;

  // `clock_seq_low`
  b[i++] = clockseq & 0xff;

  // `node`
  for (var n = 0; n < 6; ++n) {
    b[i + n] = node[n];
  }

  return buf ? buf : bytesToUuid(b);
}

module.exports = v1;

},{"./lib/bytesToUuid":3,"./lib/rng":4}]},{},[1])(1)
});
