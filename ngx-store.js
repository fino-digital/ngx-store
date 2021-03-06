/**
 * @license ngx-store
 * ISC license
 */

import { Injectable, NgModule } from '@angular/core';
import { Subject, fromEvent, interval, merge } from 'rxjs';
import { Debugger } from 'ts-debug';
import { delay, filter, map } from 'rxjs/operators';

var isEqual = require('lodash.isequal');
var CacheItem = /** @class */ (function () {
    function CacheItem(cacheItem) {
        this.name = '';
        this.targets = [];
        this.services = [];
        this.utilities = [];
        this.proxy = null;
        this._key = '';
        this.initializedTargets = new Set();
        this._key = cacheItem.key;
        this.name = cacheItem.name;
        this.addTargets(cacheItem.targets);
        this.addServices(cacheItem.services);
        this.addUtilities(cacheItem.utilities);
    }
    Object.defineProperty(CacheItem.prototype, "key", {
        get: function () {
            return this._key;
        },
        enumerable: true,
        configurable: true
    });
    CacheItem.prototype.saveValue = function (value, config, source) {
        if (config === void 0) { config = {}; }
        debug.groupCollapsed('CacheItem#saveValue for ' + this.key + ' in ' + this.currentTarget.constructor.name);
        debug.log('new value: ', value);
        debug.log('previous value: ', this.readValue());
        debug.log('targets.length: ', this.targets.length);
        debug.log('currentTarget:', this.currentTarget);
        debug.groupEnd();
        // prevent overwriting value by initializators
        if (!this.initializedTargets.has(this.currentTarget)) {
            this.initializedTargets.add(this.currentTarget);
            var readValue = this.readValue();
            var savedValue = (readValue !== null && readValue !== undefined) ? readValue : value;
            var proxy = this.getProxy(savedValue, config);
            proxy = (proxy !== null) ? proxy : value;
            debug.log('initial value for ' + this.key + ' in ' + this.currentTarget.constructor.name, proxy);
            this.propagateChange(savedValue, source);
            return proxy;
        }
        this.propagateChange(value, source);
        return this.getProxy(value, config);
    };
    CacheItem.prototype.getProxy = function (value, config) {
        if (config === void 0) { config = {}; }
        if (value === undefined && this.proxy)
            return this.proxy; // return cached proxy if value hasn't changed
        value = (value === undefined) ? this.readValue() : value;
        if (typeof value !== 'object' || value === null) {
            this.proxy = value;
            return value;
        }
        if ((!Config.mutateObjects && !config.mutate) || config.mutate === false)
            return value;
        var _self = this; // alias to use in standard function expressions
        var prototype = Object.assign(new value.constructor(), value.__proto__);
        prototype.save = function () {
            // add method for triggering force save
            _self.saveValue(value, config);
        };
        // TODO set prototype for Array.prototype or something
        if (Array.isArray(value)) {
            // handle methods that could change value of array
            var methodsToOverwrite = [
                'pop', 'push', 'reverse', 'shift', 'unshift', 'splice',
                'filter', 'forEach', 'map', 'fill', 'sort', 'copyWithin'
            ];
            var _loop_1 = function (method) {
                prototype[method] = function () {
                    var readValue = _self.readValue();
                    var result = Array.prototype[method].apply(readValue, arguments);
                    debug.log('Saving value for ' + _self.key + ' by method ' + prototype.constructor.name + '.' + method);
                    _self.saveValue(readValue, config);
                    return result;
                };
            };
            for (var _i = 0, methodsToOverwrite_1 = methodsToOverwrite; _i < methodsToOverwrite_1.length; _i++) {
                var method = methodsToOverwrite_1[_i];
                _loop_1(method);
            }
        }
        Object.setPrototypeOf(value, prototype);
        this.proxy = value;
        return value;
    };
    CacheItem.prototype.readValue = function (config) {
        if (config === void 0) { config = {}; }
        var entry = this.utilities[0];
        var value = entry ? entry.utility.get(this.key, entry.config) : null;
        return (typeof value !== 'object') ? value : JSON.parse(JSON.stringify(this.getProxy(value, entry.config)));
    };
    CacheItem.prototype.addTargets = function (targets) {
        var _this = this;
        targets.forEach(function (target) {
            if (_this.targets.indexOf(target) === -1) {
                if (typeof target === 'object') {
                    // handle Angular Component destruction
                    var originalFunction_1 = target.ngOnDestroy;
                    var _self_1 = _this;
                    target.ngOnDestroy = function () {
                        if (typeof originalFunction_1 === 'function') {
                            originalFunction_1.apply(this, arguments);
                        }
                        target.ngOnDestroy = originalFunction_1 || function () { };
                        _self_1.initializedTargets.delete(target);
                        _self_1.targets = _self_1.targets.filter(function (t) { return t !== target; });
                        if (!_self_1.targets.length) {
                            _self_1.services.forEach(function (service) {
                                service.keys = service.keys.filter(function (key) { return key !== _self_1._key; });
                            });
                            _self_1.resetProxy();
                            Cache.remove(_self_1);
                        }
                        debug.groupCollapsed(_self_1.key + " OnDestroy handler:");
                        debug.log('removed target:', target.constructor.name);
                        debug.log('remaining targets:', _self_1.targets);
                        debug.log('cacheItem:', Cache.get(_self_1.key));
                        debug.groupEnd();
                    };
                    _this.targets.push(target);
                }
            }
        });
    };
    CacheItem.prototype.addServices = function (services) {
        var _this = this;
        services.forEach(function (service) {
            if (_this.services.indexOf(service) === -1) {
                service.keys.push(_this._key);
                _this.services.push(service);
            }
        });
    };
    CacheItem.prototype.addUtilities = function (utilityEntries) {
        var _this = this;
        utilityEntries.forEach(function (entry) {
            if (_this.utilities.findIndex(function (e) { return e.utility === entry.utility; }) === -1) {
                _this.utilities.push(entry);
                entry.utility.set(_this.key, _this.readValue());
            }
        });
    };
    CacheItem.prototype.resetProxy = function () {
        this.proxy = null;
    };
    CacheItem.prototype.propagateChange = function (value, source) {
        var _this = this;
        if (isEqual(value, this.readValue()))
            return;
        this.utilities.forEach(function (entry) {
            var utility = entry.utility;
            // updating service which the change came from would affect in a cycle
            if (utility === source)
                return;
            debug.log("propagating change on " + _this.key + " to:", utility);
            utility.set(_this._key, value, entry.config);
        });
    };
    return CacheItem;
}());

var Cache = /** @class */ (function () {
    function Cache() {
    }
    Cache.getCacheFor = function (cacheCandidate) {
        var cacheItem = Cache.get(cacheCandidate.key);
        if (!cacheItem) {
            cacheItem = new CacheItem(cacheCandidate);
            debug.log("Created new CacheItem for " + cacheCandidate.name + " for " + cacheItem.utilities[0].utility.getStorageName());
            Cache.set(cacheItem);
            return cacheItem;
        }
        debug.log("Loaded prior CacheItem of " + cacheItem.name + " for " + cacheCandidate.utilities[0].utility.getStorageName());
        cacheItem.addTargets(cacheCandidate.targets);
        cacheItem.addServices(cacheCandidate.services);
        cacheItem.addUtilities(cacheCandidate.utilities);
        Cache.set(cacheItem);
        return cacheItem;
    };
    Cache.remove = function (cacheItem) {
        return Cache.items.delete(cacheItem.key);
    };
    Cache.get = function (key) {
        return Cache.items.get(key);
    };
    Cache.set = function (cacheItem) {
        if (!Cache.get(cacheItem.key)) {
            debug.log('CacheItem for ' + cacheItem.key, cacheItem);
        }
        Cache.items.set(cacheItem.key, cacheItem);
    };
    Cache.items = new Map();
    return Cache;
}());

var NgxStorageEvent = /** @class */ (function () {
    function NgxStorageEvent(type, key, storageArea) {
        this.type = type;
        this.key = key;
        this.storageArea = storageArea;
        this.timeStamp = (Date.now() - NgxStorageEvent.initTimeStamp);
        this.bubbles = false;
        this.cancelBubble = false;
        this.cancelable = false;
        this.composed = false;
        this.currentTarget = window;
        this.defaultPrevented = false;
        this.eventPhase = 2;
        this.isTrusted = true;
        this.path = [window];
        this.returnValue = true;
        this.srcElement = window;
        this.target = window;
        this.url = window.location.href;
        this.isInternal = true;
    }
    Object.defineProperty(NgxStorageEvent.prototype, "scoped", {
        /**
         * Methods below exist only to satisfy TypeScript compiler
         */
        get: /**
           * Methods below exist only to satisfy TypeScript compiler
           */
        function () {
            return StorageEvent.prototype.scoped;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NgxStorageEvent.prototype, "initEvent", {
        get: function () {
            return StorageEvent.prototype.initEvent.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NgxStorageEvent.prototype, "preventDefault", {
        get: function () {
            return StorageEvent.prototype.preventDefault.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NgxStorageEvent.prototype, "stopImmediatePropagation", {
        get: function () {
            return StorageEvent.prototype.stopImmediatePropagation.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NgxStorageEvent.prototype, "stopPropagation", {
        get: function () {
            return StorageEvent.prototype.stopPropagation.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NgxStorageEvent.prototype, "deepPath", {
        get: function () {
            return StorageEvent.prototype.deepPath.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NgxStorageEvent.prototype, "AT_TARGET", {
        get: function () {
            return StorageEvent.prototype.AT_TARGET;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NgxStorageEvent.prototype, "BUBBLING_PHASE", {
        get: function () {
            return StorageEvent.prototype.BUBBLING_PHASE;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NgxStorageEvent.prototype, "CAPTURING_PHASE", {
        get: function () {
            return StorageEvent.prototype.BUBBLING_PHASE;
        },
        enumerable: true,
        configurable: true
    });
    NgxStorageEvent.initTimeStamp = Date.now();
    return NgxStorageEvent;
}());

var WebStorageUtility = /** @class */ (function () {
    function WebStorageUtility(storage, prefix, previousPrefix) {
        var _this = this;
        this._prefix = '';
        this._changes = new Subject();
        this._storage = storage;
        this._prefix = prefix;
        // handle previousPrefix for backward-compatibility and safe config changes below
        if (prefix === previousPrefix)
            return;
        if (previousPrefix === null)
            return;
        if (previousPrefix === undefined)
            return;
        debug.log(this.getStorageName() + ' > Detected prefix change from ' + previousPrefix + ' to ' + prefix);
        this.forEach(function (value, key) {
            // ignore config settings when previousPrefix = ''
            if (key.startsWith(previousPrefix) && !key.startsWith(CONFIG_PREFIX)) {
                var nameWithoutPrefix = _this.trimPrefix(key);
                _this.set(nameWithoutPrefix, _this._storage.getItem(key));
                if (previousPrefix !== '') {
                    _this._storage.removeItem(key);
                }
            }
        });
    }
    WebStorageUtility.getSettable = function (value) {
        return JSON.stringify(value);
    };
    WebStorageUtility.getGettable = function (value) {
        if (value === 'undefined')
            return null;
        try {
            return JSON.parse(value);
        }
        catch (e) {
            return value;
        }
    };
    Object.defineProperty(WebStorageUtility.prototype, "prefix", {
        get: function () {
            return this._prefix;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(WebStorageUtility.prototype, "keys", {
        get: function () {
            var keys = [];
            this.forEach(function (value, key) { return keys.push(key); });
            return keys;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(WebStorageUtility.prototype, "changes", {
        get: function () {
            return this._changes.asObservable();
        },
        enumerable: true,
        configurable: true
    });
    WebStorageUtility.prototype.getStorage = function () {
        return this._storage;
    };
    WebStorageUtility.prototype.getStorageKey = function (key, prefix) {
        prefix = (typeof prefix === 'string') ? prefix : this.prefix;
        return "" + prefix + key;
    };
    WebStorageUtility.prototype.getStorageName = function () {
        return this._storage.type || ((this._storage === localStorage) ? 'localStorage' : 'sessionStorage');
    };
    WebStorageUtility.prototype.get = function (key, config) {
        if (config === void 0) { config = {}; }
        var storageKey = this.getStorageKey(key, config.prefix);
        var value = this._storage.getItem(storageKey);
        return this.getGettable(value);
    };
    WebStorageUtility.prototype.set = function (key, value, config) {
        if (config === void 0) { config = {}; }
        if (value === null || value === undefined) {
            this.remove(key);
            return null;
        }
        try {
            var storageKey = this.getStorageKey(key, config.prefix);
            var storable = this.getSettable(value);
            this.emitEvent(key, value);
            this._storage.setItem(storageKey, storable, config.expires);
            var cacheItem = Cache.get(key);
            if (cacheItem) {
                debug.log("updating following CacheItem from " + this.constructor.name + ":", cacheItem);
                cacheItem.resetProxy();
                cacheItem.propagateChange(value, this);
            }
        }
        catch (error) {
            console.warn("[ngx-store] " + this.getStorageName() + ": following error occurred while trying to save " + key + " =", value);
            console.error(error);
        }
        return value;
    };
    // TODO return true if item existed and false otherwise (?)
    // TODO return true if item existed and false otherwise (?)
    WebStorageUtility.prototype.remove = 
    // TODO return true if item existed and false otherwise (?)
    function (key, config) {
        if (config === void 0) { config = {}; }
        var storageKey = this.getStorageKey(key, config.prefix);
        this._storage.removeItem(storageKey);
        var cacheItem = Cache.get(key);
        if (cacheItem) {
            cacheItem.resetProxy();
        }
    };
    WebStorageUtility.prototype.clear = function () {
        var _this = this;
        this.emitEvent(null, null, null);
        this.forEach(function (value, key) {
            if (key.startsWith(CONFIG_PREFIX))
                return;
            _this.remove(key, { prefix: '' });
        });
    };
    WebStorageUtility.prototype.forEach = function (callbackFn) {
        var _this = this;
        if (typeof this._storage.forEach === 'function') {
            return this._storage.forEach(function (value, key) {
                callbackFn(_this.getGettable(value), key);
            });
        }
        Object.keys(this._storage).forEach(function (key) {
            callbackFn(_this.getGettable(_this._storage[key]), key);
        });
    };
    WebStorageUtility.prototype.getSettable = function (value) {
        return WebStorageUtility.getSettable(value);
    };
    WebStorageUtility.prototype.getGettable = function (value) {
        return WebStorageUtility.getGettable(value);
    };
    WebStorageUtility.prototype.trimPrefix = function (key) {
        return key.replace(this.prefix, '');
    };
    WebStorageUtility.prototype.emitEvent = function (key, newValue, oldValue) {
        var event = new NgxStorageEvent(this.getStorageName(), key, this._storage);
        event.oldValue = (oldValue !== undefined) ? oldValue : this.get(key);
        event.newValue = newValue;
        this._changes.next(event);
    };
    return WebStorageUtility;
}());

var CONFIG_PREFIX = 'NGX-STORE_';
var ConfigHelper = /** @class */ (function () {
    function ConfigHelper() {
    }
    ConfigHelper.getItem = function (key) {
        return ConfigHelper._webStorageUtility.get(key);
    };
    ConfigHelper.setItem = function (key, item) {
        return ConfigHelper._webStorageUtility.set(key, item);
    };
    ConfigHelper._webStorageUtility = new WebStorageUtility(localStorage, CONFIG_PREFIX);
    return ConfigHelper;
}());

var DefaultConfig = {
    prefix: 'ngx_',
    previousPrefix: 'angular2ws_',
    clearType: 'prefix',
    mutateObjects: true,
    cookiesScope: '',
    cookiesCheckInterval: 0,
    debugMode: false,
};
var ConfigFills = {};
var localStoragePrefix = ConfigHelper.getItem('prefix');
if (typeof NGXSTORE_CONFIG === 'object') {
    ConfigFills = Object.assign({}, NGXSTORE_CONFIG);
}
if (localStoragePrefix !== undefined && localStoragePrefix !== null) {
    ConfigFills.previousPrefix = localStoragePrefix;
}
else if (ConfigFills.previousPrefix === undefined) {
    ConfigFills.previousPrefix = DefaultConfig.previousPrefix;
}
// merge default config, deprecated config and global config all together
var Config = Object.assign({}, DefaultConfig, ConfigFills);
var debug = new Debugger(console, Config.debugMode, '[ngx-store] ');
ConfigHelper.setItem('prefix', Config.prefix);

var _get = require('lodash.get');
var _set = require('lodash.set');
var _merge = require('lodash.merge');
var Resource = /** @class */ (function () {
    function Resource(service, key) {
        this.service = service;
        this.key = key;
        this._defaultValue = null;
        this._path = [];
        this._prefix = Config.prefix;
    }
    Object.defineProperty(Resource.prototype, "value", {
        /**
         * Returns value taking path into account
         * @returns {any}
         */
        get: /**
             * Returns value taking path into account
             * @returns {any}
             */
        function () {
            return this.considerDefault(this.readValue());
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Resource.prototype, "defaultValue", {
        /**
         * Returns default value
         * @returns {T}
         */
        get: /**
             * Returns default value
             * @returns {T}
             */
        function () {
            return this._defaultValue;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Resource.prototype, "path", {
        /**
         * Returns current path as a string
         * @returns {string}
         */
        get: /**
             * Returns current path as a string
             * @returns {string}
             */
        function () {
            return this.pathString;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Resource.prototype, "prefix", {
        /**
         * Returns currently set prefix
         * @returns {string}
         */
        get: /**
             * Returns currently set prefix
             * @returns {string}
             */
        function () {
            return this._prefix;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Sets path of object property
     * @param {string} path
     * @returns {this}
     */
    /**
         * Sets path of object property
         * @param {string} path
         * @returns {this}
         */
    Resource.prototype.setPath = /**
         * Sets path of object property
         * @param {string} path
         * @returns {this}
         */
    function (path) {
        this._path = path.split('.');
        return this;
    };
    /**
     * Appends current path
     * e.g. if path('key') and appendPath('nested'), the path will be "key.nested"
     * @param {string} path
     * @returns {this}
     */
    /**
         * Appends current path
         * e.g. if path('key') and appendPath('nested'), the path will be "key.nested"
         * @param {string} path
         * @returns {this}
         */
    Resource.prototype.appendPath = /**
         * Appends current path
         * e.g. if path('key') and appendPath('nested'), the path will be "key.nested"
         * @param {string} path
         * @returns {this}
         */
    function (path) {
        this._path.push(path);
        return this;
    };
    /**
     * Removes last item of path
     * e.g. if path('key.nested') and truncatePath(), the path will be "key"
     * @returns {this}
     */
    /**
         * Removes last item of path
         * e.g. if path('key.nested') and truncatePath(), the path will be "key"
         * @returns {this}
         */
    Resource.prototype.truncatePath = /**
         * Removes last item of path
         * e.g. if path('key.nested') and truncatePath(), the path will be "key"
         * @returns {this}
         */
    function () {
        this._path.pop();
        return this;
    };
    /**
     * Resets set path
     * @returns {this}
     */
    /**
         * Resets set path
         * @returns {this}
         */
    Resource.prototype.resetPath = /**
         * Resets set path
         * @returns {this}
         */
    function () {
        this._path = [];
        return this;
    };
    /**
     * Sets prefix
     * @param {string} prefix
     * @returns {this}
     */
    /**
         * Sets prefix
         * @param {string} prefix
         * @returns {this}
         */
    Resource.prototype.setPrefix = /**
         * Sets prefix
         * @param {string} prefix
         * @returns {this}
         */
    function (prefix) {
        this._prefix = prefix;
        return this;
    };
    /**
     * Moves storage item to new key using given prefix
     * @param {string} prefix
     * @returns {this}
     */
    /**
         * Moves storage item to new key using given prefix
         * @param {string} prefix
         * @returns {this}
         */
    Resource.prototype.changePrefix = /**
         * Moves storage item to new key using given prefix
         * @param {string} prefix
         * @returns {this}
         */
    function (prefix) {
        this.service.utility.set(this.key, this.fullValue, { prefix: prefix });
        this.service.utility.remove(this.key, { prefix: this._prefix });
        return this.setPrefix(prefix);
    };
    /**
     * Sets default value for both reading and saving operations
     * @param defaultValue
     * @returns {this}
     */
    /**
         * Sets default value for both reading and saving operations
         * @param defaultValue
         * @returns {this}
         */
    Resource.prototype.setDefaultValue = /**
         * Sets default value for both reading and saving operations
         * @param defaultValue
         * @returns {this}
         */
    function (defaultValue) {
        this._defaultValue = defaultValue;
        var value = this.readValue();
        if (this.isNullOrUndefined(value)) {
            this.save(defaultValue);
        }
        return this;
    };
    /**
     * Creates or overrides value as a new entry or existing object property depending on path
     * @param value
     * @returns {this}
     */
    /**
         * Creates or overrides value as a new entry or existing object property depending on path
         * @param value
         * @returns {this}
         */
    Resource.prototype.save = /**
         * Creates or overrides value as a new entry or existing object property depending on path
         * @param value
         * @returns {this}
         */
    function (value) {
        if (this.pathString) {
            value = _set(this.fullValue, this.pathString, this.considerDefault(value));
        }
        this.service.utility.set(this.key, this.considerDefault(value), { prefix: this._prefix });
        return this;
    };
    /**
     * Updates existing object property using current path
     * @param {T} value
     * @returns {this}
     */
    /**
         * Updates existing object property using current path
         * @param {T} value
         * @returns {this}
         */
    Resource.prototype.update = /**
         * Updates existing object property using current path
         * @param {T} value
         * @returns {this}
         */
    function (value) {
        return this.save(_merge(this.readValue(), value));
    };
    /**
     * Removes item stored under current key
     * @returns {this}
     */
    /**
         * Removes item stored under current key
         * @returns {this}
         */
    Resource.prototype.remove = /**
         * Removes item stored under current key
         * @returns {this}
         */
    function () {
        this.service.utility.remove(this.key);
        return this;
    };
    Object.defineProperty(Resource.prototype, "fullValue", {
        get: function () {
            return this.considerDefault(this.service.utility.get(this.key, { prefix: this._prefix }));
        },
        enumerable: true,
        configurable: true
    });
    Resource.prototype.considerDefault = function (value) {
        return this.isNullOrUndefined(value) ? this._defaultValue : value;
    };
    Resource.prototype.isNullOrUndefined = function (value) {
        return (value === null || value === undefined);
    };
    Object.defineProperty(Resource.prototype, "pathString", {
        get: function () {
            return this._path.join('.');
        },
        enumerable: true,
        configurable: true
    });
    Resource.prototype.readValue = function () {
        var value = this.service.utility.get(this.key, { prefix: this._prefix });
        if (this.pathString) {
            return _get(value, this.pathString);
        }
        return value;
    };
    return Resource;
}());

var merge$1 = require('lodash.merge');
var WebStorageService = /** @class */ (function () {
    function WebStorageService(utility) {
        this.utility = utility;
    }
    Object.defineProperty(WebStorageService.prototype, "keys", {
        /**
         * Gets keys for stored variables created by ngx-store,
         * ignores keys that have not been created by decorators and have no prefix at once
         */
        get: /**
             * Gets keys for stored variables created by ngx-store,
             * ignores keys that have not been created by decorators and have no prefix at once
             */
        function () {
            var _this = this;
            // get prefixed key if prefix is defined
            var prefixKeys = this.utility.keys.filter(function (key) {
                return _this.utility.prefix && key.startsWith(_this.utility.prefix);
            });
            var decoratorKeys = this.constructor.keys;
            return prefixKeys.concat(decoratorKeys);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(WebStorageService.prototype, "config", {
        get: function () {
            return Config;
        },
        enumerable: true,
        configurable: true
    });
    WebStorageService.prototype.get = function (key) {
        return this.utility.get(key);
    };
    /**
     * Returns new data Resource for given key exposing builder design pattern
     * designed for complex nested data structures
     * @param {string} key
     * @returns {any}
     */
    /**
         * Returns new data Resource for given key exposing builder design pattern
         * designed for complex nested data structures
         * @param {string} key
         * @returns {any}
         */
    WebStorageService.prototype.load = /**
         * Returns new data Resource for given key exposing builder design pattern
         * designed for complex nested data structures
         * @param {string} key
         * @returns {any}
         */
    function (key) {
        return new Resource(this, key);
    };
    WebStorageService.prototype.set = function (key, value) {
        return this.utility.set(key, value);
    };
    WebStorageService.prototype.update = function (key, changes) {
        var value = this.get(key);
        if (value !== undefined && typeof value !== 'object') {
            debug.throw(new Error("Value stored under \"" + key + "\" key is not an object and tried to be updated."));
            return value;
        }
        return this.set(key, merge$1({}, value, changes));
    };
    // TODO return true if item existed and false otherwise (?)
    // TODO return true if item existed and false otherwise (?)
    WebStorageService.prototype.remove = 
    // TODO return true if item existed and false otherwise (?)
    function (key) {
        return this.utility.remove(key);
    };
    WebStorageService.prototype.observe = function (key, exactMatch) {
        return this._changes.pipe(filter(function (event) {
            if (!key) {
                return true;
            }
            if (exactMatch) {
                if (key.startsWith(Config.prefix)) {
                    return event.key === key;
                }
                return event.key === Config.prefix + key;
            }
            else {
                return event.key.indexOf(key) !== -1;
            }
        }), delay(30) // event should come after actual data change and propagation
        );
    };
    /**
     * Clears chosen data from Storage
     * @param clearType 'prefix' | 'decorators' | 'all'
     * @param prefixOrClass defines the prefix or class (not its instance) whose decorators should be cleared
     */
    /**
         * Clears chosen data from Storage
         * @param clearType 'prefix' | 'decorators' | 'all'
         * @param prefixOrClass defines the prefix or class (not its instance) whose decorators should be cleared
         */
    WebStorageService.prototype.clear = /**
         * Clears chosen data from Storage
         * @param clearType 'prefix' | 'decorators' | 'all'
         * @param prefixOrClass defines the prefix or class (not its instance) whose decorators should be cleared
         */
    function (clearType, prefixOrClass) {
        var _this = this;
        clearType = clearType || Config.clearType;
        if (clearType === 'decorators') {
            var keys = [];
            if (typeof prefixOrClass === 'object') {
                keys = this.keys.filter(function (key) { return Cache.get(key).targets.indexOf(prefixOrClass) !== -1; });
                debug.log(this.utility.getStorageName() + ' > Removing decorated data from ' + prefixOrClass.constructor.name + ':', keys);
            }
            else {
                keys = this.keys;
                debug.log(this.utility.getStorageName() + ' > Removing decorated data:', keys);
            }
            keys.forEach(function (key) { return _this.remove(key); });
        }
        else if (clearType === 'prefix') {
            prefixOrClass = prefixOrClass || this.utility.prefix;
            this.utility.forEach(function (value, key) {
                if (key.startsWith(prefixOrClass)) {
                    _this.remove(_this.utility.trimPrefix(key));
                }
            });
        }
        else if (clearType === 'all') {
            this.utility.clear();
        }
    };
    WebStorageService.prototype.generateEvent = function (key, newValue, oldValue) {
        var type = this.utility.getStorageName().charAt(0).toLowerCase() + this.utility.getStorageName().slice(1);
        var event = new NgxStorageEvent(type, key, this.utility.getStorage());
        event.oldValue = (oldValue !== undefined) ? oldValue : this.get(key);
        event.newValue = newValue;
        return event;
    };
    WebStorageService.prototype.mapNativeEvent = function (ev) {
        var event = this.generateEvent(ev.key, this.utility.getGettable(ev.newValue), this.utility.getGettable(ev.oldValue));
        event.isInternal = false;
        return event;
    };
    WebStorageService.keys = [];
    return WebStorageService;
}());

// TODO: in the future use ES6 Proxy to handle indexers
var NgxStorage = /** @class */ (function () {
    function NgxStorage() {
        this.externalChanges = new Subject();
    }
    NgxStorage.prototype.emitEvent = function (key, newValue, oldValue) {
        var event = new NgxStorageEvent(this.type, key, this);
        event.oldValue = (oldValue !== undefined) ? oldValue : this.getItem(key);
        event.newValue = newValue;
        event.isInternal = false;
        this.externalChanges.next(event);
    };
    return NgxStorage;
}());

var __extends$1 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var CookiesStorage = /** @class */ (function (_super) {
    __extends$1(CookiesStorage, _super);
    function CookiesStorage() {
        var _this = _super.call(this) || this;
        _this.getAllItems();
        if (Config.cookiesCheckInterval) {
            interval(Config.cookiesCheckInterval)
                .subscribe(function () {
                if (!_this.externalChanges.observers.length) {
                    return; // don't run if there are no set subscriptions
                }
                _this.getAllItems();
            });
        }
        return _this;
    }
    Object.defineProperty(CookiesStorage.prototype, "type", {
        get: function () {
            return 'cookiesStorage';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(CookiesStorage.prototype, "length", {
        get: function () {
            return this.getAllKeys().length;
        },
        enumerable: true,
        configurable: true
    });
    CookiesStorage.prototype.key = function (index) {
        return this.getAllKeys()[index];
    };
    CookiesStorage.prototype.getItem = function (key) {
        return this.getAllItems().get(key);
    };
    CookiesStorage.prototype.removeItem = function (key) {
        if (typeof document === 'undefined')
            return;
        var domain = this.resolveDomain(Config.cookiesScope);
        domain = (domain) ? 'domain=' + domain + ';' : '';
        document.cookie = key + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;' + domain;
        this.cachedItemsMap.delete(key);
    };
    /**
     * @param key
     * @param value
     * @param expirationDate passing null affects in lifetime cookie
     */
    /**
         * @param key
         * @param value
         * @param expirationDate passing null affects in lifetime cookie
         */
    CookiesStorage.prototype.setItem = /**
         * @param key
         * @param value
         * @param expirationDate passing null affects in lifetime cookie
         */
    function (key, value, expirationDate) {
        if (typeof document === 'undefined')
            return;
        var domain = this.resolveDomain(Config.cookiesScope);
        debug.log('Cookies domain:', domain);
        domain = (domain) ? 'domain=' + domain + ';' : '';
        var utcDate = '';
        if (expirationDate instanceof Date) {
            utcDate = expirationDate.toUTCString();
        }
        else if (expirationDate === null) {
            utcDate = 'Fri, 18 Dec 2099 12:00:00 GMT';
        }
        var expires = utcDate ? '; expires=' + utcDate : '';
        var cookie = key + '=' + value + expires + ';path=/;' + domain;
        debug.log('Cookie`s set instruction:', cookie);
        this.cachedItemsMap.set(key, value);
        document.cookie = cookie;
    };
    CookiesStorage.prototype.clear = function () {
        var _this = this;
        this.getAllKeys().forEach(function (key) { return _this.removeItem(key); });
    };
    CookiesStorage.prototype.forEach = function (callbackFn) {
        return this.getAllItems().forEach(function (value, key) { return callbackFn(value, key); });
    };
    CookiesStorage.prototype.getAllKeys = function () {
        return Array.from(this.getAllItems().keys());
    };
    // TODO: consider getting cookies from all paths
    // TODO: consider getting cookies from all paths
    CookiesStorage.prototype.getAllItems = 
    // TODO: consider getting cookies from all paths
    function () {
        var _this = this;
        if (this.cachedCookieString === document.cookie) {
            // No changes
            return this.cachedItemsMap;
        }
        var map$$1 = new Map();
        if (typeof document === 'undefined')
            return map$$1;
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].trim();
            var eqPos = cookie.indexOf('=');
            var key = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            var value = eqPos > -1 ? cookie.substr(eqPos + 1, cookie.length) : cookie;
            map$$1.set(key, value);
        }
        // detect changes and emit events
        if (this.cachedItemsMap) {
            map$$1.forEach(function (value, key) {
                var cachedValue = _this.cachedItemsMap.get(key);
                cachedValue = (cachedValue !== undefined) ? cachedValue : null;
                if (value !== cachedValue) {
                    _this.emitEvent(key, WebStorageUtility.getGettable(value), WebStorageUtility.getGettable(cachedValue));
                }
            });
            this.cachedItemsMap.forEach(function (value, key) {
                if (!map$$1.has(key)) {
                    _this.emitEvent(key, null, WebStorageUtility.getGettable(value));
                }
            });
        }
        this.cachedCookieString = document.cookie;
        return this.cachedItemsMap = map$$1;
    };
    /**
     * domain.com         + path="."          = .domain.com
     * domain.com         + path=".sub."      = .sub.domain.com
     * sub.domain.com     + path="sub."       = sub.domain.com
     * www.sub.domain.com + path="."          = .sub.domain.com
     * localhost          + path=".whatever." = localhost
     * @param path
     */
    /**
         * domain.com         + path="."          = .domain.com
         * domain.com         + path=".sub."      = .sub.domain.com
         * sub.domain.com     + path="sub."       = sub.domain.com
         * www.sub.domain.com + path="."          = .sub.domain.com
         * localhost          + path=".whatever." = localhost
         * @param path
         */
    CookiesStorage.prototype.resolveDomain = /**
         * domain.com         + path="."          = .domain.com
         * domain.com         + path=".sub."      = .sub.domain.com
         * sub.domain.com     + path="sub."       = sub.domain.com
         * www.sub.domain.com + path="."          = .sub.domain.com
         * localhost          + path=".whatever." = localhost
         * @param path
         */
    function (path) {
        if (!path)
            return '';
        var hostname = document.domain;
        if ((hostname.match(/\./g) || []).length < 1) {
            return '';
        }
        var www = (path[0] !== '.' && hostname.indexOf('www.') === 0) ? 'www.' : '';
        return www + path + this.getDomain();
    };
    /**
     * This function determines base domain by setting cookie at the highest level possible
     * @url http://rossscrivener.co.uk/blog/javascript-get-domain-exclude-subdomain
     */
    /**
         * This function determines base domain by setting cookie at the highest level possible
         * @url http://rossscrivener.co.uk/blog/javascript-get-domain-exclude-subdomain
         */
    CookiesStorage.prototype.getDomain = /**
         * This function determines base domain by setting cookie at the highest level possible
         * @url http://rossscrivener.co.uk/blog/javascript-get-domain-exclude-subdomain
         */
    function () {
        var i = 0;
        var domain = document.domain;
        var domainParts = domain.split('.');
        var s = '_gd' + (new Date()).getTime();
        while (i < (domainParts.length - 1) && document.cookie.indexOf(s + '=' + s) === -1) {
            domain = domainParts.slice(-1 - (++i)).join('.');
            document.cookie = s + '=' + s + ';domain=' + domain + ';';
        }
        document.cookie = s + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;domain=' + domain + ';';
        return domain;
    };
    return CookiesStorage;
}(NgxStorage));
var cookiesStorage = new CookiesStorage();

var __extends$2 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var SharedStorageUtility = /** @class */ (function (_super) {
    __extends$2(SharedStorageUtility, _super);
    function SharedStorageUtility() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    SharedStorageUtility.prototype.getSettable = function (value) {
        return value;
    };
    SharedStorageUtility.prototype.getGettable = function (value) {
        return value;
    };
    return SharedStorageUtility;
}(WebStorageUtility));

var __extends$3 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var SharedStorage = /** @class */ (function (_super) {
    __extends$3(SharedStorage, _super);
    function SharedStorage() {
        var _this = _super.call(this) || this;
        _this.sharedMap = new Map();
        _this.externalChanges = undefined;
        return _this;
    }
    Object.defineProperty(SharedStorage.prototype, "type", {
        get: function () {
            return 'sharedStorage';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SharedStorage.prototype, "length", {
        get: function () {
            return this.getAllKeys().length;
        },
        enumerable: true,
        configurable: true
    });
    SharedStorage.prototype.key = function (index) {
        return this.getAllKeys()[index];
    };
    SharedStorage.prototype.getItem = function (key) {
        var value = this.sharedMap.get(key);
        return (value !== undefined) ? value : null;
    };
    SharedStorage.prototype.removeItem = function (key) {
        this.sharedMap.delete(key);
    };
    SharedStorage.prototype.setItem = function (key, value) {
        this.sharedMap.set(key, value);
    };
    SharedStorage.prototype.clear = function () {
        this.sharedMap.clear();
    };
    SharedStorage.prototype.forEach = function (func) {
        return this.sharedMap.forEach(function (value, key) { return func(value, key); });
    };
    SharedStorage.prototype.getAllKeys = function () {
        return Array.from(this.sharedMap.keys());
    };
    return SharedStorage;
}(NgxStorage));
var sharedStorage = new SharedStorage();

var localStorageUtility = new WebStorageUtility(localStorage, Config.prefix, Config.previousPrefix);
var sessionStorageUtility = new WebStorageUtility(sessionStorage, Config.prefix, Config.previousPrefix);
var cookiesStorageUtility = new WebStorageUtility(cookiesStorage, Config.prefix, Config.previousPrefix);
var sharedStorageUtility = new SharedStorageUtility(sharedStorage, Config.prefix, Config.prefix);

var __extends = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var LocalStorageService = /** @class */ (function (_super) {
    __extends(LocalStorageService, _super);
    function LocalStorageService() {
        var _this = _super.call(this, localStorageUtility) || this;
        _this._changes =
            merge(fromEvent(window, 'storage')
                .pipe(filter(function (event) { return event.storageArea === localStorage; }), map(function (event) { return _this.mapNativeEvent(event); })), localStorageUtility.changes);
        return _this;
    }
    LocalStorageService.keys = [];
    LocalStorageService.decorators = [
        { type: Injectable },
    ];
    /** @nocollapse */
    LocalStorageService.ctorParameters = function () { return []; };
    return LocalStorageService;
}(WebStorageService));

var __extends$4 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var SessionStorageService = /** @class */ (function (_super) {
    __extends$4(SessionStorageService, _super);
    function SessionStorageService() {
        var _this = _super.call(this, sessionStorageUtility) || this;
        _this._changes =
            merge(fromEvent(window, 'storage')
                .pipe(filter(function (event) { return event.storageArea === sessionStorage; }), map(function (event) { return _this.mapNativeEvent(event); })), sessionStorageUtility.changes);
        return _this;
    }
    SessionStorageService.keys = [];
    SessionStorageService.decorators = [
        { type: Injectable },
    ];
    /** @nocollapse */
    SessionStorageService.ctorParameters = function () { return []; };
    return SessionStorageService;
}(WebStorageService));

var __extends$5 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var CookiesStorageService = /** @class */ (function (_super) {
    __extends$5(CookiesStorageService, _super);
    function CookiesStorageService() {
        var _this = _super.call(this, cookiesStorageUtility) || this;
        _this._changes =
            merge(cookiesStorage.externalChanges.asObservable(), cookiesStorageUtility.changes);
        return _this;
    }
    CookiesStorageService.prototype.set = function (key, value, expirationDate) {
        return this.utility.set(key, value, { expires: expirationDate });
    };
    CookiesStorageService.keys = [];
    CookiesStorageService.decorators = [
        { type: Injectable },
    ];
    /** @nocollapse */
    CookiesStorageService.ctorParameters = function () { return []; };
    return CookiesStorageService;
}(WebStorageService));

var __extends$6 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var SharedStorageService = /** @class */ (function (_super) {
    __extends$6(SharedStorageService, _super);
    function SharedStorageService() {
        var _this = _super.call(this, sharedStorageUtility) || this;
        _this._changes = sharedStorageUtility.changes;
        return _this;
    }
    SharedStorageService.keys = [];
    SharedStorageService.decorators = [
        { type: Injectable },
    ];
    /** @nocollapse */
    SharedStorageService.ctorParameters = function () { return []; };
    return SharedStorageService;
}(WebStorageService));

function LocalStorage(keyOrConfig, config) {
    return WebStorage(localStorageUtility, LocalStorageService, keyOrConfig, config);
}
function SessionStorage(keyOrConfig, config) {
    return WebStorage(sessionStorageUtility, SessionStorageService, keyOrConfig, config);
}
function CookieStorage(keyOrConfig, config) {
    return WebStorage(cookiesStorageUtility, CookiesStorageService, keyOrConfig, config);
}
function SharedStorage$1(keyOrConfig, config) {
    return WebStorage(sharedStorageUtility, SharedStorageService, keyOrConfig, config);
}
function WebStorage(webStorageUtility, service, keyOrConfig, config) {
    if (config === void 0) { config = {}; }
    return function (target, propertyName) {
        var key;
        if (typeof keyOrConfig === 'object') {
            key = keyOrConfig.key;
            config = keyOrConfig;
        }
        else if (typeof keyOrConfig === 'string') {
            key = keyOrConfig;
        }
        key = key || config.key || propertyName;
        var cacheItem = Cache.getCacheFor({
            key: key,
            name: propertyName,
            targets: [target],
            services: [service],
            utilities: [{
                    utility: webStorageUtility,
                    config: config,
                }],
        });
        Object.defineProperty(target, propertyName, {
            get: function () {
                return cacheItem.getProxy(undefined, config);
            },
            set: function (value) {
                if (!Cache.get(cacheItem.key)) {
                    cacheItem = Cache.getCacheFor(cacheItem);
                }
                cacheItem.addTargets([target]);
                cacheItem.currentTarget = target;
                cacheItem.saveValue(value, config);
            },
        });
        return target;
    };
}

var WebStorageModule = /** @class */ (function () {
    function WebStorageModule() {
    }
    WebStorageModule.decorators = [
        { type: NgModule, args: [{
                    providers: [
                        LocalStorageService,
                        SessionStorageService,
                        CookiesStorageService,
                        SharedStorageService,
                    ]
                },] },
    ];
    return WebStorageModule;
}());

/**
 * Angular library starter
 * Build an Angular library compatible with AoT compilation & Tree shaking like an official package
 * Copyright Roberto Simonetti
 * MIT license
 * https://github.com/robisim74/angular-library-starter
 */

// This file only reexports content of the `src` folder. Keep it that way.

/**
 * Generated bundle index. Do not edit.
 */

export { WebStorageUtility as ɵa, WebStorageModule, CookieStorage, LocalStorage, SessionStorage, SharedStorage$1 as SharedStorage, SharedStorage$1 as TempStorage, WebStorageService, CookiesStorageService, LocalStorageService, SessionStorageService, SharedStorageService, SharedStorageService as TempStorageService, NgxStorageEvent, Resource as NgxResource };
//# sourceMappingURL=ngx-store.js.map
