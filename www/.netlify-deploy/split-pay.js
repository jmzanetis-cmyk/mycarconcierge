var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/node_modules/tslib/tslib.es6.mjs
var tslib_es6_exports = {};
__export(tslib_es6_exports, {
  __addDisposableResource: () => __addDisposableResource,
  __assign: () => __assign,
  __asyncDelegator: () => __asyncDelegator,
  __asyncGenerator: () => __asyncGenerator,
  __asyncValues: () => __asyncValues,
  __await: () => __await,
  __awaiter: () => __awaiter,
  __classPrivateFieldGet: () => __classPrivateFieldGet,
  __classPrivateFieldIn: () => __classPrivateFieldIn,
  __classPrivateFieldSet: () => __classPrivateFieldSet,
  __createBinding: () => __createBinding,
  __decorate: () => __decorate,
  __disposeResources: () => __disposeResources,
  __esDecorate: () => __esDecorate,
  __exportStar: () => __exportStar,
  __extends: () => __extends,
  __generator: () => __generator,
  __importDefault: () => __importDefault,
  __importStar: () => __importStar,
  __makeTemplateObject: () => __makeTemplateObject,
  __metadata: () => __metadata,
  __param: () => __param,
  __propKey: () => __propKey,
  __read: () => __read,
  __rest: () => __rest,
  __rewriteRelativeImportExtension: () => __rewriteRelativeImportExtension,
  __runInitializers: () => __runInitializers,
  __setFunctionName: () => __setFunctionName,
  __spread: () => __spread,
  __spreadArray: () => __spreadArray,
  __spreadArrays: () => __spreadArrays,
  __values: () => __values,
  default: () => tslib_es6_default
});
function __extends(d, b) {
  if (typeof b !== "function" && b !== null)
    throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
  extendStatics(d, b);
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
function __rest(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
    t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
        t[p[i]] = s[p[i]];
    }
  return t;
}
function __decorate(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function __param(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) {
    if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
    return f;
  }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
    var context = {};
    for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
    for (var p in contextIn.access) context.access[p] = contextIn.access[p];
    context.addInitializer = function(f) {
      if (done) throw new TypeError("Cannot add initializers after decoration has completed");
      extraInitializers.push(accept(f || null));
    };
    var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
    if (kind === "accessor") {
      if (result === void 0) continue;
      if (result === null || typeof result !== "object") throw new TypeError("Object expected");
      if (_ = accept(result.get)) descriptor.get = _;
      if (_ = accept(result.set)) descriptor.set = _;
      if (_ = accept(result.init)) initializers.unshift(_);
    } else if (_ = accept(result)) {
      if (kind === "field") initializers.unshift(_);
      else descriptor[key] = _;
    }
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
}
function __runInitializers(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) {
    value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  }
  return useValue ? value : void 0;
}
function __propKey(x) {
  return typeof x === "symbol" ? x : "".concat(x);
}
function __setFunctionName(f, name, prefix) {
  if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
  return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
}
function __metadata(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __exportStar(m, o) {
  for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) __createBinding(o, m, p);
}
function __values(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
}
function __spread() {
  for (var ar = [], i = 0; i < arguments.length; i++)
    ar = ar.concat(__read(arguments[i]));
  return ar;
}
function __spreadArrays() {
  for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
  for (var r = Array(s), k = 0, i = 0; i < il; i++)
    for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
      r[k] = a[j];
  return r;
}
function __spreadArray(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}
function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function awaitReturn(f) {
    return function(v) {
      return Promise.resolve(v).then(f, reject);
    };
  }
  function verb(n, f) {
    if (g[n]) {
      i[n] = function(v) {
        return new Promise(function(a, b) {
          q.push([n, v, a, b]) > 1 || resume(n, v);
        });
      };
      if (f) i[n] = f(i[n]);
    }
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]);
  }
}
function __asyncDelegator(o) {
  var i, p;
  return i = {}, verb("next"), verb("throw", function(e) {
    throw e;
  }), verb("return"), i[Symbol.iterator] = function() {
    return this;
  }, i;
  function verb(n, f) {
    i[n] = o[n] ? function(v) {
      return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v;
    } : f;
  }
}
function __asyncValues(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i);
  function verb(n) {
    i[n] = o[n] && function(v) {
      return new Promise(function(resolve, reject) {
        v = o[n](v), settle(resolve, reject, v.done, v.value);
      });
    };
  }
  function settle(resolve, reject, d, v) {
    Promise.resolve(v).then(function(v2) {
      resolve({ value: v2, done: d });
    }, reject);
  }
}
function __makeTemplateObject(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
  }
  __setModuleDefault(result, mod);
  return result;
}
function __importDefault(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
function __classPrivateFieldIn(state, receiver) {
  if (receiver === null || typeof receiver !== "object" && typeof receiver !== "function") throw new TypeError("Cannot use 'in' operator on non-object");
  return typeof state === "function" ? receiver === state : state.has(receiver);
}
function __addDisposableResource(env, value, async) {
  if (value !== null && value !== void 0) {
    if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
    var dispose, inner;
    if (async) {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      dispose = value[Symbol.asyncDispose];
    }
    if (dispose === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      dispose = value[Symbol.dispose];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    env.stack.push({ value, dispose, async });
  } else if (async) {
    env.stack.push({ async: true });
  }
  return value;
}
function __disposeResources(env) {
  function fail(e) {
    env.error = env.hasError ? new _SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
    env.hasError = true;
  }
  var r, s = 0;
  function next() {
    while (r = env.stack.pop()) {
      try {
        if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
        if (r.dispose) {
          var result = r.dispose.call(r.value);
          if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
            fail(e);
            return next();
          });
        } else s |= 1;
      } catch (e) {
        fail(e);
      }
    }
    if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
    if (env.hasError) throw env.error;
  }
  return next();
}
function __rewriteRelativeImportExtension(path, preserveJsx) {
  if (typeof path === "string" && /^\.\.?\//.test(path)) {
    return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
      return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
    });
  }
  return path;
}
var extendStatics, __assign, __createBinding, __setModuleDefault, ownKeys, _SuppressedError, tslib_es6_default;
var init_tslib_es6 = __esm({
  "netlify/functions/node_modules/tslib/tslib.es6.mjs"() {
    extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
        d2.__proto__ = b2;
      } || function(d2, b2) {
        for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
      };
      return extendStatics(d, b);
    };
    __assign = function() {
      __assign = Object.assign || function __assign2(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    __createBinding = Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    __setModuleDefault = Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    };
    ownKeys = function(o) {
      ownKeys = Object.getOwnPropertyNames || function(o2) {
        var ar = [];
        for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
        return ar;
      };
      return ownKeys(o);
    };
    _SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
      var e = new Error(message);
      return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };
    tslib_es6_default = {
      __extends,
      __assign,
      __rest,
      __decorate,
      __param,
      __esDecorate,
      __runInitializers,
      __propKey,
      __setFunctionName,
      __metadata,
      __awaiter,
      __generator,
      __createBinding,
      __exportStar,
      __values,
      __read,
      __spread,
      __spreadArrays,
      __spreadArray,
      __await,
      __asyncGenerator,
      __asyncDelegator,
      __asyncValues,
      __makeTemplateObject,
      __importStar,
      __importDefault,
      __classPrivateFieldGet,
      __classPrivateFieldSet,
      __classPrivateFieldIn,
      __addDisposableResource,
      __disposeResources,
      __rewriteRelativeImportExtension
    };
  }
});

// netlify/functions/node_modules/@supabase/functions-js/dist/main/helper.js
var require_helper = __commonJS({
  "netlify/functions/node_modules/@supabase/functions-js/dist/main/helper.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveFetch = void 0;
    var resolveFetch = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
    exports2.resolveFetch = resolveFetch;
  }
});

// netlify/functions/node_modules/@supabase/functions-js/dist/main/types.js
var require_types = __commonJS({
  "netlify/functions/node_modules/@supabase/functions-js/dist/main/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FunctionRegion = exports2.FunctionsHttpError = exports2.FunctionsRelayError = exports2.FunctionsFetchError = exports2.FunctionsError = void 0;
    var FunctionsError = class extends Error {
      constructor(message, name = "FunctionsError", context) {
        super(message);
        this.name = name;
        this.context = context;
      }
    };
    exports2.FunctionsError = FunctionsError;
    var FunctionsFetchError = class extends FunctionsError {
      constructor(context) {
        super("Failed to send a request to the Edge Function", "FunctionsFetchError", context);
      }
    };
    exports2.FunctionsFetchError = FunctionsFetchError;
    var FunctionsRelayError = class extends FunctionsError {
      constructor(context) {
        super("Relay Error invoking the Edge Function", "FunctionsRelayError", context);
      }
    };
    exports2.FunctionsRelayError = FunctionsRelayError;
    var FunctionsHttpError = class extends FunctionsError {
      constructor(context) {
        super("Edge Function returned a non-2xx status code", "FunctionsHttpError", context);
      }
    };
    exports2.FunctionsHttpError = FunctionsHttpError;
    var FunctionRegion;
    (function(FunctionRegion2) {
      FunctionRegion2["Any"] = "any";
      FunctionRegion2["ApNortheast1"] = "ap-northeast-1";
      FunctionRegion2["ApNortheast2"] = "ap-northeast-2";
      FunctionRegion2["ApSouth1"] = "ap-south-1";
      FunctionRegion2["ApSoutheast1"] = "ap-southeast-1";
      FunctionRegion2["ApSoutheast2"] = "ap-southeast-2";
      FunctionRegion2["CaCentral1"] = "ca-central-1";
      FunctionRegion2["EuCentral1"] = "eu-central-1";
      FunctionRegion2["EuWest1"] = "eu-west-1";
      FunctionRegion2["EuWest2"] = "eu-west-2";
      FunctionRegion2["EuWest3"] = "eu-west-3";
      FunctionRegion2["SaEast1"] = "sa-east-1";
      FunctionRegion2["UsEast1"] = "us-east-1";
      FunctionRegion2["UsWest1"] = "us-west-1";
      FunctionRegion2["UsWest2"] = "us-west-2";
    })(FunctionRegion || (exports2.FunctionRegion = FunctionRegion = {}));
  }
});

// netlify/functions/node_modules/@supabase/functions-js/dist/main/FunctionsClient.js
var require_FunctionsClient = __commonJS({
  "netlify/functions/node_modules/@supabase/functions-js/dist/main/FunctionsClient.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FunctionsClient = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var helper_1 = require_helper();
    var types_1 = require_types();
    var FunctionsClient = class {
      /**
       * Creates a new Functions client bound to an Edge Functions URL.
       *
       * @example
       * ```ts
       * import { FunctionsClient, FunctionRegion } from '@supabase/functions-js'
       *
       * const functions = new FunctionsClient('https://xyzcompany.supabase.co/functions/v1', {
       *   headers: { apikey: 'public-anon-key' },
       *   region: FunctionRegion.UsEast1,
       * })
       * ```
       */
      constructor(url, { headers = {}, customFetch, region = types_1.FunctionRegion.Any } = {}) {
        this.url = url;
        this.headers = headers;
        this.region = region;
        this.fetch = (0, helper_1.resolveFetch)(customFetch);
      }
      /**
       * Updates the authorization header
       * @param token - the new jwt token sent in the authorisation header
       * @example
       * ```ts
       * functions.setAuth(session.access_token)
       * ```
       */
      setAuth(token) {
        this.headers.Authorization = `Bearer ${token}`;
      }
      /**
       * Invokes a function
       * @param functionName - The name of the Function to invoke.
       * @param options - Options for invoking the Function.
       * @example
       * ```ts
       * const { data, error } = await functions.invoke('hello-world', {
       *   body: { name: 'Ada' },
       * })
       * ```
       */
      invoke(functionName_1) {
        return tslib_1.__awaiter(this, arguments, void 0, function* (functionName, options = {}) {
          var _a;
          let timeoutId;
          let timeoutController;
          try {
            const { headers, method, body: functionArgs, signal, timeout } = options;
            let _headers = {};
            let { region } = options;
            if (!region) {
              region = this.region;
            }
            const url = new URL(`${this.url}/${functionName}`);
            if (region && region !== "any") {
              _headers["x-region"] = region;
              url.searchParams.set("forceFunctionRegion", region);
            }
            let body;
            if (functionArgs && (headers && !Object.prototype.hasOwnProperty.call(headers, "Content-Type") || !headers)) {
              if (typeof Blob !== "undefined" && functionArgs instanceof Blob || functionArgs instanceof ArrayBuffer) {
                _headers["Content-Type"] = "application/octet-stream";
                body = functionArgs;
              } else if (typeof functionArgs === "string") {
                _headers["Content-Type"] = "text/plain";
                body = functionArgs;
              } else if (typeof FormData !== "undefined" && functionArgs instanceof FormData) {
                body = functionArgs;
              } else {
                _headers["Content-Type"] = "application/json";
                body = JSON.stringify(functionArgs);
              }
            } else {
              if (functionArgs && typeof functionArgs !== "string" && !(typeof Blob !== "undefined" && functionArgs instanceof Blob) && !(functionArgs instanceof ArrayBuffer) && !(typeof FormData !== "undefined" && functionArgs instanceof FormData)) {
                body = JSON.stringify(functionArgs);
              } else {
                body = functionArgs;
              }
            }
            let effectiveSignal = signal;
            if (timeout) {
              timeoutController = new AbortController();
              timeoutId = setTimeout(() => timeoutController.abort(), timeout);
              if (signal) {
                effectiveSignal = timeoutController.signal;
                signal.addEventListener("abort", () => timeoutController.abort());
              } else {
                effectiveSignal = timeoutController.signal;
              }
            }
            const response = yield this.fetch(url.toString(), {
              method: method || "POST",
              // headers priority is (high to low):
              // 1. invoke-level headers
              // 2. client-level headers
              // 3. default Content-Type header
              headers: Object.assign(Object.assign(Object.assign({}, _headers), this.headers), headers),
              body,
              signal: effectiveSignal
            }).catch((fetchError) => {
              throw new types_1.FunctionsFetchError(fetchError);
            });
            const isRelayError = response.headers.get("x-relay-error");
            if (isRelayError && isRelayError === "true") {
              throw new types_1.FunctionsRelayError(response);
            }
            if (!response.ok) {
              throw new types_1.FunctionsHttpError(response);
            }
            let responseType = ((_a = response.headers.get("Content-Type")) !== null && _a !== void 0 ? _a : "text/plain").split(";")[0].trim();
            let data;
            if (responseType === "application/json") {
              data = yield response.json();
            } else if (responseType === "application/octet-stream" || responseType === "application/pdf") {
              data = yield response.blob();
            } else if (responseType === "text/event-stream") {
              data = response;
            } else if (responseType === "multipart/form-data") {
              data = yield response.formData();
            } else {
              data = yield response.text();
            }
            return { data, error: null, response };
          } catch (error) {
            return {
              data: null,
              error,
              response: error instanceof types_1.FunctionsHttpError || error instanceof types_1.FunctionsRelayError ? error.context : void 0
            };
          } finally {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
        });
      }
    };
    exports2.FunctionsClient = FunctionsClient;
  }
});

// netlify/functions/node_modules/@supabase/functions-js/dist/main/index.js
var require_main = __commonJS({
  "netlify/functions/node_modules/@supabase/functions-js/dist/main/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FunctionRegion = exports2.FunctionsRelayError = exports2.FunctionsHttpError = exports2.FunctionsFetchError = exports2.FunctionsError = exports2.FunctionsClient = void 0;
    var FunctionsClient_1 = require_FunctionsClient();
    Object.defineProperty(exports2, "FunctionsClient", { enumerable: true, get: function() {
      return FunctionsClient_1.FunctionsClient;
    } });
    var types_1 = require_types();
    Object.defineProperty(exports2, "FunctionsError", { enumerable: true, get: function() {
      return types_1.FunctionsError;
    } });
    Object.defineProperty(exports2, "FunctionsFetchError", { enumerable: true, get: function() {
      return types_1.FunctionsFetchError;
    } });
    Object.defineProperty(exports2, "FunctionsHttpError", { enumerable: true, get: function() {
      return types_1.FunctionsHttpError;
    } });
    Object.defineProperty(exports2, "FunctionsRelayError", { enumerable: true, get: function() {
      return types_1.FunctionsRelayError;
    } });
    Object.defineProperty(exports2, "FunctionRegion", { enumerable: true, get: function() {
      return types_1.FunctionRegion;
    } });
  }
});

// netlify/functions/node_modules/@supabase/postgrest-js/dist/index.cjs
var require_dist = __commonJS({
  "netlify/functions/node_modules/@supabase/postgrest-js/dist/index.cjs"(exports2) {
    Object.defineProperty(exports2, "__esModule", { value: true });
    var PostgrestError = class extends Error {
      /**
      * @example
      * ```ts
      * import PostgrestError from '@supabase/postgrest-js'
      *
      * throw new PostgrestError({
      *   message: 'Row level security prevented the request',
      *   details: 'RLS denied the insert',
      *   hint: 'Check your policies',
      *   code: 'PGRST301',
      * })
      * ```
      */
      constructor(context) {
        super(context.message);
        this.name = "PostgrestError";
        this.details = context.details;
        this.hint = context.hint;
        this.code = context.code;
      }
    };
    var PostgrestBuilder = class {
      /**
      * Creates a builder configured for a specific PostgREST request.
      *
      * @example
      * ```ts
      * import PostgrestQueryBuilder from '@supabase/postgrest-js'
      *
      * const builder = new PostgrestQueryBuilder(
      *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
      *   { headers: new Headers({ apikey: 'public-anon-key' }) }
      * )
      * ```
      */
      constructor(builder) {
        var _builder$shouldThrowO, _builder$isMaybeSingl, _builder$urlLengthLim;
        this.shouldThrowOnError = false;
        this.method = builder.method;
        this.url = builder.url;
        this.headers = new Headers(builder.headers);
        this.schema = builder.schema;
        this.body = builder.body;
        this.shouldThrowOnError = (_builder$shouldThrowO = builder.shouldThrowOnError) !== null && _builder$shouldThrowO !== void 0 ? _builder$shouldThrowO : false;
        this.signal = builder.signal;
        this.isMaybeSingle = (_builder$isMaybeSingl = builder.isMaybeSingle) !== null && _builder$isMaybeSingl !== void 0 ? _builder$isMaybeSingl : false;
        this.urlLengthLimit = (_builder$urlLengthLim = builder.urlLengthLimit) !== null && _builder$urlLengthLim !== void 0 ? _builder$urlLengthLim : 8e3;
        if (builder.fetch) this.fetch = builder.fetch;
        else this.fetch = fetch;
      }
      /**
      * If there's an error with the query, throwOnError will reject the promise by
      * throwing the error instead of returning it as part of a successful response.
      *
      * {@link https://github.com/supabase/supabase-js/issues/92}
      */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /**
      * Set an HTTP header for the request.
      */
      setHeader(name, value) {
        this.headers = new Headers(this.headers);
        this.headers.set(name, value);
        return this;
      }
      then(onfulfilled, onrejected) {
        var _this = this;
        if (this.schema === void 0) {
        } else if (["GET", "HEAD"].includes(this.method)) this.headers.set("Accept-Profile", this.schema);
        else this.headers.set("Content-Profile", this.schema);
        if (this.method !== "GET" && this.method !== "HEAD") this.headers.set("Content-Type", "application/json");
        const _fetch = this.fetch;
        let res = _fetch(this.url.toString(), {
          method: this.method,
          headers: this.headers,
          body: JSON.stringify(this.body),
          signal: this.signal
        }).then(async (res$1) => {
          let error = null;
          let data = null;
          let count = null;
          let status = res$1.status;
          let statusText = res$1.statusText;
          if (res$1.ok) {
            var _this$headers$get2, _res$headers$get;
            if (_this.method !== "HEAD") {
              var _this$headers$get;
              const body = await res$1.text();
              if (body === "") {
              } else if (_this.headers.get("Accept") === "text/csv") data = body;
              else if (_this.headers.get("Accept") && ((_this$headers$get = _this.headers.get("Accept")) === null || _this$headers$get === void 0 ? void 0 : _this$headers$get.includes("application/vnd.pgrst.plan+text"))) data = body;
              else data = JSON.parse(body);
            }
            const countHeader = (_this$headers$get2 = _this.headers.get("Prefer")) === null || _this$headers$get2 === void 0 ? void 0 : _this$headers$get2.match(/count=(exact|planned|estimated)/);
            const contentRange = (_res$headers$get = res$1.headers.get("content-range")) === null || _res$headers$get === void 0 ? void 0 : _res$headers$get.split("/");
            if (countHeader && contentRange && contentRange.length > 1) count = parseInt(contentRange[1]);
            if (_this.isMaybeSingle && _this.method === "GET" && Array.isArray(data)) if (data.length > 1) {
              error = {
                code: "PGRST116",
                details: `Results contain ${data.length} rows, application/vnd.pgrst.object+json requires 1 row`,
                hint: null,
                message: "JSON object requested, multiple (or no) rows returned"
              };
              data = null;
              count = null;
              status = 406;
              statusText = "Not Acceptable";
            } else if (data.length === 1) data = data[0];
            else data = null;
          } else {
            var _error$details;
            const body = await res$1.text();
            try {
              error = JSON.parse(body);
              if (Array.isArray(error) && res$1.status === 404) {
                data = [];
                error = null;
                status = 200;
                statusText = "OK";
              }
            } catch (_unused) {
              if (res$1.status === 404 && body === "") {
                status = 204;
                statusText = "No Content";
              } else error = { message: body };
            }
            if (error && _this.isMaybeSingle && (error === null || error === void 0 || (_error$details = error.details) === null || _error$details === void 0 ? void 0 : _error$details.includes("0 rows"))) {
              error = null;
              status = 200;
              statusText = "OK";
            }
            if (error && _this.shouldThrowOnError) throw new PostgrestError(error);
          }
          return {
            error,
            data,
            count,
            status,
            statusText
          };
        });
        if (!this.shouldThrowOnError) res = res.catch((fetchError) => {
          var _fetchError$name2;
          let errorDetails = "";
          let hint = "";
          let code = "";
          const cause = fetchError === null || fetchError === void 0 ? void 0 : fetchError.cause;
          if (cause) {
            var _cause$message, _cause$code, _fetchError$name, _cause$name;
            const causeMessage = (_cause$message = cause === null || cause === void 0 ? void 0 : cause.message) !== null && _cause$message !== void 0 ? _cause$message : "";
            const causeCode = (_cause$code = cause === null || cause === void 0 ? void 0 : cause.code) !== null && _cause$code !== void 0 ? _cause$code : "";
            errorDetails = `${(_fetchError$name = fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) !== null && _fetchError$name !== void 0 ? _fetchError$name : "FetchError"}: ${fetchError === null || fetchError === void 0 ? void 0 : fetchError.message}`;
            errorDetails += `

Caused by: ${(_cause$name = cause === null || cause === void 0 ? void 0 : cause.name) !== null && _cause$name !== void 0 ? _cause$name : "Error"}: ${causeMessage}`;
            if (causeCode) errorDetails += ` (${causeCode})`;
            if (cause === null || cause === void 0 ? void 0 : cause.stack) errorDetails += `
${cause.stack}`;
          } else {
            var _fetchError$stack;
            errorDetails = (_fetchError$stack = fetchError === null || fetchError === void 0 ? void 0 : fetchError.stack) !== null && _fetchError$stack !== void 0 ? _fetchError$stack : "";
          }
          const urlLength = this.url.toString().length;
          if ((fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) === "AbortError" || (fetchError === null || fetchError === void 0 ? void 0 : fetchError.code) === "ABORT_ERR") {
            code = "";
            hint = "Request was aborted (timeout or manual cancellation)";
            if (urlLength > this.urlLengthLimit) hint += `. Note: Your request URL is ${urlLength} characters, which may exceed server limits. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [many IDs])), consider using an RPC function to pass values server-side.`;
          } else if ((cause === null || cause === void 0 ? void 0 : cause.name) === "HeadersOverflowError" || (cause === null || cause === void 0 ? void 0 : cause.code) === "UND_ERR_HEADERS_OVERFLOW") {
            code = "";
            hint = "HTTP headers exceeded server limits (typically 16KB)";
            if (urlLength > this.urlLengthLimit) hint += `. Your request URL is ${urlLength} characters. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [200+ IDs])), consider using an RPC function instead.`;
          }
          return {
            error: {
              message: `${(_fetchError$name2 = fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) !== null && _fetchError$name2 !== void 0 ? _fetchError$name2 : "FetchError"}: ${fetchError === null || fetchError === void 0 ? void 0 : fetchError.message}`,
              details: errorDetails,
              hint,
              code
            },
            data: null,
            count: null,
            status: 0,
            statusText: ""
          };
        });
        return res.then(onfulfilled, onrejected);
      }
      /**
      * Override the type of the returned `data`.
      *
      * @typeParam NewResult - The new result type to override with
      * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
      */
      returns() {
        return this;
      }
      /**
      * Override the type of the returned `data` field in the response.
      *
      * @typeParam NewResult - The new type to cast the response data to
      * @typeParam Options - Optional type configuration (defaults to { merge: true })
      * @typeParam Options.merge - When true, merges the new type with existing return type. When false, replaces the existing types entirely (defaults to true)
      * @example
      * ```typescript
      * // Merge with existing types (default behavior)
      * const query = supabase
      *   .from('users')
      *   .select()
      *   .overrideTypes<{ custom_field: string }>()
      *
      * // Replace existing types completely
      * const replaceQuery = supabase
      *   .from('users')
      *   .select()
      *   .overrideTypes<{ id: number; name: string }, { merge: false }>()
      * ```
      * @returns A PostgrestBuilder instance with the new type
      */
      overrideTypes() {
        return this;
      }
    };
    var PostgrestTransformBuilder = class extends PostgrestBuilder {
      /**
      * Perform a SELECT on the query result.
      *
      * By default, `.insert()`, `.update()`, `.upsert()`, and `.delete()` do not
      * return modified rows. By calling this method, modified rows are returned in
      * `data`.
      *
      * @param columns - The columns to retrieve, separated by commas
      */
      select(columns) {
        let quoted = false;
        const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
          if (/\s/.test(c) && !quoted) return "";
          if (c === '"') quoted = !quoted;
          return c;
        }).join("");
        this.url.searchParams.set("select", cleanedColumns);
        this.headers.append("Prefer", "return=representation");
        return this;
      }
      /**
      * Order the query result by `column`.
      *
      * You can call this method multiple times to order by multiple columns.
      *
      * You can order referenced tables, but it only affects the ordering of the
      * parent table if you use `!inner` in the query.
      *
      * @param column - The column to order by
      * @param options - Named parameters
      * @param options.ascending - If `true`, the result will be in ascending order
      * @param options.nullsFirst - If `true`, `null`s appear first. If `false`,
      * `null`s appear last.
      * @param options.referencedTable - Set this to order a referenced table by
      * its columns
      * @param options.foreignTable - Deprecated, use `options.referencedTable`
      * instead
      */
      order(column, { ascending = true, nullsFirst, foreignTable, referencedTable = foreignTable } = {}) {
        const key = referencedTable ? `${referencedTable}.order` : "order";
        const existingOrder = this.url.searchParams.get(key);
        this.url.searchParams.set(key, `${existingOrder ? `${existingOrder},` : ""}${column}.${ascending ? "asc" : "desc"}${nullsFirst === void 0 ? "" : nullsFirst ? ".nullsfirst" : ".nullslast"}`);
        return this;
      }
      /**
      * Limit the query result by `count`.
      *
      * @param count - The maximum number of rows to return
      * @param options - Named parameters
      * @param options.referencedTable - Set this to limit rows of referenced
      * tables instead of the parent table
      * @param options.foreignTable - Deprecated, use `options.referencedTable`
      * instead
      */
      limit(count, { foreignTable, referencedTable = foreignTable } = {}) {
        const key = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
        this.url.searchParams.set(key, `${count}`);
        return this;
      }
      /**
      * Limit the query result by starting at an offset `from` and ending at the offset `to`.
      * Only records within this range are returned.
      * This respects the query order and if there is no order clause the range could behave unexpectedly.
      * The `from` and `to` values are 0-based and inclusive: `range(1, 3)` will include the second, third
      * and fourth rows of the query.
      *
      * @param from - The starting index from which to limit the result
      * @param to - The last index to which to limit the result
      * @param options - Named parameters
      * @param options.referencedTable - Set this to limit rows of referenced
      * tables instead of the parent table
      * @param options.foreignTable - Deprecated, use `options.referencedTable`
      * instead
      */
      range(from, to, { foreignTable, referencedTable = foreignTable } = {}) {
        const keyOffset = typeof referencedTable === "undefined" ? "offset" : `${referencedTable}.offset`;
        const keyLimit = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
        this.url.searchParams.set(keyOffset, `${from}`);
        this.url.searchParams.set(keyLimit, `${to - from + 1}`);
        return this;
      }
      /**
      * Set the AbortSignal for the fetch request.
      *
      * @param signal - The AbortSignal to use for the fetch request
      */
      abortSignal(signal) {
        this.signal = signal;
        return this;
      }
      /**
      * Return `data` as a single object instead of an array of objects.
      *
      * Query result must be one row (e.g. using `.limit(1)`), otherwise this
      * returns an error.
      */
      single() {
        this.headers.set("Accept", "application/vnd.pgrst.object+json");
        return this;
      }
      /**
      * Return `data` as a single object instead of an array of objects.
      *
      * Query result must be zero or one row (e.g. using `.limit(1)`), otherwise
      * this returns an error.
      */
      maybeSingle() {
        if (this.method === "GET") this.headers.set("Accept", "application/json");
        else this.headers.set("Accept", "application/vnd.pgrst.object+json");
        this.isMaybeSingle = true;
        return this;
      }
      /**
      * Return `data` as a string in CSV format.
      */
      csv() {
        this.headers.set("Accept", "text/csv");
        return this;
      }
      /**
      * Return `data` as an object in [GeoJSON](https://geojson.org) format.
      */
      geojson() {
        this.headers.set("Accept", "application/geo+json");
        return this;
      }
      /**
      * Return `data` as the EXPLAIN plan for the query.
      *
      * You need to enable the
      * [db_plan_enabled](https://supabase.com/docs/guides/database/debugging-performance#enabling-explain)
      * setting before using this method.
      *
      * @param options - Named parameters
      *
      * @param options.analyze - If `true`, the query will be executed and the
      * actual run time will be returned
      *
      * @param options.verbose - If `true`, the query identifier will be returned
      * and `data` will include the output columns of the query
      *
      * @param options.settings - If `true`, include information on configuration
      * parameters that affect query planning
      *
      * @param options.buffers - If `true`, include information on buffer usage
      *
      * @param options.wal - If `true`, include information on WAL record generation
      *
      * @param options.format - The format of the output, can be `"text"` (default)
      * or `"json"`
      */
      explain({ analyze = false, verbose = false, settings = false, buffers = false, wal = false, format = "text" } = {}) {
        var _this$headers$get;
        const options = [
          analyze ? "analyze" : null,
          verbose ? "verbose" : null,
          settings ? "settings" : null,
          buffers ? "buffers" : null,
          wal ? "wal" : null
        ].filter(Boolean).join("|");
        const forMediatype = (_this$headers$get = this.headers.get("Accept")) !== null && _this$headers$get !== void 0 ? _this$headers$get : "application/json";
        this.headers.set("Accept", `application/vnd.pgrst.plan+${format}; for="${forMediatype}"; options=${options};`);
        if (format === "json") return this;
        else return this;
      }
      /**
      * Rollback the query.
      *
      * `data` will still be returned, but the query is not committed.
      */
      rollback() {
        this.headers.append("Prefer", "tx=rollback");
        return this;
      }
      /**
      * Override the type of the returned `data`.
      *
      * @typeParam NewResult - The new result type to override with
      * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
      */
      returns() {
        return this;
      }
      /**
      * Set the maximum number of rows that can be affected by the query.
      * Only available in PostgREST v13+ and only works with PATCH and DELETE methods.
      *
      * @param value - The maximum number of rows that can be affected
      */
      maxAffected(value) {
        this.headers.append("Prefer", "handling=strict");
        this.headers.append("Prefer", `max-affected=${value}`);
        return this;
      }
    };
    var PostgrestReservedCharsRegexp = /* @__PURE__ */ new RegExp("[,()]");
    var PostgrestFilterBuilder = class extends PostgrestTransformBuilder {
      /**
      * Match only rows where `column` is equal to `value`.
      *
      * To check if the value of `column` is NULL, you should use `.is()` instead.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      eq(column, value) {
        this.url.searchParams.append(column, `eq.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is not equal to `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      neq(column, value) {
        this.url.searchParams.append(column, `neq.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is greater than `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      gt(column, value) {
        this.url.searchParams.append(column, `gt.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is greater than or equal to `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      gte(column, value) {
        this.url.searchParams.append(column, `gte.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is less than `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      lt(column, value) {
        this.url.searchParams.append(column, `lt.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is less than or equal to `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      lte(column, value) {
        this.url.searchParams.append(column, `lte.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` matches `pattern` case-sensitively.
      *
      * @param column - The column to filter on
      * @param pattern - The pattern to match with
      */
      like(column, pattern) {
        this.url.searchParams.append(column, `like.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` matches all of `patterns` case-sensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      likeAllOf(column, patterns) {
        this.url.searchParams.append(column, `like(all).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches any of `patterns` case-sensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      likeAnyOf(column, patterns) {
        this.url.searchParams.append(column, `like(any).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches `pattern` case-insensitively.
      *
      * @param column - The column to filter on
      * @param pattern - The pattern to match with
      */
      ilike(column, pattern) {
        this.url.searchParams.append(column, `ilike.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` matches all of `patterns` case-insensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      ilikeAllOf(column, patterns) {
        this.url.searchParams.append(column, `ilike(all).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches any of `patterns` case-insensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      ilikeAnyOf(column, patterns) {
        this.url.searchParams.append(column, `ilike(any).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches the PostgreSQL regex `pattern`
      * case-sensitively (using the `~` operator).
      *
      * @param column - The column to filter on
      * @param pattern - The PostgreSQL regular expression pattern to match with
      */
      regexMatch(column, pattern) {
        this.url.searchParams.append(column, `match.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` matches the PostgreSQL regex `pattern`
      * case-insensitively (using the `~*` operator).
      *
      * @param column - The column to filter on
      * @param pattern - The PostgreSQL regular expression pattern to match with
      */
      regexIMatch(column, pattern) {
        this.url.searchParams.append(column, `imatch.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` IS `value`.
      *
      * For non-boolean columns, this is only relevant for checking if the value of
      * `column` is NULL by setting `value` to `null`.
      *
      * For boolean columns, you can also set `value` to `true` or `false` and it
      * will behave the same way as `.eq()`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      is(column, value) {
        this.url.searchParams.append(column, `is.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` IS DISTINCT FROM `value`.
      *
      * Unlike `.neq()`, this treats `NULL` as a comparable value. Two `NULL` values
      * are considered equal (not distinct), and comparing `NULL` with any non-NULL
      * value returns true (distinct).
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      isDistinct(column, value) {
        this.url.searchParams.append(column, `isdistinct.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is included in the `values` array.
      *
      * @param column - The column to filter on
      * @param values - The values array to filter with
      */
      in(column, values) {
        const cleanedValues = Array.from(new Set(values)).map((s) => {
          if (typeof s === "string" && PostgrestReservedCharsRegexp.test(s)) return `"${s}"`;
          else return `${s}`;
        }).join(",");
        this.url.searchParams.append(column, `in.(${cleanedValues})`);
        return this;
      }
      /**
      * Match only rows where `column` is NOT included in the `values` array.
      *
      * @param column - The column to filter on
      * @param values - The values array to filter with
      */
      notIn(column, values) {
        const cleanedValues = Array.from(new Set(values)).map((s) => {
          if (typeof s === "string" && PostgrestReservedCharsRegexp.test(s)) return `"${s}"`;
          else return `${s}`;
        }).join(",");
        this.url.searchParams.append(column, `not.in.(${cleanedValues})`);
        return this;
      }
      /**
      * Only relevant for jsonb, array, and range columns. Match only rows where
      * `column` contains every element appearing in `value`.
      *
      * @param column - The jsonb, array, or range column to filter on
      * @param value - The jsonb, array, or range value to filter with
      */
      contains(column, value) {
        if (typeof value === "string") this.url.searchParams.append(column, `cs.${value}`);
        else if (Array.isArray(value)) this.url.searchParams.append(column, `cs.{${value.join(",")}}`);
        else this.url.searchParams.append(column, `cs.${JSON.stringify(value)}`);
        return this;
      }
      /**
      * Only relevant for jsonb, array, and range columns. Match only rows where
      * every element appearing in `column` is contained by `value`.
      *
      * @param column - The jsonb, array, or range column to filter on
      * @param value - The jsonb, array, or range value to filter with
      */
      containedBy(column, value) {
        if (typeof value === "string") this.url.searchParams.append(column, `cd.${value}`);
        else if (Array.isArray(value)) this.url.searchParams.append(column, `cd.{${value.join(",")}}`);
        else this.url.searchParams.append(column, `cd.${JSON.stringify(value)}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is greater than any element in `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeGt(column, range) {
        this.url.searchParams.append(column, `sr.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is either contained in `range` or greater than any element in
      * `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeGte(column, range) {
        this.url.searchParams.append(column, `nxl.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is less than any element in `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeLt(column, range) {
        this.url.searchParams.append(column, `sl.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is either contained in `range` or less than any element in
      * `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeLte(column, range) {
        this.url.searchParams.append(column, `nxr.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where `column` is
      * mutually exclusive to `range` and there can be no element between the two
      * ranges.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeAdjacent(column, range) {
        this.url.searchParams.append(column, `adj.${range}`);
        return this;
      }
      /**
      * Only relevant for array and range columns. Match only rows where
      * `column` and `value` have an element in common.
      *
      * @param column - The array or range column to filter on
      * @param value - The array or range value to filter with
      */
      overlaps(column, value) {
        if (typeof value === "string") this.url.searchParams.append(column, `ov.${value}`);
        else this.url.searchParams.append(column, `ov.{${value.join(",")}}`);
        return this;
      }
      /**
      * Only relevant for text and tsvector columns. Match only rows where
      * `column` matches the query string in `query`.
      *
      * @param column - The text or tsvector column to filter on
      * @param query - The query text to match with
      * @param options - Named parameters
      * @param options.config - The text search configuration to use
      * @param options.type - Change how the `query` text is interpreted
      */
      textSearch(column, query, { config, type } = {}) {
        let typePart = "";
        if (type === "plain") typePart = "pl";
        else if (type === "phrase") typePart = "ph";
        else if (type === "websearch") typePart = "w";
        const configPart = config === void 0 ? "" : `(${config})`;
        this.url.searchParams.append(column, `${typePart}fts${configPart}.${query}`);
        return this;
      }
      /**
      * Match only rows where each column in `query` keys is equal to its
      * associated value. Shorthand for multiple `.eq()`s.
      *
      * @param query - The object to filter with, with column names as keys mapped
      * to their filter values
      */
      match(query) {
        Object.entries(query).forEach(([column, value]) => {
          this.url.searchParams.append(column, `eq.${value}`);
        });
        return this;
      }
      /**
      * Match only rows which doesn't satisfy the filter.
      *
      * Unlike most filters, `opearator` and `value` are used as-is and need to
      * follow [PostgREST
      * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
      * to make sure they are properly sanitized.
      *
      * @param column - The column to filter on
      * @param operator - The operator to be negated to filter with, following
      * PostgREST syntax
      * @param value - The value to filter with, following PostgREST syntax
      */
      not(column, operator, value) {
        this.url.searchParams.append(column, `not.${operator}.${value}`);
        return this;
      }
      /**
      * Match only rows which satisfy at least one of the filters.
      *
      * Unlike most filters, `filters` is used as-is and needs to follow [PostgREST
      * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
      * to make sure it's properly sanitized.
      *
      * It's currently not possible to do an `.or()` filter across multiple tables.
      *
      * @param filters - The filters to use, following PostgREST syntax
      * @param options - Named parameters
      * @param options.referencedTable - Set this to filter on referenced tables
      * instead of the parent table
      * @param options.foreignTable - Deprecated, use `referencedTable` instead
      */
      or(filters, { foreignTable, referencedTable = foreignTable } = {}) {
        const key = referencedTable ? `${referencedTable}.or` : "or";
        this.url.searchParams.append(key, `(${filters})`);
        return this;
      }
      /**
      * Match only rows which satisfy the filter. This is an escape hatch - you
      * should use the specific filter methods wherever possible.
      *
      * Unlike most filters, `opearator` and `value` are used as-is and need to
      * follow [PostgREST
      * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
      * to make sure they are properly sanitized.
      *
      * @param column - The column to filter on
      * @param operator - The operator to filter with, following PostgREST syntax
      * @param value - The value to filter with, following PostgREST syntax
      */
      filter(column, operator, value) {
        this.url.searchParams.append(column, `${operator}.${value}`);
        return this;
      }
    };
    var PostgrestQueryBuilder = class {
      /**
      * Creates a query builder scoped to a Postgres table or view.
      *
      * @example
      * ```ts
      * import PostgrestQueryBuilder from '@supabase/postgrest-js'
      *
      * const query = new PostgrestQueryBuilder(
      *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
      *   { headers: { apikey: 'public-anon-key' } }
      * )
      * ```
      */
      constructor(url, { headers = {}, schema, fetch: fetch$1, urlLengthLimit = 8e3 }) {
        this.url = url;
        this.headers = new Headers(headers);
        this.schema = schema;
        this.fetch = fetch$1;
        this.urlLengthLimit = urlLengthLimit;
      }
      /**
      * Clone URL and headers to prevent shared state between operations.
      */
      cloneRequestState() {
        return {
          url: new URL(this.url.toString()),
          headers: new Headers(this.headers)
        };
      }
      /**
      * Perform a SELECT query on the table or view.
      *
      * @param columns - The columns to retrieve, separated by commas. Columns can be renamed when returned with `customName:columnName`
      *
      * @param options - Named parameters
      *
      * @param options.head - When set to `true`, `data` will not be returned.
      * Useful if you only need the count.
      *
      * @param options.count - Count algorithm to use to count rows in the table or view.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @remarks
      * When using `count` with `.range()` or `.limit()`, the returned `count` is the total number of rows
      * that match your filters, not the number of rows in the current page. Use this to build pagination UI.
      */
      select(columns, options) {
        const { head = false, count } = options !== null && options !== void 0 ? options : {};
        const method = head ? "HEAD" : "GET";
        let quoted = false;
        const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
          if (/\s/.test(c) && !quoted) return "";
          if (c === '"') quoted = !quoted;
          return c;
        }).join("");
        const { url, headers } = this.cloneRequestState();
        url.searchParams.set("select", cleanedColumns);
        if (count) headers.append("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          fetch: this.fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform an INSERT into the table or view.
      *
      * By default, inserted rows are not returned. To return it, chain the call
      * with `.select()`.
      *
      * @param values - The values to insert. Pass an object to insert a single row
      * or an array to insert multiple rows.
      *
      * @param options - Named parameters
      *
      * @param options.count - Count algorithm to use to count inserted rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @param options.defaultToNull - Make missing fields default to `null`.
      * Otherwise, use the default value for the column. Only applies for bulk
      * inserts.
      */
      insert(values, { count, defaultToNull = true } = {}) {
        var _this$fetch;
        const method = "POST";
        const { url, headers } = this.cloneRequestState();
        if (count) headers.append("Prefer", `count=${count}`);
        if (!defaultToNull) headers.append("Prefer", `missing=default`);
        if (Array.isArray(values)) {
          const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
          if (columns.length > 0) {
            const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
            url.searchParams.set("columns", uniqueColumns.join(","));
          }
        }
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          body: values,
          fetch: (_this$fetch = this.fetch) !== null && _this$fetch !== void 0 ? _this$fetch : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform an UPSERT on the table or view. Depending on the column(s) passed
      * to `onConflict`, `.upsert()` allows you to perform the equivalent of
      * `.insert()` if a row with the corresponding `onConflict` columns doesn't
      * exist, or if it does exist, perform an alternative action depending on
      * `ignoreDuplicates`.
      *
      * By default, upserted rows are not returned. To return it, chain the call
      * with `.select()`.
      *
      * @param values - The values to upsert with. Pass an object to upsert a
      * single row or an array to upsert multiple rows.
      *
      * @param options - Named parameters
      *
      * @param options.onConflict - Comma-separated UNIQUE column(s) to specify how
      * duplicate rows are determined. Two rows are duplicates if all the
      * `onConflict` columns are equal.
      *
      * @param options.ignoreDuplicates - If `true`, duplicate rows are ignored. If
      * `false`, duplicate rows are merged with existing rows.
      *
      * @param options.count - Count algorithm to use to count upserted rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @param options.defaultToNull - Make missing fields default to `null`.
      * Otherwise, use the default value for the column. This only applies when
      * inserting new rows, not when merging with existing rows under
      * `ignoreDuplicates: false`. This also only applies when doing bulk upserts.
      *
      * @example Upsert a single row using a unique key
      * ```ts
      * // Upserting a single row, overwriting based on the 'username' unique column
      * const { data, error } = await supabase
      *   .from('users')
      *   .upsert({ username: 'supabot' }, { onConflict: 'username' })
      *
      * // Example response:
      * // {
      * //   data: [
      * //     { id: 4, message: 'bar', username: 'supabot' }
      * //   ],
      * //   error: null
      * // }
      * ```
      *
      * @example Upsert with conflict resolution and exact row counting
      * ```ts
      * // Upserting and returning exact count
      * const { data, error, count } = await supabase
      *   .from('users')
      *   .upsert(
      *     {
      *       id: 3,
      *       message: 'foo',
      *       username: 'supabot'
      *     },
      *     {
      *       onConflict: 'username',
      *       count: 'exact'
      *     }
      *   )
      *
      * // Example response:
      * // {
      * //   data: [
      * //     {
      * //       id: 42,
      * //       handle: "saoirse",
      * //       display_name: "Saoirse"
      * //     }
      * //   ],
      * //   count: 1,
      * //   error: null
      * // }
      * ```
      */
      upsert(values, { onConflict, ignoreDuplicates = false, count, defaultToNull = true } = {}) {
        var _this$fetch2;
        const method = "POST";
        const { url, headers } = this.cloneRequestState();
        headers.append("Prefer", `resolution=${ignoreDuplicates ? "ignore" : "merge"}-duplicates`);
        if (onConflict !== void 0) url.searchParams.set("on_conflict", onConflict);
        if (count) headers.append("Prefer", `count=${count}`);
        if (!defaultToNull) headers.append("Prefer", "missing=default");
        if (Array.isArray(values)) {
          const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
          if (columns.length > 0) {
            const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
            url.searchParams.set("columns", uniqueColumns.join(","));
          }
        }
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          body: values,
          fetch: (_this$fetch2 = this.fetch) !== null && _this$fetch2 !== void 0 ? _this$fetch2 : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform an UPDATE on the table or view.
      *
      * By default, updated rows are not returned. To return it, chain the call
      * with `.select()` after filters.
      *
      * @param values - The values to update with
      *
      * @param options - Named parameters
      *
      * @param options.count - Count algorithm to use to count updated rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      */
      update(values, { count } = {}) {
        var _this$fetch3;
        const method = "PATCH";
        const { url, headers } = this.cloneRequestState();
        if (count) headers.append("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          body: values,
          fetch: (_this$fetch3 = this.fetch) !== null && _this$fetch3 !== void 0 ? _this$fetch3 : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform a DELETE on the table or view.
      *
      * By default, deleted rows are not returned. To return it, chain the call
      * with `.select()` after filters.
      *
      * @param options - Named parameters
      *
      * @param options.count - Count algorithm to use to count deleted rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      */
      delete({ count } = {}) {
        var _this$fetch4;
        const method = "DELETE";
        const { url, headers } = this.cloneRequestState();
        if (count) headers.append("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          fetch: (_this$fetch4 = this.fetch) !== null && _this$fetch4 !== void 0 ? _this$fetch4 : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
    };
    function _typeof(o) {
      "@babel/helpers - typeof";
      return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
        return typeof o$1;
      } : function(o$1) {
        return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
      }, _typeof(o);
    }
    function toPrimitive(t, r) {
      if ("object" != _typeof(t) || !t) return t;
      var e = t[Symbol.toPrimitive];
      if (void 0 !== e) {
        var i = e.call(t, r || "default");
        if ("object" != _typeof(i)) return i;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return ("string" === r ? String : Number)(t);
    }
    function toPropertyKey(t) {
      var i = toPrimitive(t, "string");
      return "symbol" == _typeof(i) ? i : i + "";
    }
    function _defineProperty(e, r, t) {
      return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
        value: t,
        enumerable: true,
        configurable: true,
        writable: true
      }) : e[r] = t, e;
    }
    function ownKeys2(e, r) {
      var t = Object.keys(e);
      if (Object.getOwnPropertySymbols) {
        var o = Object.getOwnPropertySymbols(e);
        r && (o = o.filter(function(r$1) {
          return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
        })), t.push.apply(t, o);
      }
      return t;
    }
    function _objectSpread2(e) {
      for (var r = 1; r < arguments.length; r++) {
        var t = null != arguments[r] ? arguments[r] : {};
        r % 2 ? ownKeys2(Object(t), true).forEach(function(r$1) {
          _defineProperty(e, r$1, t[r$1]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys2(Object(t)).forEach(function(r$1) {
          Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
        });
      }
      return e;
    }
    var PostgrestClient = class PostgrestClient2 {
      /**
      * Creates a PostgREST client.
      *
      * @param url - URL of the PostgREST endpoint
      * @param options - Named parameters
      * @param options.headers - Custom headers
      * @param options.schema - Postgres schema to switch to
      * @param options.fetch - Custom fetch
      * @param options.timeout - Optional timeout in milliseconds for all requests. When set, requests will automatically abort after this duration to prevent indefinite hangs.
      * @param options.urlLengthLimit - Maximum URL length in characters before warnings/errors are triggered. Defaults to 8000.
      * @example
      * ```ts
      * import PostgrestClient from '@supabase/postgrest-js'
      *
      * const postgrest = new PostgrestClient('https://xyzcompany.supabase.co/rest/v1', {
      *   headers: { apikey: 'public-anon-key' },
      *   schema: 'public',
      *   timeout: 30000, // 30 second timeout
      * })
      * ```
      */
      constructor(url, { headers = {}, schema, fetch: fetch$1, timeout, urlLengthLimit = 8e3 } = {}) {
        this.url = url;
        this.headers = new Headers(headers);
        this.schemaName = schema;
        this.urlLengthLimit = urlLengthLimit;
        const originalFetch = fetch$1 !== null && fetch$1 !== void 0 ? fetch$1 : globalThis.fetch;
        if (timeout !== void 0 && timeout > 0) this.fetch = (input, init) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          const existingSignal = init === null || init === void 0 ? void 0 : init.signal;
          if (existingSignal) {
            if (existingSignal.aborted) {
              clearTimeout(timeoutId);
              return originalFetch(input, init);
            }
            const abortHandler = () => {
              clearTimeout(timeoutId);
              controller.abort();
            };
            existingSignal.addEventListener("abort", abortHandler, { once: true });
            return originalFetch(input, _objectSpread2(_objectSpread2({}, init), {}, { signal: controller.signal })).finally(() => {
              clearTimeout(timeoutId);
              existingSignal.removeEventListener("abort", abortHandler);
            });
          }
          return originalFetch(input, _objectSpread2(_objectSpread2({}, init), {}, { signal: controller.signal })).finally(() => clearTimeout(timeoutId));
        };
        else this.fetch = originalFetch;
      }
      /**
      * Perform a query on a table or a view.
      *
      * @param relation - The table or view name to query
      */
      from(relation) {
        if (!relation || typeof relation !== "string" || relation.trim() === "") throw new Error("Invalid relation name: relation must be a non-empty string.");
        return new PostgrestQueryBuilder(new URL(`${this.url}/${relation}`), {
          headers: new Headers(this.headers),
          schema: this.schemaName,
          fetch: this.fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Select a schema to query or perform an function (rpc) call.
      *
      * The schema needs to be on the list of exposed schemas inside Supabase.
      *
      * @param schema - The schema to query
      */
      schema(schema) {
        return new PostgrestClient2(this.url, {
          headers: this.headers,
          schema,
          fetch: this.fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform a function call.
      *
      * @param fn - The function name to call
      * @param args - The arguments to pass to the function call
      * @param options - Named parameters
      * @param options.head - When set to `true`, `data` will not be returned.
      * Useful if you only need the count.
      * @param options.get - When set to `true`, the function will be called with
      * read-only access mode.
      * @param options.count - Count algorithm to use to count rows returned by the
      * function. Only applicable for [set-returning
      * functions](https://www.postgresql.org/docs/current/functions-srf.html).
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @example
      * ```ts
      * // For cross-schema functions where type inference fails, use overrideTypes:
      * const { data } = await supabase
      *   .schema('schema_b')
      *   .rpc('function_a', {})
      *   .overrideTypes<{ id: string; user_id: string }[]>()
      * ```
      */
      rpc(fn, args = {}, { head = false, get = false, count } = {}) {
        var _this$fetch;
        let method;
        const url = new URL(`${this.url}/rpc/${fn}`);
        let body;
        const _isObject = (v) => v !== null && typeof v === "object" && (!Array.isArray(v) || v.some(_isObject));
        const _hasObjectArg = head && Object.values(args).some(_isObject);
        if (_hasObjectArg) {
          method = "POST";
          body = args;
        } else if (head || get) {
          method = head ? "HEAD" : "GET";
          Object.entries(args).filter(([_, value]) => value !== void 0).map(([name, value]) => [name, Array.isArray(value) ? `{${value.join(",")}}` : `${value}`]).forEach(([name, value]) => {
            url.searchParams.append(name, value);
          });
        } else {
          method = "POST";
          body = args;
        }
        const headers = new Headers(this.headers);
        if (_hasObjectArg) headers.set("Prefer", count ? `count=${count},return=minimal` : "return=minimal");
        else if (count) headers.set("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schemaName,
          body,
          fetch: (_this$fetch = this.fetch) !== null && _this$fetch !== void 0 ? _this$fetch : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
    };
    var src_default = {
      PostgrestClient,
      PostgrestQueryBuilder,
      PostgrestFilterBuilder,
      PostgrestTransformBuilder,
      PostgrestBuilder,
      PostgrestError
    };
    exports2.PostgrestBuilder = PostgrestBuilder;
    exports2.PostgrestClient = PostgrestClient;
    exports2.PostgrestError = PostgrestError;
    exports2.PostgrestFilterBuilder = PostgrestFilterBuilder;
    exports2.PostgrestQueryBuilder = PostgrestQueryBuilder;
    exports2.PostgrestTransformBuilder = PostgrestTransformBuilder;
    exports2.default = src_default;
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/websocket-factory.js
var require_websocket_factory = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/websocket-factory.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WebSocketFactory = void 0;
    var WebSocketFactory = class {
      /**
       * Static-only utility – prevent instantiation.
       */
      constructor() {
      }
      static detectEnvironment() {
        var _a;
        if (typeof WebSocket !== "undefined") {
          return { type: "native", constructor: WebSocket };
        }
        if (typeof globalThis !== "undefined" && typeof globalThis.WebSocket !== "undefined") {
          return { type: "native", constructor: globalThis.WebSocket };
        }
        if (typeof global !== "undefined" && typeof global.WebSocket !== "undefined") {
          return { type: "native", constructor: global.WebSocket };
        }
        if (typeof globalThis !== "undefined" && typeof globalThis.WebSocketPair !== "undefined" && typeof globalThis.WebSocket === "undefined") {
          return {
            type: "cloudflare",
            error: "Cloudflare Workers detected. WebSocket clients are not supported in Cloudflare Workers.",
            workaround: "Use Cloudflare Workers WebSocket API for server-side WebSocket handling, or deploy to a different runtime."
          };
        }
        if (typeof globalThis !== "undefined" && globalThis.EdgeRuntime || typeof navigator !== "undefined" && ((_a = navigator.userAgent) === null || _a === void 0 ? void 0 : _a.includes("Vercel-Edge"))) {
          return {
            type: "unsupported",
            error: "Edge runtime detected (Vercel Edge/Netlify Edge). WebSockets are not supported in edge functions.",
            workaround: "Use serverless functions or a different deployment target for WebSocket functionality."
          };
        }
        const _process = globalThis["process"];
        if (_process) {
          const processVersions = _process["versions"];
          if (processVersions && processVersions["node"]) {
            const versionString = processVersions["node"];
            const nodeVersion = parseInt(versionString.replace(/^v/, "").split(".")[0]);
            if (nodeVersion >= 22) {
              if (typeof globalThis.WebSocket !== "undefined") {
                return { type: "native", constructor: globalThis.WebSocket };
              }
              return {
                type: "unsupported",
                error: `Node.js ${nodeVersion} detected but native WebSocket not found.`,
                workaround: "Provide a WebSocket implementation via the transport option."
              };
            }
            return {
              type: "unsupported",
              error: `Node.js ${nodeVersion} detected without native WebSocket support.`,
              workaround: 'For Node.js < 22, install "ws" package and provide it via the transport option:\nimport ws from "ws"\nnew RealtimeClient(url, { transport: ws })'
            };
          }
        }
        return {
          type: "unsupported",
          error: "Unknown JavaScript runtime without WebSocket support.",
          workaround: "Ensure you're running in a supported environment (browser, Node.js, Deno) or provide a custom WebSocket implementation."
        };
      }
      /**
       * Returns the best available WebSocket constructor for the current runtime.
       *
       * @example
       * ```ts
       * const WS = WebSocketFactory.getWebSocketConstructor()
       * const socket = new WS('wss://realtime.supabase.co/socket')
       * ```
       */
      static getWebSocketConstructor() {
        const env = this.detectEnvironment();
        if (env.constructor) {
          return env.constructor;
        }
        let errorMessage = env.error || "WebSocket not supported in this environment.";
        if (env.workaround) {
          errorMessage += `

Suggested solution: ${env.workaround}`;
        }
        throw new Error(errorMessage);
      }
      /**
       * Creates a WebSocket using the detected constructor.
       *
       * @example
       * ```ts
       * const socket = WebSocketFactory.createWebSocket('wss://realtime.supabase.co/socket')
       * ```
       */
      static createWebSocket(url, protocols) {
        const WS = this.getWebSocketConstructor();
        return new WS(url, protocols);
      }
      /**
       * Detects whether the runtime can establish WebSocket connections.
       *
       * @example
       * ```ts
       * if (!WebSocketFactory.isWebSocketSupported()) {
       *   console.warn('Falling back to long polling')
       * }
       * ```
       */
      static isWebSocketSupported() {
        try {
          const env = this.detectEnvironment();
          return env.type === "native" || env.type === "ws";
        } catch (_a) {
          return false;
        }
      }
    };
    exports2.WebSocketFactory = WebSocketFactory;
    exports2.default = WebSocketFactory;
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/version.js
var require_version = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/version.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.version = void 0;
    exports2.version = "2.95.3";
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/constants.js
var require_constants = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CONNECTION_STATE = exports2.TRANSPORTS = exports2.CHANNEL_EVENTS = exports2.CHANNEL_STATES = exports2.SOCKET_STATES = exports2.MAX_PUSH_BUFFER_SIZE = exports2.WS_CLOSE_NORMAL = exports2.DEFAULT_TIMEOUT = exports2.VERSION = exports2.DEFAULT_VSN = exports2.VSN_2_0_0 = exports2.VSN_1_0_0 = exports2.DEFAULT_VERSION = void 0;
    var version_1 = require_version();
    exports2.DEFAULT_VERSION = `realtime-js/${version_1.version}`;
    exports2.VSN_1_0_0 = "1.0.0";
    exports2.VSN_2_0_0 = "2.0.0";
    exports2.DEFAULT_VSN = exports2.VSN_2_0_0;
    exports2.VERSION = version_1.version;
    exports2.DEFAULT_TIMEOUT = 1e4;
    exports2.WS_CLOSE_NORMAL = 1e3;
    exports2.MAX_PUSH_BUFFER_SIZE = 100;
    var SOCKET_STATES;
    (function(SOCKET_STATES2) {
      SOCKET_STATES2[SOCKET_STATES2["connecting"] = 0] = "connecting";
      SOCKET_STATES2[SOCKET_STATES2["open"] = 1] = "open";
      SOCKET_STATES2[SOCKET_STATES2["closing"] = 2] = "closing";
      SOCKET_STATES2[SOCKET_STATES2["closed"] = 3] = "closed";
    })(SOCKET_STATES || (exports2.SOCKET_STATES = SOCKET_STATES = {}));
    var CHANNEL_STATES;
    (function(CHANNEL_STATES2) {
      CHANNEL_STATES2["closed"] = "closed";
      CHANNEL_STATES2["errored"] = "errored";
      CHANNEL_STATES2["joined"] = "joined";
      CHANNEL_STATES2["joining"] = "joining";
      CHANNEL_STATES2["leaving"] = "leaving";
    })(CHANNEL_STATES || (exports2.CHANNEL_STATES = CHANNEL_STATES = {}));
    var CHANNEL_EVENTS;
    (function(CHANNEL_EVENTS2) {
      CHANNEL_EVENTS2["close"] = "phx_close";
      CHANNEL_EVENTS2["error"] = "phx_error";
      CHANNEL_EVENTS2["join"] = "phx_join";
      CHANNEL_EVENTS2["reply"] = "phx_reply";
      CHANNEL_EVENTS2["leave"] = "phx_leave";
      CHANNEL_EVENTS2["access_token"] = "access_token";
    })(CHANNEL_EVENTS || (exports2.CHANNEL_EVENTS = CHANNEL_EVENTS = {}));
    var TRANSPORTS;
    (function(TRANSPORTS2) {
      TRANSPORTS2["websocket"] = "websocket";
    })(TRANSPORTS || (exports2.TRANSPORTS = TRANSPORTS = {}));
    var CONNECTION_STATE;
    (function(CONNECTION_STATE2) {
      CONNECTION_STATE2["Connecting"] = "connecting";
      CONNECTION_STATE2["Open"] = "open";
      CONNECTION_STATE2["Closing"] = "closing";
      CONNECTION_STATE2["Closed"] = "closed";
    })(CONNECTION_STATE || (exports2.CONNECTION_STATE = CONNECTION_STATE = {}));
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/serializer.js
var require_serializer = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/serializer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var Serializer = class {
      constructor(allowedMetadataKeys) {
        this.HEADER_LENGTH = 1;
        this.USER_BROADCAST_PUSH_META_LENGTH = 6;
        this.KINDS = { userBroadcastPush: 3, userBroadcast: 4 };
        this.BINARY_ENCODING = 0;
        this.JSON_ENCODING = 1;
        this.BROADCAST_EVENT = "broadcast";
        this.allowedMetadataKeys = [];
        this.allowedMetadataKeys = allowedMetadataKeys !== null && allowedMetadataKeys !== void 0 ? allowedMetadataKeys : [];
      }
      encode(msg, callback) {
        if (msg.event === this.BROADCAST_EVENT && !(msg.payload instanceof ArrayBuffer) && typeof msg.payload.event === "string") {
          return callback(this._binaryEncodeUserBroadcastPush(msg));
        }
        let payload = [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload];
        return callback(JSON.stringify(payload));
      }
      _binaryEncodeUserBroadcastPush(message) {
        var _a;
        if (this._isArrayBuffer((_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload)) {
          return this._encodeBinaryUserBroadcastPush(message);
        } else {
          return this._encodeJsonUserBroadcastPush(message);
        }
      }
      _encodeBinaryUserBroadcastPush(message) {
        var _a, _b;
        const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : new ArrayBuffer(0);
        return this._encodeUserBroadcastPush(message, this.BINARY_ENCODING, userPayload);
      }
      _encodeJsonUserBroadcastPush(message) {
        var _a, _b;
        const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : {};
        const encoder = new TextEncoder();
        const encodedUserPayload = encoder.encode(JSON.stringify(userPayload)).buffer;
        return this._encodeUserBroadcastPush(message, this.JSON_ENCODING, encodedUserPayload);
      }
      _encodeUserBroadcastPush(message, encodingType, encodedPayload) {
        var _a, _b;
        const topic = message.topic;
        const ref = (_a = message.ref) !== null && _a !== void 0 ? _a : "";
        const joinRef = (_b = message.join_ref) !== null && _b !== void 0 ? _b : "";
        const userEvent = message.payload.event;
        const rest = this.allowedMetadataKeys ? this._pick(message.payload, this.allowedMetadataKeys) : {};
        const metadata = Object.keys(rest).length === 0 ? "" : JSON.stringify(rest);
        if (joinRef.length > 255) {
          throw new Error(`joinRef length ${joinRef.length} exceeds maximum of 255`);
        }
        if (ref.length > 255) {
          throw new Error(`ref length ${ref.length} exceeds maximum of 255`);
        }
        if (topic.length > 255) {
          throw new Error(`topic length ${topic.length} exceeds maximum of 255`);
        }
        if (userEvent.length > 255) {
          throw new Error(`userEvent length ${userEvent.length} exceeds maximum of 255`);
        }
        if (metadata.length > 255) {
          throw new Error(`metadata length ${metadata.length} exceeds maximum of 255`);
        }
        const metaLength = this.USER_BROADCAST_PUSH_META_LENGTH + joinRef.length + ref.length + topic.length + userEvent.length + metadata.length;
        const header = new ArrayBuffer(this.HEADER_LENGTH + metaLength);
        let view = new DataView(header);
        let offset = 0;
        view.setUint8(offset++, this.KINDS.userBroadcastPush);
        view.setUint8(offset++, joinRef.length);
        view.setUint8(offset++, ref.length);
        view.setUint8(offset++, topic.length);
        view.setUint8(offset++, userEvent.length);
        view.setUint8(offset++, metadata.length);
        view.setUint8(offset++, encodingType);
        Array.from(joinRef, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(ref, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(topic, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(userEvent, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(metadata, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        var combined = new Uint8Array(header.byteLength + encodedPayload.byteLength);
        combined.set(new Uint8Array(header), 0);
        combined.set(new Uint8Array(encodedPayload), header.byteLength);
        return combined.buffer;
      }
      decode(rawPayload, callback) {
        if (this._isArrayBuffer(rawPayload)) {
          let result = this._binaryDecode(rawPayload);
          return callback(result);
        }
        if (typeof rawPayload === "string") {
          const jsonPayload = JSON.parse(rawPayload);
          const [join_ref, ref, topic, event, payload] = jsonPayload;
          return callback({ join_ref, ref, topic, event, payload });
        }
        return callback({});
      }
      _binaryDecode(buffer) {
        const view = new DataView(buffer);
        const kind = view.getUint8(0);
        const decoder = new TextDecoder();
        switch (kind) {
          case this.KINDS.userBroadcast:
            return this._decodeUserBroadcast(buffer, view, decoder);
        }
      }
      _decodeUserBroadcast(buffer, view, decoder) {
        const topicSize = view.getUint8(1);
        const userEventSize = view.getUint8(2);
        const metadataSize = view.getUint8(3);
        const payloadEncoding = view.getUint8(4);
        let offset = this.HEADER_LENGTH + 4;
        const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
        offset = offset + topicSize;
        const userEvent = decoder.decode(buffer.slice(offset, offset + userEventSize));
        offset = offset + userEventSize;
        const metadata = decoder.decode(buffer.slice(offset, offset + metadataSize));
        offset = offset + metadataSize;
        const payload = buffer.slice(offset, buffer.byteLength);
        const parsedPayload = payloadEncoding === this.JSON_ENCODING ? JSON.parse(decoder.decode(payload)) : payload;
        const data = {
          type: this.BROADCAST_EVENT,
          event: userEvent,
          payload: parsedPayload
        };
        if (metadataSize > 0) {
          data["meta"] = JSON.parse(metadata);
        }
        return { join_ref: null, ref: null, topic, event: this.BROADCAST_EVENT, payload: data };
      }
      _isArrayBuffer(buffer) {
        var _a;
        return buffer instanceof ArrayBuffer || ((_a = buffer === null || buffer === void 0 ? void 0 : buffer.constructor) === null || _a === void 0 ? void 0 : _a.name) === "ArrayBuffer";
      }
      _pick(obj, keys) {
        if (!obj || typeof obj !== "object") {
          return {};
        }
        return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
      }
    };
    exports2.default = Serializer;
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/timer.js
var require_timer = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/timer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var Timer = class {
      constructor(callback, timerCalc) {
        this.callback = callback;
        this.timerCalc = timerCalc;
        this.timer = void 0;
        this.tries = 0;
        this.callback = callback;
        this.timerCalc = timerCalc;
      }
      reset() {
        this.tries = 0;
        clearTimeout(this.timer);
        this.timer = void 0;
      }
      // Cancels any previous scheduleTimeout and schedules callback
      scheduleTimeout() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.tries = this.tries + 1;
          this.callback();
        }, this.timerCalc(this.tries + 1));
      }
    };
    exports2.default = Timer;
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/transformers.js
var require_transformers = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/transformers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.httpEndpointURL = exports2.toTimestampString = exports2.toArray = exports2.toJson = exports2.toNumber = exports2.toBoolean = exports2.convertCell = exports2.convertColumn = exports2.convertChangeData = exports2.PostgresTypes = void 0;
    var PostgresTypes;
    (function(PostgresTypes2) {
      PostgresTypes2["abstime"] = "abstime";
      PostgresTypes2["bool"] = "bool";
      PostgresTypes2["date"] = "date";
      PostgresTypes2["daterange"] = "daterange";
      PostgresTypes2["float4"] = "float4";
      PostgresTypes2["float8"] = "float8";
      PostgresTypes2["int2"] = "int2";
      PostgresTypes2["int4"] = "int4";
      PostgresTypes2["int4range"] = "int4range";
      PostgresTypes2["int8"] = "int8";
      PostgresTypes2["int8range"] = "int8range";
      PostgresTypes2["json"] = "json";
      PostgresTypes2["jsonb"] = "jsonb";
      PostgresTypes2["money"] = "money";
      PostgresTypes2["numeric"] = "numeric";
      PostgresTypes2["oid"] = "oid";
      PostgresTypes2["reltime"] = "reltime";
      PostgresTypes2["text"] = "text";
      PostgresTypes2["time"] = "time";
      PostgresTypes2["timestamp"] = "timestamp";
      PostgresTypes2["timestamptz"] = "timestamptz";
      PostgresTypes2["timetz"] = "timetz";
      PostgresTypes2["tsrange"] = "tsrange";
      PostgresTypes2["tstzrange"] = "tstzrange";
    })(PostgresTypes || (exports2.PostgresTypes = PostgresTypes = {}));
    var convertChangeData = (columns, record, options = {}) => {
      var _a;
      const skipTypes = (_a = options.skipTypes) !== null && _a !== void 0 ? _a : [];
      if (!record) {
        return {};
      }
      return Object.keys(record).reduce((acc, rec_key) => {
        acc[rec_key] = (0, exports2.convertColumn)(rec_key, columns, record, skipTypes);
        return acc;
      }, {});
    };
    exports2.convertChangeData = convertChangeData;
    var convertColumn = (columnName, columns, record, skipTypes) => {
      const column = columns.find((x) => x.name === columnName);
      const colType = column === null || column === void 0 ? void 0 : column.type;
      const value = record[columnName];
      if (colType && !skipTypes.includes(colType)) {
        return (0, exports2.convertCell)(colType, value);
      }
      return noop(value);
    };
    exports2.convertColumn = convertColumn;
    var convertCell = (type, value) => {
      if (type.charAt(0) === "_") {
        const dataType = type.slice(1, type.length);
        return (0, exports2.toArray)(value, dataType);
      }
      switch (type) {
        case PostgresTypes.bool:
          return (0, exports2.toBoolean)(value);
        case PostgresTypes.float4:
        case PostgresTypes.float8:
        case PostgresTypes.int2:
        case PostgresTypes.int4:
        case PostgresTypes.int8:
        case PostgresTypes.numeric:
        case PostgresTypes.oid:
          return (0, exports2.toNumber)(value);
        case PostgresTypes.json:
        case PostgresTypes.jsonb:
          return (0, exports2.toJson)(value);
        case PostgresTypes.timestamp:
          return (0, exports2.toTimestampString)(value);
        // Format to be consistent with PostgREST
        case PostgresTypes.abstime:
        // To allow users to cast it based on Timezone
        case PostgresTypes.date:
        // To allow users to cast it based on Timezone
        case PostgresTypes.daterange:
        case PostgresTypes.int4range:
        case PostgresTypes.int8range:
        case PostgresTypes.money:
        case PostgresTypes.reltime:
        // To allow users to cast it based on Timezone
        case PostgresTypes.text:
        case PostgresTypes.time:
        // To allow users to cast it based on Timezone
        case PostgresTypes.timestamptz:
        // To allow users to cast it based on Timezone
        case PostgresTypes.timetz:
        // To allow users to cast it based on Timezone
        case PostgresTypes.tsrange:
        case PostgresTypes.tstzrange:
          return noop(value);
        default:
          return noop(value);
      }
    };
    exports2.convertCell = convertCell;
    var noop = (value) => {
      return value;
    };
    var toBoolean = (value) => {
      switch (value) {
        case "t":
          return true;
        case "f":
          return false;
        default:
          return value;
      }
    };
    exports2.toBoolean = toBoolean;
    var toNumber = (value) => {
      if (typeof value === "string") {
        const parsedValue = parseFloat(value);
        if (!Number.isNaN(parsedValue)) {
          return parsedValue;
        }
      }
      return value;
    };
    exports2.toNumber = toNumber;
    var toJson = (value) => {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch (_a) {
          return value;
        }
      }
      return value;
    };
    exports2.toJson = toJson;
    var toArray = (value, type) => {
      if (typeof value !== "string") {
        return value;
      }
      const lastIdx = value.length - 1;
      const closeBrace = value[lastIdx];
      const openBrace = value[0];
      if (openBrace === "{" && closeBrace === "}") {
        let arr;
        const valTrim = value.slice(1, lastIdx);
        try {
          arr = JSON.parse("[" + valTrim + "]");
        } catch (_) {
          arr = valTrim ? valTrim.split(",") : [];
        }
        return arr.map((val) => (0, exports2.convertCell)(type, val));
      }
      return value;
    };
    exports2.toArray = toArray;
    var toTimestampString = (value) => {
      if (typeof value === "string") {
        return value.replace(" ", "T");
      }
      return value;
    };
    exports2.toTimestampString = toTimestampString;
    var httpEndpointURL = (socketUrl) => {
      const wsUrl = new URL(socketUrl);
      wsUrl.protocol = wsUrl.protocol.replace(/^ws/i, "http");
      wsUrl.pathname = wsUrl.pathname.replace(/\/+$/, "").replace(/\/socket\/websocket$/i, "").replace(/\/socket$/i, "").replace(/\/websocket$/i, "");
      if (wsUrl.pathname === "" || wsUrl.pathname === "/") {
        wsUrl.pathname = "/api/broadcast";
      } else {
        wsUrl.pathname = wsUrl.pathname + "/api/broadcast";
      }
      return wsUrl.href;
    };
    exports2.httpEndpointURL = httpEndpointURL;
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/push.js
var require_push = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/lib/push.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var constants_1 = require_constants();
    var Push = class {
      /**
       * Initializes the Push
       *
       * @param channel The Channel
       * @param event The event, for example `"phx_join"`
       * @param payload The payload, for example `{user_id: 123}`
       * @param timeout The push timeout in milliseconds
       */
      constructor(channel, event, payload = {}, timeout = constants_1.DEFAULT_TIMEOUT) {
        this.channel = channel;
        this.event = event;
        this.payload = payload;
        this.timeout = timeout;
        this.sent = false;
        this.timeoutTimer = void 0;
        this.ref = "";
        this.receivedResp = null;
        this.recHooks = [];
        this.refEvent = null;
      }
      resend(timeout) {
        this.timeout = timeout;
        this._cancelRefEvent();
        this.ref = "";
        this.refEvent = null;
        this.receivedResp = null;
        this.sent = false;
        this.send();
      }
      send() {
        if (this._hasReceived("timeout")) {
          return;
        }
        this.startTimeout();
        this.sent = true;
        this.channel.socket.push({
          topic: this.channel.topic,
          event: this.event,
          payload: this.payload,
          ref: this.ref,
          join_ref: this.channel._joinRef()
        });
      }
      updatePayload(payload) {
        this.payload = Object.assign(Object.assign({}, this.payload), payload);
      }
      receive(status, callback) {
        var _a;
        if (this._hasReceived(status)) {
          callback((_a = this.receivedResp) === null || _a === void 0 ? void 0 : _a.response);
        }
        this.recHooks.push({ status, callback });
        return this;
      }
      startTimeout() {
        if (this.timeoutTimer) {
          return;
        }
        this.ref = this.channel.socket._makeRef();
        this.refEvent = this.channel._replyEventName(this.ref);
        const callback = (payload) => {
          this._cancelRefEvent();
          this._cancelTimeout();
          this.receivedResp = payload;
          this._matchReceive(payload);
        };
        this.channel._on(this.refEvent, {}, callback);
        this.timeoutTimer = setTimeout(() => {
          this.trigger("timeout", {});
        }, this.timeout);
      }
      trigger(status, response) {
        if (this.refEvent)
          this.channel._trigger(this.refEvent, { status, response });
      }
      destroy() {
        this._cancelRefEvent();
        this._cancelTimeout();
      }
      _cancelRefEvent() {
        if (!this.refEvent) {
          return;
        }
        this.channel._off(this.refEvent, {});
      }
      _cancelTimeout() {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = void 0;
      }
      _matchReceive({ status, response }) {
        this.recHooks.filter((h) => h.status === status).forEach((h) => h.callback(response));
      }
      _hasReceived(status) {
        return this.receivedResp && this.receivedResp.status === status;
      }
    };
    exports2.default = Push;
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/RealtimePresence.js
var require_RealtimePresence = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/RealtimePresence.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.REALTIME_PRESENCE_LISTEN_EVENTS = void 0;
    var REALTIME_PRESENCE_LISTEN_EVENTS;
    (function(REALTIME_PRESENCE_LISTEN_EVENTS2) {
      REALTIME_PRESENCE_LISTEN_EVENTS2["SYNC"] = "sync";
      REALTIME_PRESENCE_LISTEN_EVENTS2["JOIN"] = "join";
      REALTIME_PRESENCE_LISTEN_EVENTS2["LEAVE"] = "leave";
    })(REALTIME_PRESENCE_LISTEN_EVENTS || (exports2.REALTIME_PRESENCE_LISTEN_EVENTS = REALTIME_PRESENCE_LISTEN_EVENTS = {}));
    var RealtimePresence = class _RealtimePresence {
      /**
       * Creates a Presence helper that keeps the local presence state in sync with the server.
       *
       * @param channel - The realtime channel to bind to.
       * @param opts - Optional custom event names, e.g. `{ events: { state: 'state', diff: 'diff' } }`.
       *
       * @example
       * ```ts
       * const presence = new RealtimePresence(channel)
       *
       * channel.on('presence', ({ event, key }) => {
       *   console.log(`Presence ${event} on ${key}`)
       * })
       * ```
       */
      constructor(channel, opts) {
        this.channel = channel;
        this.state = {};
        this.pendingDiffs = [];
        this.joinRef = null;
        this.enabled = false;
        this.caller = {
          onJoin: () => {
          },
          onLeave: () => {
          },
          onSync: () => {
          }
        };
        const events = (opts === null || opts === void 0 ? void 0 : opts.events) || {
          state: "presence_state",
          diff: "presence_diff"
        };
        this.channel._on(events.state, {}, (newState) => {
          const { onJoin, onLeave, onSync } = this.caller;
          this.joinRef = this.channel._joinRef();
          this.state = _RealtimePresence.syncState(this.state, newState, onJoin, onLeave);
          this.pendingDiffs.forEach((diff) => {
            this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
          });
          this.pendingDiffs = [];
          onSync();
        });
        this.channel._on(events.diff, {}, (diff) => {
          const { onJoin, onLeave, onSync } = this.caller;
          if (this.inPendingSyncState()) {
            this.pendingDiffs.push(diff);
          } else {
            this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
            onSync();
          }
        });
        this.onJoin((key, currentPresences, newPresences) => {
          this.channel._trigger("presence", {
            event: "join",
            key,
            currentPresences,
            newPresences
          });
        });
        this.onLeave((key, currentPresences, leftPresences) => {
          this.channel._trigger("presence", {
            event: "leave",
            key,
            currentPresences,
            leftPresences
          });
        });
        this.onSync(() => {
          this.channel._trigger("presence", { event: "sync" });
        });
      }
      /**
       * Used to sync the list of presences on the server with the
       * client's state.
       *
       * An optional `onJoin` and `onLeave` callback can be provided to
       * react to changes in the client's local presences across
       * disconnects and reconnects with the server.
       *
       * @internal
       */
      static syncState(currentState, newState, onJoin, onLeave) {
        const state = this.cloneDeep(currentState);
        const transformedState = this.transformState(newState);
        const joins = {};
        const leaves = {};
        this.map(state, (key, presences) => {
          if (!transformedState[key]) {
            leaves[key] = presences;
          }
        });
        this.map(transformedState, (key, newPresences) => {
          const currentPresences = state[key];
          if (currentPresences) {
            const newPresenceRefs = newPresences.map((m) => m.presence_ref);
            const curPresenceRefs = currentPresences.map((m) => m.presence_ref);
            const joinedPresences = newPresences.filter((m) => curPresenceRefs.indexOf(m.presence_ref) < 0);
            const leftPresences = currentPresences.filter((m) => newPresenceRefs.indexOf(m.presence_ref) < 0);
            if (joinedPresences.length > 0) {
              joins[key] = joinedPresences;
            }
            if (leftPresences.length > 0) {
              leaves[key] = leftPresences;
            }
          } else {
            joins[key] = newPresences;
          }
        });
        return this.syncDiff(state, { joins, leaves }, onJoin, onLeave);
      }
      /**
       * Used to sync a diff of presence join and leave events from the
       * server, as they happen.
       *
       * Like `syncState`, `syncDiff` accepts optional `onJoin` and
       * `onLeave` callbacks to react to a user joining or leaving from a
       * device.
       *
       * @internal
       */
      static syncDiff(state, diff, onJoin, onLeave) {
        const { joins, leaves } = {
          joins: this.transformState(diff.joins),
          leaves: this.transformState(diff.leaves)
        };
        if (!onJoin) {
          onJoin = () => {
          };
        }
        if (!onLeave) {
          onLeave = () => {
          };
        }
        this.map(joins, (key, newPresences) => {
          var _a;
          const currentPresences = (_a = state[key]) !== null && _a !== void 0 ? _a : [];
          state[key] = this.cloneDeep(newPresences);
          if (currentPresences.length > 0) {
            const joinedPresenceRefs = state[key].map((m) => m.presence_ref);
            const curPresences = currentPresences.filter((m) => joinedPresenceRefs.indexOf(m.presence_ref) < 0);
            state[key].unshift(...curPresences);
          }
          onJoin(key, currentPresences, newPresences);
        });
        this.map(leaves, (key, leftPresences) => {
          let currentPresences = state[key];
          if (!currentPresences)
            return;
          const presenceRefsToRemove = leftPresences.map((m) => m.presence_ref);
          currentPresences = currentPresences.filter((m) => presenceRefsToRemove.indexOf(m.presence_ref) < 0);
          state[key] = currentPresences;
          onLeave(key, currentPresences, leftPresences);
          if (currentPresences.length === 0)
            delete state[key];
        });
        return state;
      }
      /** @internal */
      static map(obj, func) {
        return Object.getOwnPropertyNames(obj).map((key) => func(key, obj[key]));
      }
      /**
       * Remove 'metas' key
       * Change 'phx_ref' to 'presence_ref'
       * Remove 'phx_ref' and 'phx_ref_prev'
       *
       * @example
       * // returns {
       *  abc123: [
       *    { presence_ref: '2', user_id: 1 },
       *    { presence_ref: '3', user_id: 2 }
       *  ]
       * }
       * RealtimePresence.transformState({
       *  abc123: {
       *    metas: [
       *      { phx_ref: '2', phx_ref_prev: '1' user_id: 1 },
       *      { phx_ref: '3', user_id: 2 }
       *    ]
       *  }
       * })
       *
       * @internal
       */
      static transformState(state) {
        state = this.cloneDeep(state);
        return Object.getOwnPropertyNames(state).reduce((newState, key) => {
          const presences = state[key];
          if ("metas" in presences) {
            newState[key] = presences.metas.map((presence) => {
              presence["presence_ref"] = presence["phx_ref"];
              delete presence["phx_ref"];
              delete presence["phx_ref_prev"];
              return presence;
            });
          } else {
            newState[key] = presences;
          }
          return newState;
        }, {});
      }
      /** @internal */
      static cloneDeep(obj) {
        return JSON.parse(JSON.stringify(obj));
      }
      /** @internal */
      onJoin(callback) {
        this.caller.onJoin = callback;
      }
      /** @internal */
      onLeave(callback) {
        this.caller.onLeave = callback;
      }
      /** @internal */
      onSync(callback) {
        this.caller.onSync = callback;
      }
      /** @internal */
      inPendingSyncState() {
        return !this.joinRef || this.joinRef !== this.channel._joinRef();
      }
    };
    exports2.default = RealtimePresence;
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.js
var require_RealtimeChannel = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.REALTIME_CHANNEL_STATES = exports2.REALTIME_SUBSCRIBE_STATES = exports2.REALTIME_LISTEN_TYPES = exports2.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var constants_1 = require_constants();
    var push_1 = tslib_1.__importDefault(require_push());
    var timer_1 = tslib_1.__importDefault(require_timer());
    var RealtimePresence_1 = tslib_1.__importDefault(require_RealtimePresence());
    var Transformers = tslib_1.__importStar(require_transformers());
    var transformers_1 = require_transformers();
    var REALTIME_POSTGRES_CHANGES_LISTEN_EVENT;
    (function(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2) {
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["ALL"] = "*";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["INSERT"] = "INSERT";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["UPDATE"] = "UPDATE";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["DELETE"] = "DELETE";
    })(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT || (exports2.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {}));
    var REALTIME_LISTEN_TYPES;
    (function(REALTIME_LISTEN_TYPES2) {
      REALTIME_LISTEN_TYPES2["BROADCAST"] = "broadcast";
      REALTIME_LISTEN_TYPES2["PRESENCE"] = "presence";
      REALTIME_LISTEN_TYPES2["POSTGRES_CHANGES"] = "postgres_changes";
      REALTIME_LISTEN_TYPES2["SYSTEM"] = "system";
    })(REALTIME_LISTEN_TYPES || (exports2.REALTIME_LISTEN_TYPES = REALTIME_LISTEN_TYPES = {}));
    var REALTIME_SUBSCRIBE_STATES;
    (function(REALTIME_SUBSCRIBE_STATES2) {
      REALTIME_SUBSCRIBE_STATES2["SUBSCRIBED"] = "SUBSCRIBED";
      REALTIME_SUBSCRIBE_STATES2["TIMED_OUT"] = "TIMED_OUT";
      REALTIME_SUBSCRIBE_STATES2["CLOSED"] = "CLOSED";
      REALTIME_SUBSCRIBE_STATES2["CHANNEL_ERROR"] = "CHANNEL_ERROR";
    })(REALTIME_SUBSCRIBE_STATES || (exports2.REALTIME_SUBSCRIBE_STATES = REALTIME_SUBSCRIBE_STATES = {}));
    exports2.REALTIME_CHANNEL_STATES = constants_1.CHANNEL_STATES;
    var RealtimeChannel = class _RealtimeChannel {
      /**
       * Creates a channel that can broadcast messages, sync presence, and listen to Postgres changes.
       *
       * The topic determines which realtime stream you are subscribing to. Config options let you
       * enable acknowledgement for broadcasts, presence tracking, or private channels.
       *
       * @example
       * ```ts
       * import RealtimeClient from '@supabase/realtime-js'
       *
       * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
       *   params: { apikey: 'public-anon-key' },
       * })
       * const channel = new RealtimeChannel('realtime:public:messages', { config: {} }, client)
       * ```
       */
      constructor(topic, params = { config: {} }, socket) {
        var _a, _b;
        this.topic = topic;
        this.params = params;
        this.socket = socket;
        this.bindings = {};
        this.state = constants_1.CHANNEL_STATES.closed;
        this.joinedOnce = false;
        this.pushBuffer = [];
        this.subTopic = topic.replace(/^realtime:/i, "");
        this.params.config = Object.assign({
          broadcast: { ack: false, self: false },
          presence: { key: "", enabled: false },
          private: false
        }, params.config);
        this.timeout = this.socket.timeout;
        this.joinPush = new push_1.default(this, constants_1.CHANNEL_EVENTS.join, this.params, this.timeout);
        this.rejoinTimer = new timer_1.default(() => this._rejoinUntilConnected(), this.socket.reconnectAfterMs);
        this.joinPush.receive("ok", () => {
          this.state = constants_1.CHANNEL_STATES.joined;
          this.rejoinTimer.reset();
          this.pushBuffer.forEach((pushEvent) => pushEvent.send());
          this.pushBuffer = [];
        });
        this._onClose(() => {
          this.rejoinTimer.reset();
          this.socket.log("channel", `close ${this.topic} ${this._joinRef()}`);
          this.state = constants_1.CHANNEL_STATES.closed;
          this.socket._remove(this);
        });
        this._onError((reason) => {
          if (this._isLeaving() || this._isClosed()) {
            return;
          }
          this.socket.log("channel", `error ${this.topic}`, reason);
          this.state = constants_1.CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this.joinPush.receive("timeout", () => {
          if (!this._isJoining()) {
            return;
          }
          this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout);
          this.state = constants_1.CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this.joinPush.receive("error", (reason) => {
          if (this._isLeaving() || this._isClosed()) {
            return;
          }
          this.socket.log("channel", `error ${this.topic}`, reason);
          this.state = constants_1.CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this._on(constants_1.CHANNEL_EVENTS.reply, {}, (payload, ref) => {
          this._trigger(this._replyEventName(ref), payload);
        });
        this.presence = new RealtimePresence_1.default(this);
        this.broadcastEndpointURL = (0, transformers_1.httpEndpointURL)(this.socket.endPoint);
        this.private = this.params.config.private || false;
        if (!this.private && ((_b = (_a = this.params.config) === null || _a === void 0 ? void 0 : _a.broadcast) === null || _b === void 0 ? void 0 : _b.replay)) {
          throw `tried to use replay on public channel '${this.topic}'. It must be a private channel.`;
        }
      }
      /** Subscribe registers your client with the server */
      subscribe(callback, timeout = this.timeout) {
        var _a, _b, _c;
        if (!this.socket.isConnected()) {
          this.socket.connect();
        }
        if (this.state == constants_1.CHANNEL_STATES.closed) {
          const { config: { broadcast, presence, private: isPrivate } } = this.params;
          const postgres_changes = (_b = (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.map((r) => r.filter)) !== null && _b !== void 0 ? _b : [];
          const presence_enabled = !!this.bindings[REALTIME_LISTEN_TYPES.PRESENCE] && this.bindings[REALTIME_LISTEN_TYPES.PRESENCE].length > 0 || ((_c = this.params.config.presence) === null || _c === void 0 ? void 0 : _c.enabled) === true;
          const accessTokenPayload = {};
          const config = {
            broadcast,
            presence: Object.assign(Object.assign({}, presence), { enabled: presence_enabled }),
            postgres_changes,
            private: isPrivate
          };
          if (this.socket.accessTokenValue) {
            accessTokenPayload.access_token = this.socket.accessTokenValue;
          }
          this._onError((e) => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, e));
          this._onClose(() => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CLOSED));
          this.updateJoinPayload(Object.assign({ config }, accessTokenPayload));
          this.joinedOnce = true;
          this._rejoin(timeout);
          this.joinPush.receive("ok", async ({ postgres_changes: postgres_changes2 }) => {
            var _a2;
            if (!this.socket._isManualToken()) {
              this.socket.setAuth();
            }
            if (postgres_changes2 === void 0) {
              callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
              return;
            } else {
              const clientPostgresBindings = this.bindings.postgres_changes;
              const bindingsLen = (_a2 = clientPostgresBindings === null || clientPostgresBindings === void 0 ? void 0 : clientPostgresBindings.length) !== null && _a2 !== void 0 ? _a2 : 0;
              const newPostgresBindings = [];
              for (let i = 0; i < bindingsLen; i++) {
                const clientPostgresBinding = clientPostgresBindings[i];
                const { filter: { event, schema, table, filter } } = clientPostgresBinding;
                const serverPostgresFilter = postgres_changes2 && postgres_changes2[i];
                if (serverPostgresFilter && serverPostgresFilter.event === event && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.schema, schema) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.table, table) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.filter, filter)) {
                  newPostgresBindings.push(Object.assign(Object.assign({}, clientPostgresBinding), { id: serverPostgresFilter.id }));
                } else {
                  this.unsubscribe();
                  this.state = constants_1.CHANNEL_STATES.errored;
                  callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
                  return;
                }
              }
              this.bindings.postgres_changes = newPostgresBindings;
              callback && callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
              return;
            }
          }).receive("error", (error) => {
            this.state = constants_1.CHANNEL_STATES.errored;
            callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error(JSON.stringify(Object.values(error).join(", ") || "error")));
            return;
          }).receive("timeout", () => {
            callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.TIMED_OUT);
            return;
          });
        }
        return this;
      }
      /**
       * Returns the current presence state for this channel.
       *
       * The shape is a map keyed by presence key (for example a user id) where each entry contains the
       * tracked metadata for that user.
       */
      presenceState() {
        return this.presence.state;
      }
      /**
       * Sends the supplied payload to the presence tracker so other subscribers can see that this
       * client is online. Use `untrack` to stop broadcasting presence for the same key.
       */
      async track(payload, opts = {}) {
        return await this.send({
          type: "presence",
          event: "track",
          payload
        }, opts.timeout || this.timeout);
      }
      /**
       * Removes the current presence state for this client.
       */
      async untrack(opts = {}) {
        return await this.send({
          type: "presence",
          event: "untrack"
        }, opts);
      }
      on(type, filter, callback) {
        if (this.state === constants_1.CHANNEL_STATES.joined && type === REALTIME_LISTEN_TYPES.PRESENCE) {
          this.socket.log("channel", `resubscribe to ${this.topic} due to change in presence callbacks on joined channel`);
          this.unsubscribe().then(async () => await this.subscribe());
        }
        return this._on(type, filter, callback);
      }
      /**
       * Sends a broadcast message explicitly via REST API.
       *
       * This method always uses the REST API endpoint regardless of WebSocket connection state.
       * Useful when you want to guarantee REST delivery or when gradually migrating from implicit REST fallback.
       *
       * @param event The name of the broadcast event
       * @param payload Payload to be sent (required)
       * @param opts Options including timeout
       * @returns Promise resolving to object with success status, and error details if failed
       */
      async httpSend(event, payload, opts = {}) {
        var _a;
        if (payload === void 0 || payload === null) {
          return Promise.reject("Payload is required for httpSend()");
        }
        const headers = {
          apikey: this.socket.apiKey ? this.socket.apiKey : "",
          "Content-Type": "application/json"
        };
        if (this.socket.accessTokenValue) {
          headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
        }
        const options = {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: [
              {
                topic: this.subTopic,
                event,
                payload,
                private: this.private
              }
            ]
          })
        };
        const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
        if (response.status === 202) {
          return { success: true };
        }
        let errorMessage = response.statusText;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody.error || errorBody.message || errorMessage;
        } catch (_b) {
        }
        return Promise.reject(new Error(errorMessage));
      }
      /**
       * Sends a message into the channel.
       *
       * @param args Arguments to send to channel
       * @param args.type The type of event to send
       * @param args.event The name of the event being sent
       * @param args.payload Payload to be sent
       * @param opts Options to be used during the send process
       */
      async send(args, opts = {}) {
        var _a, _b;
        if (!this._canPush() && args.type === "broadcast") {
          console.warn("Realtime send() is automatically falling back to REST API. This behavior will be deprecated in the future. Please use httpSend() explicitly for REST delivery.");
          const { event, payload: endpoint_payload } = args;
          const headers = {
            apikey: this.socket.apiKey ? this.socket.apiKey : "",
            "Content-Type": "application/json"
          };
          if (this.socket.accessTokenValue) {
            headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
          }
          const options = {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: [
                {
                  topic: this.subTopic,
                  event,
                  payload: endpoint_payload,
                  private: this.private
                }
              ]
            })
          };
          try {
            const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
            await ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel());
            return response.ok ? "ok" : "error";
          } catch (error) {
            if (error.name === "AbortError") {
              return "timed out";
            } else {
              return "error";
            }
          }
        } else {
          return new Promise((resolve) => {
            var _a2, _b2, _c;
            const push = this._push(args.type, args, opts.timeout || this.timeout);
            if (args.type === "broadcast" && !((_c = (_b2 = (_a2 = this.params) === null || _a2 === void 0 ? void 0 : _a2.config) === null || _b2 === void 0 ? void 0 : _b2.broadcast) === null || _c === void 0 ? void 0 : _c.ack)) {
              resolve("ok");
            }
            push.receive("ok", () => resolve("ok"));
            push.receive("error", () => resolve("error"));
            push.receive("timeout", () => resolve("timed out"));
          });
        }
      }
      /**
       * Updates the payload that will be sent the next time the channel joins (reconnects).
       * Useful for rotating access tokens or updating config without re-creating the channel.
       */
      updateJoinPayload(payload) {
        this.joinPush.updatePayload(payload);
      }
      /**
       * Leaves the channel.
       *
       * Unsubscribes from server events, and instructs channel to terminate on server.
       * Triggers onClose() hooks.
       *
       * To receive leave acknowledgements, use the a `receive` hook to bind to the server ack, ie:
       * channel.unsubscribe().receive("ok", () => alert("left!") )
       */
      unsubscribe(timeout = this.timeout) {
        this.state = constants_1.CHANNEL_STATES.leaving;
        const onClose = () => {
          this.socket.log("channel", `leave ${this.topic}`);
          this._trigger(constants_1.CHANNEL_EVENTS.close, "leave", this._joinRef());
        };
        this.joinPush.destroy();
        let leavePush = null;
        return new Promise((resolve) => {
          leavePush = new push_1.default(this, constants_1.CHANNEL_EVENTS.leave, {}, timeout);
          leavePush.receive("ok", () => {
            onClose();
            resolve("ok");
          }).receive("timeout", () => {
            onClose();
            resolve("timed out");
          }).receive("error", () => {
            resolve("error");
          });
          leavePush.send();
          if (!this._canPush()) {
            leavePush.trigger("ok", {});
          }
        }).finally(() => {
          leavePush === null || leavePush === void 0 ? void 0 : leavePush.destroy();
        });
      }
      /**
       * Teardown the channel.
       *
       * Destroys and stops related timers.
       */
      teardown() {
        this.pushBuffer.forEach((push) => push.destroy());
        this.pushBuffer = [];
        this.rejoinTimer.reset();
        this.joinPush.destroy();
        this.state = constants_1.CHANNEL_STATES.closed;
        this.bindings = {};
      }
      /** @internal */
      async _fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await this.socket.fetch(url, Object.assign(Object.assign({}, options), { signal: controller.signal }));
        clearTimeout(id);
        return response;
      }
      /** @internal */
      _push(event, payload, timeout = this.timeout) {
        if (!this.joinedOnce) {
          throw `tried to push '${event}' to '${this.topic}' before joining. Use channel.subscribe() before pushing events`;
        }
        let pushEvent = new push_1.default(this, event, payload, timeout);
        if (this._canPush()) {
          pushEvent.send();
        } else {
          this._addToPushBuffer(pushEvent);
        }
        return pushEvent;
      }
      /** @internal */
      _addToPushBuffer(pushEvent) {
        pushEvent.startTimeout();
        this.pushBuffer.push(pushEvent);
        if (this.pushBuffer.length > constants_1.MAX_PUSH_BUFFER_SIZE) {
          const removedPush = this.pushBuffer.shift();
          if (removedPush) {
            removedPush.destroy();
            this.socket.log("channel", `discarded push due to buffer overflow: ${removedPush.event}`, removedPush.payload);
          }
        }
      }
      /**
       * Overridable message hook
       *
       * Receives all events for specialized message handling before dispatching to the channel callbacks.
       * Must return the payload, modified or unmodified.
       *
       * @internal
       */
      _onMessage(_event, payload, _ref) {
        return payload;
      }
      /** @internal */
      _isMember(topic) {
        return this.topic === topic;
      }
      /** @internal */
      _joinRef() {
        return this.joinPush.ref;
      }
      /** @internal */
      _trigger(type, payload, ref) {
        var _a, _b;
        const typeLower = type.toLocaleLowerCase();
        const { close, error, leave, join } = constants_1.CHANNEL_EVENTS;
        const events = [close, error, leave, join];
        if (ref && events.indexOf(typeLower) >= 0 && ref !== this._joinRef()) {
          return;
        }
        let handledPayload = this._onMessage(typeLower, payload, ref);
        if (payload && !handledPayload) {
          throw "channel onMessage callbacks must return the payload, modified or unmodified";
        }
        if (["insert", "update", "delete"].includes(typeLower)) {
          (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.filter((bind) => {
            var _a2, _b2, _c;
            return ((_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event) === "*" || ((_c = (_b2 = bind.filter) === null || _b2 === void 0 ? void 0 : _b2.event) === null || _c === void 0 ? void 0 : _c.toLocaleLowerCase()) === typeLower;
          }).map((bind) => bind.callback(handledPayload, ref));
        } else {
          (_b = this.bindings[typeLower]) === null || _b === void 0 ? void 0 : _b.filter((bind) => {
            var _a2, _b2, _c, _d, _e, _f;
            if (["broadcast", "presence", "postgres_changes"].includes(typeLower)) {
              if ("id" in bind) {
                const bindId = bind.id;
                const bindEvent = (_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event;
                return bindId && ((_b2 = payload.ids) === null || _b2 === void 0 ? void 0 : _b2.includes(bindId)) && (bindEvent === "*" || (bindEvent === null || bindEvent === void 0 ? void 0 : bindEvent.toLocaleLowerCase()) === ((_c = payload.data) === null || _c === void 0 ? void 0 : _c.type.toLocaleLowerCase()));
              } else {
                const bindEvent = (_e = (_d = bind === null || bind === void 0 ? void 0 : bind.filter) === null || _d === void 0 ? void 0 : _d.event) === null || _e === void 0 ? void 0 : _e.toLocaleLowerCase();
                return bindEvent === "*" || bindEvent === ((_f = payload === null || payload === void 0 ? void 0 : payload.event) === null || _f === void 0 ? void 0 : _f.toLocaleLowerCase());
              }
            } else {
              return bind.type.toLocaleLowerCase() === typeLower;
            }
          }).map((bind) => {
            if (typeof handledPayload === "object" && "ids" in handledPayload) {
              const postgresChanges = handledPayload.data;
              const { schema, table, commit_timestamp, type: type2, errors } = postgresChanges;
              const enrichedPayload = {
                schema,
                table,
                commit_timestamp,
                eventType: type2,
                new: {},
                old: {},
                errors
              };
              handledPayload = Object.assign(Object.assign({}, enrichedPayload), this._getPayloadRecords(postgresChanges));
            }
            bind.callback(handledPayload, ref);
          });
        }
      }
      /** @internal */
      _isClosed() {
        return this.state === constants_1.CHANNEL_STATES.closed;
      }
      /** @internal */
      _isJoined() {
        return this.state === constants_1.CHANNEL_STATES.joined;
      }
      /** @internal */
      _isJoining() {
        return this.state === constants_1.CHANNEL_STATES.joining;
      }
      /** @internal */
      _isLeaving() {
        return this.state === constants_1.CHANNEL_STATES.leaving;
      }
      /** @internal */
      _replyEventName(ref) {
        return `chan_reply_${ref}`;
      }
      /** @internal */
      _on(type, filter, callback) {
        const typeLower = type.toLocaleLowerCase();
        const binding = {
          type: typeLower,
          filter,
          callback
        };
        if (this.bindings[typeLower]) {
          this.bindings[typeLower].push(binding);
        } else {
          this.bindings[typeLower] = [binding];
        }
        return this;
      }
      /** @internal */
      _off(type, filter) {
        const typeLower = type.toLocaleLowerCase();
        if (this.bindings[typeLower]) {
          this.bindings[typeLower] = this.bindings[typeLower].filter((bind) => {
            var _a;
            return !(((_a = bind.type) === null || _a === void 0 ? void 0 : _a.toLocaleLowerCase()) === typeLower && _RealtimeChannel.isEqual(bind.filter, filter));
          });
        }
        return this;
      }
      /** @internal */
      static isEqual(obj1, obj2) {
        if (Object.keys(obj1).length !== Object.keys(obj2).length) {
          return false;
        }
        for (const k in obj1) {
          if (obj1[k] !== obj2[k]) {
            return false;
          }
        }
        return true;
      }
      /**
       * Compares two optional filter values for equality.
       * Treats undefined, null, and empty string as equivalent empty values.
       * @internal
       */
      static isFilterValueEqual(serverValue, clientValue) {
        const normalizedServer = serverValue !== null && serverValue !== void 0 ? serverValue : void 0;
        const normalizedClient = clientValue !== null && clientValue !== void 0 ? clientValue : void 0;
        return normalizedServer === normalizedClient;
      }
      /** @internal */
      _rejoinUntilConnected() {
        this.rejoinTimer.scheduleTimeout();
        if (this.socket.isConnected()) {
          this._rejoin();
        }
      }
      /**
       * Registers a callback that will be executed when the channel closes.
       *
       * @internal
       */
      _onClose(callback) {
        this._on(constants_1.CHANNEL_EVENTS.close, {}, callback);
      }
      /**
       * Registers a callback that will be executed when the channel encounteres an error.
       *
       * @internal
       */
      _onError(callback) {
        this._on(constants_1.CHANNEL_EVENTS.error, {}, (reason) => callback(reason));
      }
      /**
       * Returns `true` if the socket is connected and the channel has been joined.
       *
       * @internal
       */
      _canPush() {
        return this.socket.isConnected() && this._isJoined();
      }
      /** @internal */
      _rejoin(timeout = this.timeout) {
        if (this._isLeaving()) {
          return;
        }
        this.socket._leaveOpenTopic(this.topic);
        this.state = constants_1.CHANNEL_STATES.joining;
        this.joinPush.resend(timeout);
      }
      /** @internal */
      _getPayloadRecords(payload) {
        const records = {
          new: {},
          old: {}
        };
        if (payload.type === "INSERT" || payload.type === "UPDATE") {
          records.new = Transformers.convertChangeData(payload.columns, payload.record);
        }
        if (payload.type === "UPDATE" || payload.type === "DELETE") {
          records.old = Transformers.convertChangeData(payload.columns, payload.old_record);
        }
        return records;
      }
    };
    exports2.default = RealtimeChannel;
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js
var require_RealtimeClient = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var websocket_factory_1 = tslib_1.__importDefault(require_websocket_factory());
    var constants_1 = require_constants();
    var serializer_1 = tslib_1.__importDefault(require_serializer());
    var timer_1 = tslib_1.__importDefault(require_timer());
    var transformers_1 = require_transformers();
    var RealtimeChannel_1 = tslib_1.__importDefault(require_RealtimeChannel());
    var noop = () => {
    };
    var CONNECTION_TIMEOUTS = {
      HEARTBEAT_INTERVAL: 25e3,
      RECONNECT_DELAY: 10,
      HEARTBEAT_TIMEOUT_FALLBACK: 100
    };
    var RECONNECT_INTERVALS = [1e3, 2e3, 5e3, 1e4];
    var DEFAULT_RECONNECT_FALLBACK = 1e4;
    var WORKER_SCRIPT = `
  addEventListener("message", (e) => {
    if (e.data.event === "start") {
      setInterval(() => postMessage({ event: "keepAlive" }), e.data.interval);
    }
  });`;
    var RealtimeClient = class {
      /**
       * Initializes the Socket.
       *
       * @param endPoint The string WebSocket endpoint, ie, "ws://example.com/socket", "wss://example.com", "/socket" (inherited host & protocol)
       * @param httpEndpoint The string HTTP endpoint, ie, "https://example.com", "/" (inherited host & protocol)
       * @param options.transport The Websocket Transport, for example WebSocket. This can be a custom implementation
       * @param options.timeout The default timeout in milliseconds to trigger push timeouts.
       * @param options.params The optional params to pass when connecting.
       * @param options.headers Deprecated: headers cannot be set on websocket connections and this option will be removed in the future.
       * @param options.heartbeatIntervalMs The millisec interval to send a heartbeat message.
       * @param options.heartbeatCallback The optional function to handle heartbeat status and latency.
       * @param options.logger The optional function for specialized logging, ie: logger: (kind, msg, data) => { console.log(`${kind}: ${msg}`, data) }
       * @param options.logLevel Sets the log level for Realtime
       * @param options.encode The function to encode outgoing messages. Defaults to JSON: (payload, callback) => callback(JSON.stringify(payload))
       * @param options.decode The function to decode incoming messages. Defaults to Serializer's decode.
       * @param options.reconnectAfterMs he optional function that returns the millsec reconnect interval. Defaults to stepped backoff off.
       * @param options.worker Use Web Worker to set a side flow. Defaults to false.
       * @param options.workerUrl The URL of the worker script. Defaults to https://realtime.supabase.com/worker.js that includes a heartbeat event call to keep the connection alive.
       * @param options.vsn The protocol version to use when connecting. Supported versions are "1.0.0" and "2.0.0". Defaults to "2.0.0".
       * @example
       * ```ts
       * import RealtimeClient from '@supabase/realtime-js'
       *
       * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
       *   params: { apikey: 'public-anon-key' },
       * })
       * client.connect()
       * ```
       */
      constructor(endPoint, options) {
        var _a;
        this.accessTokenValue = null;
        this.apiKey = null;
        this._manuallySetToken = false;
        this.channels = new Array();
        this.endPoint = "";
        this.httpEndpoint = "";
        this.headers = {};
        this.params = {};
        this.timeout = constants_1.DEFAULT_TIMEOUT;
        this.transport = null;
        this.heartbeatIntervalMs = CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL;
        this.heartbeatTimer = void 0;
        this.pendingHeartbeatRef = null;
        this.heartbeatCallback = noop;
        this.ref = 0;
        this.reconnectTimer = null;
        this.vsn = constants_1.DEFAULT_VSN;
        this.logger = noop;
        this.conn = null;
        this.sendBuffer = [];
        this.serializer = new serializer_1.default();
        this.stateChangeCallbacks = {
          open: [],
          close: [],
          error: [],
          message: []
        };
        this.accessToken = null;
        this._connectionState = "disconnected";
        this._wasManualDisconnect = false;
        this._authPromise = null;
        this._heartbeatSentAt = null;
        this._resolveFetch = (customFetch) => {
          if (customFetch) {
            return (...args) => customFetch(...args);
          }
          return (...args) => fetch(...args);
        };
        if (!((_a = options === null || options === void 0 ? void 0 : options.params) === null || _a === void 0 ? void 0 : _a.apikey)) {
          throw new Error("API key is required to connect to Realtime");
        }
        this.apiKey = options.params.apikey;
        this.endPoint = `${endPoint}/${constants_1.TRANSPORTS.websocket}`;
        this.httpEndpoint = (0, transformers_1.httpEndpointURL)(endPoint);
        this._initializeOptions(options);
        this._setupReconnectionTimer();
        this.fetch = this._resolveFetch(options === null || options === void 0 ? void 0 : options.fetch);
      }
      /**
       * Connects the socket, unless already connected.
       */
      connect() {
        if (this.isConnecting() || this.isDisconnecting() || this.conn !== null && this.isConnected()) {
          return;
        }
        this._setConnectionState("connecting");
        if (this.accessToken && !this._authPromise) {
          this._setAuthSafely("connect");
        }
        if (this.transport) {
          this.conn = new this.transport(this.endpointURL());
        } else {
          try {
            this.conn = websocket_factory_1.default.createWebSocket(this.endpointURL());
          } catch (error) {
            this._setConnectionState("disconnected");
            const errorMessage = error.message;
            if (errorMessage.includes("Node.js")) {
              throw new Error(`${errorMessage}

To use Realtime in Node.js, you need to provide a WebSocket implementation:

Option 1: Use Node.js 22+ which has native WebSocket support
Option 2: Install and provide the "ws" package:

  npm install ws

  import ws from "ws"
  const client = new RealtimeClient(url, {
    ...options,
    transport: ws
  })`);
            }
            throw new Error(`WebSocket not available: ${errorMessage}`);
          }
        }
        this._setupConnectionHandlers();
      }
      /**
       * Returns the URL of the websocket.
       * @returns string The URL of the websocket.
       */
      endpointURL() {
        return this._appendParams(this.endPoint, Object.assign({}, this.params, { vsn: this.vsn }));
      }
      /**
       * Disconnects the socket.
       *
       * @param code A numeric status code to send on disconnect.
       * @param reason A custom reason for the disconnect.
       */
      disconnect(code, reason) {
        if (this.isDisconnecting()) {
          return;
        }
        this._setConnectionState("disconnecting", true);
        if (this.conn) {
          const fallbackTimer = setTimeout(() => {
            this._setConnectionState("disconnected");
          }, 100);
          this.conn.onclose = () => {
            clearTimeout(fallbackTimer);
            this._setConnectionState("disconnected");
          };
          if (typeof this.conn.close === "function") {
            if (code) {
              this.conn.close(code, reason !== null && reason !== void 0 ? reason : "");
            } else {
              this.conn.close();
            }
          }
          this._teardownConnection();
        } else {
          this._setConnectionState("disconnected");
        }
      }
      /**
       * Returns all created channels
       */
      getChannels() {
        return this.channels;
      }
      /**
       * Unsubscribes and removes a single channel
       * @param channel A RealtimeChannel instance
       */
      async removeChannel(channel) {
        const status = await channel.unsubscribe();
        if (status === "ok") {
          this._remove(channel);
        }
        if (this.channels.length === 0) {
          this.disconnect();
        }
        return status;
      }
      /**
       * Unsubscribes and removes all channels
       */
      async removeAllChannels() {
        const values_1 = await Promise.all(this.channels.map((channel) => channel.unsubscribe()));
        this.channels = [];
        this.disconnect();
        return values_1;
      }
      /**
       * Logs the message.
       *
       * For customized logging, `this.logger` can be overridden.
       */
      log(kind, msg, data) {
        this.logger(kind, msg, data);
      }
      /**
       * Returns the current state of the socket.
       */
      connectionState() {
        switch (this.conn && this.conn.readyState) {
          case constants_1.SOCKET_STATES.connecting:
            return constants_1.CONNECTION_STATE.Connecting;
          case constants_1.SOCKET_STATES.open:
            return constants_1.CONNECTION_STATE.Open;
          case constants_1.SOCKET_STATES.closing:
            return constants_1.CONNECTION_STATE.Closing;
          default:
            return constants_1.CONNECTION_STATE.Closed;
        }
      }
      /**
       * Returns `true` is the connection is open.
       */
      isConnected() {
        return this.connectionState() === constants_1.CONNECTION_STATE.Open;
      }
      /**
       * Returns `true` if the connection is currently connecting.
       */
      isConnecting() {
        return this._connectionState === "connecting";
      }
      /**
       * Returns `true` if the connection is currently disconnecting.
       */
      isDisconnecting() {
        return this._connectionState === "disconnecting";
      }
      /**
       * Creates (or reuses) a {@link RealtimeChannel} for the provided topic.
       *
       * Topics are automatically prefixed with `realtime:` to match the Realtime service.
       * If a channel with the same topic already exists it will be returned instead of creating
       * a duplicate connection.
       */
      channel(topic, params = { config: {} }) {
        const realtimeTopic = `realtime:${topic}`;
        const exists = this.getChannels().find((c) => c.topic === realtimeTopic);
        if (!exists) {
          const chan = new RealtimeChannel_1.default(`realtime:${topic}`, params, this);
          this.channels.push(chan);
          return chan;
        } else {
          return exists;
        }
      }
      /**
       * Push out a message if the socket is connected.
       *
       * If the socket is not connected, the message gets enqueued within a local buffer, and sent out when a connection is next established.
       */
      push(data) {
        const { topic, event, payload, ref } = data;
        const callback = () => {
          this.encode(data, (result) => {
            var _a;
            (_a = this.conn) === null || _a === void 0 ? void 0 : _a.send(result);
          });
        };
        this.log("push", `${topic} ${event} (${ref})`, payload);
        if (this.isConnected()) {
          callback();
        } else {
          this.sendBuffer.push(callback);
        }
      }
      /**
       * Sets the JWT access token used for channel subscription authorization and Realtime RLS.
       *
       * If param is null it will use the `accessToken` callback function or the token set on the client.
       *
       * On callback used, it will set the value of the token internal to the client.
       *
       * When a token is explicitly provided, it will be preserved across channel operations
       * (including removeChannel and resubscribe). The `accessToken` callback will not be
       * invoked until `setAuth()` is called without arguments.
       *
       * @param token A JWT string to override the token set on the client.
       *
       * @example
       * // Use a manual token (preserved across resubscribes, ignores accessToken callback)
       * client.realtime.setAuth('my-custom-jwt')
       *
       * // Switch back to using the accessToken callback
       * client.realtime.setAuth()
       */
      async setAuth(token = null) {
        this._authPromise = this._performAuth(token);
        try {
          await this._authPromise;
        } finally {
          this._authPromise = null;
        }
      }
      /**
       * Returns true if the current access token was explicitly set via setAuth(token),
       * false if it was obtained via the accessToken callback.
       * @internal
       */
      _isManualToken() {
        return this._manuallySetToken;
      }
      /**
       * Sends a heartbeat message if the socket is connected.
       */
      async sendHeartbeat() {
        var _a;
        if (!this.isConnected()) {
          try {
            this.heartbeatCallback("disconnected");
          } catch (e) {
            this.log("error", "error in heartbeat callback", e);
          }
          return;
        }
        if (this.pendingHeartbeatRef) {
          this.pendingHeartbeatRef = null;
          this._heartbeatSentAt = null;
          this.log("transport", "heartbeat timeout. Attempting to re-establish connection");
          try {
            this.heartbeatCallback("timeout");
          } catch (e) {
            this.log("error", "error in heartbeat callback", e);
          }
          this._wasManualDisconnect = false;
          (_a = this.conn) === null || _a === void 0 ? void 0 : _a.close(constants_1.WS_CLOSE_NORMAL, "heartbeat timeout");
          setTimeout(() => {
            var _a2;
            if (!this.isConnected()) {
              (_a2 = this.reconnectTimer) === null || _a2 === void 0 ? void 0 : _a2.scheduleTimeout();
            }
          }, CONNECTION_TIMEOUTS.HEARTBEAT_TIMEOUT_FALLBACK);
          return;
        }
        this._heartbeatSentAt = Date.now();
        this.pendingHeartbeatRef = this._makeRef();
        this.push({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: this.pendingHeartbeatRef
        });
        try {
          this.heartbeatCallback("sent");
        } catch (e) {
          this.log("error", "error in heartbeat callback", e);
        }
        this._setAuthSafely("heartbeat");
      }
      /**
       * Sets a callback that receives lifecycle events for internal heartbeat messages.
       * Useful for instrumenting connection health (e.g. sent/ok/timeout/disconnected).
       */
      onHeartbeat(callback) {
        this.heartbeatCallback = callback;
      }
      /**
       * Flushes send buffer
       */
      flushSendBuffer() {
        if (this.isConnected() && this.sendBuffer.length > 0) {
          this.sendBuffer.forEach((callback) => callback());
          this.sendBuffer = [];
        }
      }
      /**
       * Return the next message ref, accounting for overflows
       *
       * @internal
       */
      _makeRef() {
        let newRef = this.ref + 1;
        if (newRef === this.ref) {
          this.ref = 0;
        } else {
          this.ref = newRef;
        }
        return this.ref.toString();
      }
      /**
       * Unsubscribe from channels with the specified topic.
       *
       * @internal
       */
      _leaveOpenTopic(topic) {
        let dupChannel = this.channels.find((c) => c.topic === topic && (c._isJoined() || c._isJoining()));
        if (dupChannel) {
          this.log("transport", `leaving duplicate topic "${topic}"`);
          dupChannel.unsubscribe();
        }
      }
      /**
       * Removes a subscription from the socket.
       *
       * @param channel An open subscription.
       *
       * @internal
       */
      _remove(channel) {
        this.channels = this.channels.filter((c) => c.topic !== channel.topic);
      }
      /** @internal */
      _onConnMessage(rawMessage) {
        this.decode(rawMessage.data, (msg) => {
          if (msg.topic === "phoenix" && msg.event === "phx_reply" && msg.ref && msg.ref === this.pendingHeartbeatRef) {
            const latency = this._heartbeatSentAt ? Date.now() - this._heartbeatSentAt : void 0;
            try {
              this.heartbeatCallback(msg.payload.status === "ok" ? "ok" : "error", latency);
            } catch (e) {
              this.log("error", "error in heartbeat callback", e);
            }
            this._heartbeatSentAt = null;
            this.pendingHeartbeatRef = null;
          }
          const { topic, event, payload, ref } = msg;
          const refString = ref ? `(${ref})` : "";
          const status = payload.status || "";
          this.log("receive", `${status} ${topic} ${event} ${refString}`.trim(), payload);
          this.channels.filter((channel) => channel._isMember(topic)).forEach((channel) => channel._trigger(event, payload, ref));
          this._triggerStateCallbacks("message", msg);
        });
      }
      /**
       * Clear specific timer
       * @internal
       */
      _clearTimer(timer) {
        var _a;
        if (timer === "heartbeat" && this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = void 0;
        } else if (timer === "reconnect") {
          (_a = this.reconnectTimer) === null || _a === void 0 ? void 0 : _a.reset();
        }
      }
      /**
       * Clear all timers
       * @internal
       */
      _clearAllTimers() {
        this._clearTimer("heartbeat");
        this._clearTimer("reconnect");
      }
      /**
       * Setup connection handlers for WebSocket events
       * @internal
       */
      _setupConnectionHandlers() {
        if (!this.conn)
          return;
        if ("binaryType" in this.conn) {
          ;
          this.conn.binaryType = "arraybuffer";
        }
        this.conn.onopen = () => this._onConnOpen();
        this.conn.onerror = (error) => this._onConnError(error);
        this.conn.onmessage = (event) => this._onConnMessage(event);
        this.conn.onclose = (event) => this._onConnClose(event);
        if (this.conn.readyState === constants_1.SOCKET_STATES.open) {
          this._onConnOpen();
        }
      }
      /**
       * Teardown connection and cleanup resources
       * @internal
       */
      _teardownConnection() {
        if (this.conn) {
          if (this.conn.readyState === constants_1.SOCKET_STATES.open || this.conn.readyState === constants_1.SOCKET_STATES.connecting) {
            try {
              this.conn.close();
            } catch (e) {
              this.log("error", "Error closing connection", e);
            }
          }
          this.conn.onopen = null;
          this.conn.onerror = null;
          this.conn.onmessage = null;
          this.conn.onclose = null;
          this.conn = null;
        }
        this._clearAllTimers();
        this._terminateWorker();
        this.channels.forEach((channel) => channel.teardown());
      }
      /** @internal */
      _onConnOpen() {
        this._setConnectionState("connected");
        this.log("transport", `connected to ${this.endpointURL()}`);
        const authPromise = this._authPromise || (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve());
        authPromise.then(() => {
          this.flushSendBuffer();
        }).catch((e) => {
          this.log("error", "error waiting for auth on connect", e);
          this.flushSendBuffer();
        });
        this._clearTimer("reconnect");
        if (!this.worker) {
          this._startHeartbeat();
        } else {
          if (!this.workerRef) {
            this._startWorkerHeartbeat();
          }
        }
        this._triggerStateCallbacks("open");
      }
      /** @internal */
      _startHeartbeat() {
        this.heartbeatTimer && clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
      }
      /** @internal */
      _startWorkerHeartbeat() {
        if (this.workerUrl) {
          this.log("worker", `starting worker for from ${this.workerUrl}`);
        } else {
          this.log("worker", `starting default worker`);
        }
        const objectUrl = this._workerObjectUrl(this.workerUrl);
        this.workerRef = new Worker(objectUrl);
        this.workerRef.onerror = (error) => {
          this.log("worker", "worker error", error.message);
          this._terminateWorker();
        };
        this.workerRef.onmessage = (event) => {
          if (event.data.event === "keepAlive") {
            this.sendHeartbeat();
          }
        };
        this.workerRef.postMessage({
          event: "start",
          interval: this.heartbeatIntervalMs
        });
      }
      /**
       * Terminate the Web Worker and clear the reference
       * @internal
       */
      _terminateWorker() {
        if (this.workerRef) {
          this.log("worker", "terminating worker");
          this.workerRef.terminate();
          this.workerRef = void 0;
        }
      }
      /** @internal */
      _onConnClose(event) {
        var _a;
        this._setConnectionState("disconnected");
        this.log("transport", "close", event);
        this._triggerChanError();
        this._clearTimer("heartbeat");
        if (!this._wasManualDisconnect) {
          (_a = this.reconnectTimer) === null || _a === void 0 ? void 0 : _a.scheduleTimeout();
        }
        this._triggerStateCallbacks("close", event);
      }
      /** @internal */
      _onConnError(error) {
        this._setConnectionState("disconnected");
        this.log("transport", `${error}`);
        this._triggerChanError();
        this._triggerStateCallbacks("error", error);
        try {
          this.heartbeatCallback("error");
        } catch (e) {
          this.log("error", "error in heartbeat callback", e);
        }
      }
      /** @internal */
      _triggerChanError() {
        this.channels.forEach((channel) => channel._trigger(constants_1.CHANNEL_EVENTS.error));
      }
      /** @internal */
      _appendParams(url, params) {
        if (Object.keys(params).length === 0) {
          return url;
        }
        const prefix = url.match(/\?/) ? "&" : "?";
        const query = new URLSearchParams(params);
        return `${url}${prefix}${query}`;
      }
      _workerObjectUrl(url) {
        let result_url;
        if (url) {
          result_url = url;
        } else {
          const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
          result_url = URL.createObjectURL(blob);
        }
        return result_url;
      }
      /**
       * Set connection state with proper state management
       * @internal
       */
      _setConnectionState(state, manual = false) {
        this._connectionState = state;
        if (state === "connecting") {
          this._wasManualDisconnect = false;
        } else if (state === "disconnecting") {
          this._wasManualDisconnect = manual;
        }
      }
      /**
       * Perform the actual auth operation
       * @internal
       */
      async _performAuth(token = null) {
        let tokenToSend;
        let isManualToken = false;
        if (token) {
          tokenToSend = token;
          isManualToken = true;
        } else if (this.accessToken) {
          try {
            tokenToSend = await this.accessToken();
          } catch (e) {
            this.log("error", "Error fetching access token from callback", e);
            tokenToSend = this.accessTokenValue;
          }
        } else {
          tokenToSend = this.accessTokenValue;
        }
        if (isManualToken) {
          this._manuallySetToken = true;
        } else if (this.accessToken) {
          this._manuallySetToken = false;
        }
        if (this.accessTokenValue != tokenToSend) {
          this.accessTokenValue = tokenToSend;
          this.channels.forEach((channel) => {
            const payload = {
              access_token: tokenToSend,
              version: constants_1.DEFAULT_VERSION
            };
            tokenToSend && channel.updateJoinPayload(payload);
            if (channel.joinedOnce && channel._isJoined()) {
              channel._push(constants_1.CHANNEL_EVENTS.access_token, {
                access_token: tokenToSend
              });
            }
          });
        }
      }
      /**
       * Wait for any in-flight auth operations to complete
       * @internal
       */
      async _waitForAuthIfNeeded() {
        if (this._authPromise) {
          await this._authPromise;
        }
      }
      /**
       * Safely call setAuth with standardized error handling
       * @internal
       */
      _setAuthSafely(context = "general") {
        if (!this._isManualToken()) {
          this.setAuth().catch((e) => {
            this.log("error", `Error setting auth in ${context}`, e);
          });
        }
      }
      /**
       * Trigger state change callbacks with proper error handling
       * @internal
       */
      _triggerStateCallbacks(event, data) {
        try {
          this.stateChangeCallbacks[event].forEach((callback) => {
            try {
              callback(data);
            } catch (e) {
              this.log("error", `error in ${event} callback`, e);
            }
          });
        } catch (e) {
          this.log("error", `error triggering ${event} callbacks`, e);
        }
      }
      /**
       * Setup reconnection timer with proper configuration
       * @internal
       */
      _setupReconnectionTimer() {
        this.reconnectTimer = new timer_1.default(async () => {
          setTimeout(async () => {
            await this._waitForAuthIfNeeded();
            if (!this.isConnected()) {
              this.connect();
            }
          }, CONNECTION_TIMEOUTS.RECONNECT_DELAY);
        }, this.reconnectAfterMs);
      }
      /**
       * Initialize client options with defaults
       * @internal
       */
      _initializeOptions(options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        this.transport = (_a = options === null || options === void 0 ? void 0 : options.transport) !== null && _a !== void 0 ? _a : null;
        this.timeout = (_b = options === null || options === void 0 ? void 0 : options.timeout) !== null && _b !== void 0 ? _b : constants_1.DEFAULT_TIMEOUT;
        this.heartbeatIntervalMs = (_c = options === null || options === void 0 ? void 0 : options.heartbeatIntervalMs) !== null && _c !== void 0 ? _c : CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL;
        this.worker = (_d = options === null || options === void 0 ? void 0 : options.worker) !== null && _d !== void 0 ? _d : false;
        this.accessToken = (_e = options === null || options === void 0 ? void 0 : options.accessToken) !== null && _e !== void 0 ? _e : null;
        this.heartbeatCallback = (_f = options === null || options === void 0 ? void 0 : options.heartbeatCallback) !== null && _f !== void 0 ? _f : noop;
        this.vsn = (_g = options === null || options === void 0 ? void 0 : options.vsn) !== null && _g !== void 0 ? _g : constants_1.DEFAULT_VSN;
        if (options === null || options === void 0 ? void 0 : options.params)
          this.params = options.params;
        if (options === null || options === void 0 ? void 0 : options.logger)
          this.logger = options.logger;
        if ((options === null || options === void 0 ? void 0 : options.logLevel) || (options === null || options === void 0 ? void 0 : options.log_level)) {
          this.logLevel = options.logLevel || options.log_level;
          this.params = Object.assign(Object.assign({}, this.params), { log_level: this.logLevel });
        }
        this.reconnectAfterMs = (_h = options === null || options === void 0 ? void 0 : options.reconnectAfterMs) !== null && _h !== void 0 ? _h : ((tries) => {
          return RECONNECT_INTERVALS[tries - 1] || DEFAULT_RECONNECT_FALLBACK;
        });
        switch (this.vsn) {
          case constants_1.VSN_1_0_0:
            this.encode = (_j = options === null || options === void 0 ? void 0 : options.encode) !== null && _j !== void 0 ? _j : ((payload, callback) => {
              return callback(JSON.stringify(payload));
            });
            this.decode = (_k = options === null || options === void 0 ? void 0 : options.decode) !== null && _k !== void 0 ? _k : ((payload, callback) => {
              return callback(JSON.parse(payload));
            });
            break;
          case constants_1.VSN_2_0_0:
            this.encode = (_l = options === null || options === void 0 ? void 0 : options.encode) !== null && _l !== void 0 ? _l : this.serializer.encode.bind(this.serializer);
            this.decode = (_m = options === null || options === void 0 ? void 0 : options.decode) !== null && _m !== void 0 ? _m : this.serializer.decode.bind(this.serializer);
            break;
          default:
            throw new Error(`Unsupported serializer version: ${this.vsn}`);
        }
        if (this.worker) {
          if (typeof window !== "undefined" && !window.Worker) {
            throw new Error("Web Worker is not supported");
          }
          this.workerUrl = options === null || options === void 0 ? void 0 : options.workerUrl;
        }
      }
    };
    exports2.default = RealtimeClient;
  }
});

// netlify/functions/node_modules/@supabase/realtime-js/dist/main/index.js
var require_main2 = __commonJS({
  "netlify/functions/node_modules/@supabase/realtime-js/dist/main/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WebSocketFactory = exports2.REALTIME_CHANNEL_STATES = exports2.REALTIME_SUBSCRIBE_STATES = exports2.REALTIME_PRESENCE_LISTEN_EVENTS = exports2.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = exports2.REALTIME_LISTEN_TYPES = exports2.RealtimeClient = exports2.RealtimeChannel = exports2.RealtimePresence = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var RealtimeClient_1 = tslib_1.__importDefault(require_RealtimeClient());
    exports2.RealtimeClient = RealtimeClient_1.default;
    var RealtimeChannel_1 = tslib_1.__importStar(require_RealtimeChannel());
    exports2.RealtimeChannel = RealtimeChannel_1.default;
    Object.defineProperty(exports2, "REALTIME_LISTEN_TYPES", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_LISTEN_TYPES;
    } });
    Object.defineProperty(exports2, "REALTIME_POSTGRES_CHANGES_LISTEN_EVENT", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_POSTGRES_CHANGES_LISTEN_EVENT;
    } });
    Object.defineProperty(exports2, "REALTIME_SUBSCRIBE_STATES", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_SUBSCRIBE_STATES;
    } });
    Object.defineProperty(exports2, "REALTIME_CHANNEL_STATES", { enumerable: true, get: function() {
      return RealtimeChannel_1.REALTIME_CHANNEL_STATES;
    } });
    var RealtimePresence_1 = tslib_1.__importStar(require_RealtimePresence());
    exports2.RealtimePresence = RealtimePresence_1.default;
    Object.defineProperty(exports2, "REALTIME_PRESENCE_LISTEN_EVENTS", { enumerable: true, get: function() {
      return RealtimePresence_1.REALTIME_PRESENCE_LISTEN_EVENTS;
    } });
    var websocket_factory_1 = tslib_1.__importDefault(require_websocket_factory());
    exports2.WebSocketFactory = websocket_factory_1.default;
  }
});

// netlify/functions/node_modules/iceberg-js/dist/index.cjs
var require_dist2 = __commonJS({
  "netlify/functions/node_modules/iceberg-js/dist/index.cjs"(exports2) {
    "use strict";
    var IcebergError = class extends Error {
      constructor(message, opts) {
        super(message);
        this.name = "IcebergError";
        this.status = opts.status;
        this.icebergType = opts.icebergType;
        this.icebergCode = opts.icebergCode;
        this.details = opts.details;
        this.isCommitStateUnknown = opts.icebergType === "CommitStateUnknownException" || [500, 502, 504].includes(opts.status) && opts.icebergType?.includes("CommitState") === true;
      }
      /**
       * Returns true if the error is a 404 Not Found error.
       */
      isNotFound() {
        return this.status === 404;
      }
      /**
       * Returns true if the error is a 409 Conflict error.
       */
      isConflict() {
        return this.status === 409;
      }
      /**
       * Returns true if the error is a 419 Authentication Timeout error.
       */
      isAuthenticationTimeout() {
        return this.status === 419;
      }
    };
    function buildUrl(baseUrl, path, query) {
      const url = new URL(path, baseUrl);
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value !== void 0) {
            url.searchParams.set(key, value);
          }
        }
      }
      return url.toString();
    }
    async function buildAuthHeaders(auth) {
      if (!auth || auth.type === "none") {
        return {};
      }
      if (auth.type === "bearer") {
        return { Authorization: `Bearer ${auth.token}` };
      }
      if (auth.type === "header") {
        return { [auth.name]: auth.value };
      }
      if (auth.type === "custom") {
        return await auth.getHeaders();
      }
      return {};
    }
    function createFetchClient(options) {
      const fetchFn = options.fetchImpl ?? globalThis.fetch;
      return {
        async request({
          method,
          path,
          query,
          body,
          headers
        }) {
          const url = buildUrl(options.baseUrl, path, query);
          const authHeaders = await buildAuthHeaders(options.auth);
          const res = await fetchFn(url, {
            method,
            headers: {
              ...body ? { "Content-Type": "application/json" } : {},
              ...authHeaders,
              ...headers
            },
            body: body ? JSON.stringify(body) : void 0
          });
          const text = await res.text();
          const isJson = (res.headers.get("content-type") || "").includes("application/json");
          const data = isJson && text ? JSON.parse(text) : text;
          if (!res.ok) {
            const errBody = isJson ? data : void 0;
            const errorDetail = errBody?.error;
            throw new IcebergError(
              errorDetail?.message ?? `Request failed with status ${res.status}`,
              {
                status: res.status,
                icebergType: errorDetail?.type,
                icebergCode: errorDetail?.code,
                details: errBody
              }
            );
          }
          return { status: res.status, headers: res.headers, data };
        }
      };
    }
    function namespaceToPath(namespace) {
      return namespace.join("");
    }
    var NamespaceOperations = class {
      constructor(client, prefix = "") {
        this.client = client;
        this.prefix = prefix;
      }
      async listNamespaces(parent) {
        const query = parent ? { parent: namespaceToPath(parent.namespace) } : void 0;
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces`,
          query
        });
        return response.data.namespaces.map((ns) => ({ namespace: ns }));
      }
      async createNamespace(id, metadata) {
        const request = {
          namespace: id.namespace,
          properties: metadata?.properties
        };
        const response = await this.client.request({
          method: "POST",
          path: `${this.prefix}/namespaces`,
          body: request
        });
        return response.data;
      }
      async dropNamespace(id) {
        await this.client.request({
          method: "DELETE",
          path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
        });
      }
      async loadNamespaceMetadata(id) {
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
        });
        return {
          properties: response.data.properties
        };
      }
      async namespaceExists(id) {
        try {
          await this.client.request({
            method: "HEAD",
            path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
          });
          return true;
        } catch (error) {
          if (error instanceof IcebergError && error.status === 404) {
            return false;
          }
          throw error;
        }
      }
      async createNamespaceIfNotExists(id, metadata) {
        try {
          return await this.createNamespace(id, metadata);
        } catch (error) {
          if (error instanceof IcebergError && error.status === 409) {
            return;
          }
          throw error;
        }
      }
    };
    function namespaceToPath2(namespace) {
      return namespace.join("");
    }
    var TableOperations = class {
      constructor(client, prefix = "", accessDelegation) {
        this.client = client;
        this.prefix = prefix;
        this.accessDelegation = accessDelegation;
      }
      async listTables(namespace) {
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces/${namespaceToPath2(namespace.namespace)}/tables`
        });
        return response.data.identifiers;
      }
      async createTable(namespace, request) {
        const headers = {};
        if (this.accessDelegation) {
          headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
        }
        const response = await this.client.request({
          method: "POST",
          path: `${this.prefix}/namespaces/${namespaceToPath2(namespace.namespace)}/tables`,
          body: request,
          headers
        });
        return response.data.metadata;
      }
      async updateTable(id, request) {
        const response = await this.client.request({
          method: "POST",
          path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
          body: request
        });
        return {
          "metadata-location": response.data["metadata-location"],
          metadata: response.data.metadata
        };
      }
      async dropTable(id, options) {
        await this.client.request({
          method: "DELETE",
          path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
          query: { purgeRequested: String(options?.purge ?? false) }
        });
      }
      async loadTable(id) {
        const headers = {};
        if (this.accessDelegation) {
          headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
        }
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
          headers
        });
        return response.data.metadata;
      }
      async tableExists(id) {
        const headers = {};
        if (this.accessDelegation) {
          headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
        }
        try {
          await this.client.request({
            method: "HEAD",
            path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
            headers
          });
          return true;
        } catch (error) {
          if (error instanceof IcebergError && error.status === 404) {
            return false;
          }
          throw error;
        }
      }
      async createTableIfNotExists(namespace, request) {
        try {
          return await this.createTable(namespace, request);
        } catch (error) {
          if (error instanceof IcebergError && error.status === 409) {
            return await this.loadTable({ namespace: namespace.namespace, name: request.name });
          }
          throw error;
        }
      }
    };
    var IcebergRestCatalog = class {
      /**
       * Creates a new Iceberg REST Catalog client.
       *
       * @param options - Configuration options for the catalog client
       */
      constructor(options) {
        let prefix = "v1";
        if (options.catalogName) {
          prefix += `/${options.catalogName}`;
        }
        const baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
        this.client = createFetchClient({
          baseUrl,
          auth: options.auth,
          fetchImpl: options.fetch
        });
        this.accessDelegation = options.accessDelegation?.join(",");
        this.namespaceOps = new NamespaceOperations(this.client, prefix);
        this.tableOps = new TableOperations(this.client, prefix, this.accessDelegation);
      }
      /**
       * Lists all namespaces in the catalog.
       *
       * @param parent - Optional parent namespace to list children under
       * @returns Array of namespace identifiers
       *
       * @example
       * ```typescript
       * // List all top-level namespaces
       * const namespaces = await catalog.listNamespaces();
       *
       * // List namespaces under a parent
       * const children = await catalog.listNamespaces({ namespace: ['analytics'] });
       * ```
       */
      async listNamespaces(parent) {
        return this.namespaceOps.listNamespaces(parent);
      }
      /**
       * Creates a new namespace in the catalog.
       *
       * @param id - Namespace identifier to create
       * @param metadata - Optional metadata properties for the namespace
       * @returns Response containing the created namespace and its properties
       *
       * @example
       * ```typescript
       * const response = await catalog.createNamespace(
       *   { namespace: ['analytics'] },
       *   { properties: { owner: 'data-team' } }
       * );
       * console.log(response.namespace); // ['analytics']
       * console.log(response.properties); // { owner: 'data-team', ... }
       * ```
       */
      async createNamespace(id, metadata) {
        return this.namespaceOps.createNamespace(id, metadata);
      }
      /**
       * Drops a namespace from the catalog.
       *
       * The namespace must be empty (contain no tables) before it can be dropped.
       *
       * @param id - Namespace identifier to drop
       *
       * @example
       * ```typescript
       * await catalog.dropNamespace({ namespace: ['analytics'] });
       * ```
       */
      async dropNamespace(id) {
        await this.namespaceOps.dropNamespace(id);
      }
      /**
       * Loads metadata for a namespace.
       *
       * @param id - Namespace identifier to load
       * @returns Namespace metadata including properties
       *
       * @example
       * ```typescript
       * const metadata = await catalog.loadNamespaceMetadata({ namespace: ['analytics'] });
       * console.log(metadata.properties);
       * ```
       */
      async loadNamespaceMetadata(id) {
        return this.namespaceOps.loadNamespaceMetadata(id);
      }
      /**
       * Lists all tables in a namespace.
       *
       * @param namespace - Namespace identifier to list tables from
       * @returns Array of table identifiers
       *
       * @example
       * ```typescript
       * const tables = await catalog.listTables({ namespace: ['analytics'] });
       * console.log(tables); // [{ namespace: ['analytics'], name: 'events' }, ...]
       * ```
       */
      async listTables(namespace) {
        return this.tableOps.listTables(namespace);
      }
      /**
       * Creates a new table in the catalog.
       *
       * @param namespace - Namespace to create the table in
       * @param request - Table creation request including name, schema, partition spec, etc.
       * @returns Table metadata for the created table
       *
       * @example
       * ```typescript
       * const metadata = await catalog.createTable(
       *   { namespace: ['analytics'] },
       *   {
       *     name: 'events',
       *     schema: {
       *       type: 'struct',
       *       fields: [
       *         { id: 1, name: 'id', type: 'long', required: true },
       *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
       *       ],
       *       'schema-id': 0
       *     },
       *     'partition-spec': {
       *       'spec-id': 0,
       *       fields: [
       *         { source_id: 2, field_id: 1000, name: 'ts_day', transform: 'day' }
       *       ]
       *     }
       *   }
       * );
       * ```
       */
      async createTable(namespace, request) {
        return this.tableOps.createTable(namespace, request);
      }
      /**
       * Updates an existing table's metadata.
       *
       * Can update the schema, partition spec, or properties of a table.
       *
       * @param id - Table identifier to update
       * @param request - Update request with fields to modify
       * @returns Response containing the metadata location and updated table metadata
       *
       * @example
       * ```typescript
       * const response = await catalog.updateTable(
       *   { namespace: ['analytics'], name: 'events' },
       *   {
       *     properties: { 'read.split.target-size': '134217728' }
       *   }
       * );
       * console.log(response['metadata-location']); // s3://...
       * console.log(response.metadata); // TableMetadata object
       * ```
       */
      async updateTable(id, request) {
        return this.tableOps.updateTable(id, request);
      }
      /**
       * Drops a table from the catalog.
       *
       * @param id - Table identifier to drop
       *
       * @example
       * ```typescript
       * await catalog.dropTable({ namespace: ['analytics'], name: 'events' });
       * ```
       */
      async dropTable(id, options) {
        await this.tableOps.dropTable(id, options);
      }
      /**
       * Loads metadata for a table.
       *
       * @param id - Table identifier to load
       * @returns Table metadata including schema, partition spec, location, etc.
       *
       * @example
       * ```typescript
       * const metadata = await catalog.loadTable({ namespace: ['analytics'], name: 'events' });
       * console.log(metadata.schema);
       * console.log(metadata.location);
       * ```
       */
      async loadTable(id) {
        return this.tableOps.loadTable(id);
      }
      /**
       * Checks if a namespace exists in the catalog.
       *
       * @param id - Namespace identifier to check
       * @returns True if the namespace exists, false otherwise
       *
       * @example
       * ```typescript
       * const exists = await catalog.namespaceExists({ namespace: ['analytics'] });
       * console.log(exists); // true or false
       * ```
       */
      async namespaceExists(id) {
        return this.namespaceOps.namespaceExists(id);
      }
      /**
       * Checks if a table exists in the catalog.
       *
       * @param id - Table identifier to check
       * @returns True if the table exists, false otherwise
       *
       * @example
       * ```typescript
       * const exists = await catalog.tableExists({ namespace: ['analytics'], name: 'events' });
       * console.log(exists); // true or false
       * ```
       */
      async tableExists(id) {
        return this.tableOps.tableExists(id);
      }
      /**
       * Creates a namespace if it does not exist.
       *
       * If the namespace already exists, returns void. If created, returns the response.
       *
       * @param id - Namespace identifier to create
       * @param metadata - Optional metadata properties for the namespace
       * @returns Response containing the created namespace and its properties, or void if it already exists
       *
       * @example
       * ```typescript
       * const response = await catalog.createNamespaceIfNotExists(
       *   { namespace: ['analytics'] },
       *   { properties: { owner: 'data-team' } }
       * );
       * if (response) {
       *   console.log('Created:', response.namespace);
       * } else {
       *   console.log('Already exists');
       * }
       * ```
       */
      async createNamespaceIfNotExists(id, metadata) {
        return this.namespaceOps.createNamespaceIfNotExists(id, metadata);
      }
      /**
       * Creates a table if it does not exist.
       *
       * If the table already exists, returns its metadata instead.
       *
       * @param namespace - Namespace to create the table in
       * @param request - Table creation request including name, schema, partition spec, etc.
       * @returns Table metadata for the created or existing table
       *
       * @example
       * ```typescript
       * const metadata = await catalog.createTableIfNotExists(
       *   { namespace: ['analytics'] },
       *   {
       *     name: 'events',
       *     schema: {
       *       type: 'struct',
       *       fields: [
       *         { id: 1, name: 'id', type: 'long', required: true },
       *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
       *       ],
       *       'schema-id': 0
       *     }
       *   }
       * );
       * ```
       */
      async createTableIfNotExists(namespace, request) {
        return this.tableOps.createTableIfNotExists(namespace, request);
      }
    };
    var DECIMAL_REGEX = /^decimal\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/;
    var FIXED_REGEX = /^fixed\s*\[\s*(\d+)\s*\]$/;
    function parseDecimalType(type) {
      const match = type.match(DECIMAL_REGEX);
      if (!match) return null;
      return {
        precision: parseInt(match[1], 10),
        scale: parseInt(match[2], 10)
      };
    }
    function parseFixedType(type) {
      const match = type.match(FIXED_REGEX);
      if (!match) return null;
      return {
        length: parseInt(match[1], 10)
      };
    }
    function isDecimalType(type) {
      return DECIMAL_REGEX.test(type);
    }
    function isFixedType(type) {
      return FIXED_REGEX.test(type);
    }
    function typesEqual(a, b) {
      const decimalA = parseDecimalType(a);
      const decimalB = parseDecimalType(b);
      if (decimalA && decimalB) {
        return decimalA.precision === decimalB.precision && decimalA.scale === decimalB.scale;
      }
      const fixedA = parseFixedType(a);
      const fixedB = parseFixedType(b);
      if (fixedA && fixedB) {
        return fixedA.length === fixedB.length;
      }
      return a === b;
    }
    function getCurrentSchema(metadata) {
      return metadata.schemas.find((s) => s["schema-id"] === metadata["current-schema-id"]);
    }
    exports2.IcebergError = IcebergError;
    exports2.IcebergRestCatalog = IcebergRestCatalog;
    exports2.getCurrentSchema = getCurrentSchema;
    exports2.isDecimalType = isDecimalType;
    exports2.isFixedType = isFixedType;
    exports2.parseDecimalType = parseDecimalType;
    exports2.parseFixedType = parseFixedType;
    exports2.typesEqual = typesEqual;
  }
});

// netlify/functions/node_modules/@supabase/storage-js/dist/index.cjs
var require_dist3 = __commonJS({
  "netlify/functions/node_modules/@supabase/storage-js/dist/index.cjs"(exports2) {
    var iceberg_js = require_dist2();
    var StorageError = class extends Error {
      constructor(message, namespace = "storage", status, statusCode) {
        super(message);
        this.__isStorageError = true;
        this.namespace = namespace;
        this.name = namespace === "vectors" ? "StorageVectorsError" : "StorageError";
        this.status = status;
        this.statusCode = statusCode;
      }
    };
    function isStorageError(error) {
      return typeof error === "object" && error !== null && "__isStorageError" in error;
    }
    var StorageApiError = class extends StorageError {
      constructor(message, status, statusCode, namespace = "storage") {
        super(message, namespace, status, statusCode);
        this.name = namespace === "vectors" ? "StorageVectorsApiError" : "StorageApiError";
        this.status = status;
        this.statusCode = statusCode;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          statusCode: this.statusCode
        };
      }
    };
    var StorageUnknownError = class extends StorageError {
      constructor(message, originalError, namespace = "storage") {
        super(message, namespace);
        this.name = namespace === "vectors" ? "StorageVectorsUnknownError" : "StorageUnknownError";
        this.originalError = originalError;
      }
    };
    var StorageVectorsError = class extends StorageError {
      constructor(message) {
        super(message, "vectors");
      }
    };
    function isStorageVectorsError(error) {
      return isStorageError(error) && error["namespace"] === "vectors";
    }
    var StorageVectorsApiError = class extends StorageApiError {
      constructor(message, status, statusCode) {
        super(message, status, statusCode, "vectors");
      }
    };
    var StorageVectorsUnknownError = class extends StorageUnknownError {
      constructor(message, originalError) {
        super(message, originalError, "vectors");
      }
    };
    var StorageVectorsErrorCode = /* @__PURE__ */ (function(StorageVectorsErrorCode$1) {
      StorageVectorsErrorCode$1["InternalError"] = "InternalError";
      StorageVectorsErrorCode$1["S3VectorConflictException"] = "S3VectorConflictException";
      StorageVectorsErrorCode$1["S3VectorNotFoundException"] = "S3VectorNotFoundException";
      StorageVectorsErrorCode$1["S3VectorBucketNotEmpty"] = "S3VectorBucketNotEmpty";
      StorageVectorsErrorCode$1["S3VectorMaxBucketsExceeded"] = "S3VectorMaxBucketsExceeded";
      StorageVectorsErrorCode$1["S3VectorMaxIndexesExceeded"] = "S3VectorMaxIndexesExceeded";
      return StorageVectorsErrorCode$1;
    })({});
    var resolveFetch = (customFetch) => {
      if (customFetch) return (...args) => customFetch(...args);
      return (...args) => fetch(...args);
    };
    var isPlainObject = (value) => {
      if (typeof value !== "object" || value === null) return false;
      const prototype = Object.getPrototypeOf(value);
      return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) && !(Symbol.toStringTag in value) && !(Symbol.iterator in value);
    };
    var recursiveToCamel = (item) => {
      if (Array.isArray(item)) return item.map((el) => recursiveToCamel(el));
      else if (typeof item === "function" || item !== Object(item)) return item;
      const result = {};
      Object.entries(item).forEach(([key, value]) => {
        const newKey = key.replace(/([-_][a-z])/gi, (c) => c.toUpperCase().replace(/[-_]/g, ""));
        result[newKey] = recursiveToCamel(value);
      });
      return result;
    };
    var isValidBucketName = (bucketName) => {
      if (!bucketName || typeof bucketName !== "string") return false;
      if (bucketName.length === 0 || bucketName.length > 100) return false;
      if (bucketName.trim() !== bucketName) return false;
      if (bucketName.includes("/") || bucketName.includes("\\")) return false;
      return /^[\w!.\*'() &$@=;:+,?-]+$/.test(bucketName);
    };
    function _typeof(o) {
      "@babel/helpers - typeof";
      return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
        return typeof o$1;
      } : function(o$1) {
        return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
      }, _typeof(o);
    }
    function toPrimitive(t, r) {
      if ("object" != _typeof(t) || !t) return t;
      var e = t[Symbol.toPrimitive];
      if (void 0 !== e) {
        var i = e.call(t, r || "default");
        if ("object" != _typeof(i)) return i;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return ("string" === r ? String : Number)(t);
    }
    function toPropertyKey(t) {
      var i = toPrimitive(t, "string");
      return "symbol" == _typeof(i) ? i : i + "";
    }
    function _defineProperty(e, r, t) {
      return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
        value: t,
        enumerable: true,
        configurable: true,
        writable: true
      }) : e[r] = t, e;
    }
    function ownKeys2(e, r) {
      var t = Object.keys(e);
      if (Object.getOwnPropertySymbols) {
        var o = Object.getOwnPropertySymbols(e);
        r && (o = o.filter(function(r$1) {
          return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
        })), t.push.apply(t, o);
      }
      return t;
    }
    function _objectSpread2(e) {
      for (var r = 1; r < arguments.length; r++) {
        var t = null != arguments[r] ? arguments[r] : {};
        r % 2 ? ownKeys2(Object(t), true).forEach(function(r$1) {
          _defineProperty(e, r$1, t[r$1]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys2(Object(t)).forEach(function(r$1) {
          Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
        });
      }
      return e;
    }
    var _getErrorMessage = (err) => {
      var _err$error;
      return err.msg || err.message || err.error_description || (typeof err.error === "string" ? err.error : (_err$error = err.error) === null || _err$error === void 0 ? void 0 : _err$error.message) || JSON.stringify(err);
    };
    var handleError = async (error, reject, options, namespace) => {
      if (error && typeof error === "object" && "status" in error && "ok" in error && typeof error.status === "number" && !(options === null || options === void 0 ? void 0 : options.noResolveJson)) {
        const responseError = error;
        const status = responseError.status || 500;
        if (typeof responseError.json === "function") responseError.json().then((err) => {
          const statusCode = (err === null || err === void 0 ? void 0 : err.statusCode) || (err === null || err === void 0 ? void 0 : err.code) || status + "";
          reject(new StorageApiError(_getErrorMessage(err), status, statusCode, namespace));
        }).catch(() => {
          if (namespace === "vectors") {
            const statusCode = status + "";
            reject(new StorageApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode, namespace));
          } else {
            const statusCode = status + "";
            reject(new StorageApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode, namespace));
          }
        });
        else {
          const statusCode = status + "";
          reject(new StorageApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode, namespace));
        }
      } else reject(new StorageUnknownError(_getErrorMessage(error), error, namespace));
    };
    var _getRequestParams = (method, options, parameters, body) => {
      const params = {
        method,
        headers: (options === null || options === void 0 ? void 0 : options.headers) || {}
      };
      if (method === "GET" || method === "HEAD" || !body) return _objectSpread2(_objectSpread2({}, params), parameters);
      if (isPlainObject(body)) {
        params.headers = _objectSpread2({ "Content-Type": "application/json" }, options === null || options === void 0 ? void 0 : options.headers);
        params.body = JSON.stringify(body);
      } else params.body = body;
      if (options === null || options === void 0 ? void 0 : options.duplex) params.duplex = options.duplex;
      return _objectSpread2(_objectSpread2({}, params), parameters);
    };
    async function _handleRequest(fetcher, method, url, options, parameters, body, namespace) {
      return new Promise((resolve, reject) => {
        fetcher(url, _getRequestParams(method, options, parameters, body)).then((result) => {
          if (!result.ok) throw result;
          if (options === null || options === void 0 ? void 0 : options.noResolveJson) return result;
          if (namespace === "vectors") {
            const contentType = result.headers.get("content-type");
            if (result.headers.get("content-length") === "0" || result.status === 204) return {};
            if (!contentType || !contentType.includes("application/json")) return {};
          }
          return result.json();
        }).then((data) => resolve(data)).catch((error) => handleError(error, reject, options, namespace));
      });
    }
    function createFetchApi(namespace = "storage") {
      return {
        get: async (fetcher, url, options, parameters) => {
          return _handleRequest(fetcher, "GET", url, options, parameters, void 0, namespace);
        },
        post: async (fetcher, url, body, options, parameters) => {
          return _handleRequest(fetcher, "POST", url, options, parameters, body, namespace);
        },
        put: async (fetcher, url, body, options, parameters) => {
          return _handleRequest(fetcher, "PUT", url, options, parameters, body, namespace);
        },
        head: async (fetcher, url, options, parameters) => {
          return _handleRequest(fetcher, "HEAD", url, _objectSpread2(_objectSpread2({}, options), {}, { noResolveJson: true }), parameters, void 0, namespace);
        },
        remove: async (fetcher, url, body, options, parameters) => {
          return _handleRequest(fetcher, "DELETE", url, options, parameters, body, namespace);
        }
      };
    }
    var defaultApi = createFetchApi("storage");
    var { get, post, put, head, remove } = defaultApi;
    var vectorsApi = createFetchApi("vectors");
    var BaseApiClient = class {
      /**
      * Creates a new BaseApiClient instance
      * @param url - Base URL for API requests
      * @param headers - Default headers for API requests
      * @param fetch - Optional custom fetch implementation
      * @param namespace - Error namespace ('storage' or 'vectors')
      */
      constructor(url, headers = {}, fetch$1, namespace = "storage") {
        this.shouldThrowOnError = false;
        this.url = url;
        this.headers = headers;
        this.fetch = resolveFetch(fetch$1);
        this.namespace = namespace;
      }
      /**
      * Enable throwing errors instead of returning them.
      * When enabled, errors are thrown instead of returned in { data, error } format.
      *
      * @returns this - For method chaining
      */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /**
      * Handles API operation with standardized error handling
      * Eliminates repetitive try-catch blocks across all API methods
      *
      * This wrapper:
      * 1. Executes the operation
      * 2. Returns { data, error: null } on success
      * 3. Returns { data: null, error } on failure (if shouldThrowOnError is false)
      * 4. Throws error on failure (if shouldThrowOnError is true)
      *
      * @typeParam T - The expected data type from the operation
      * @param operation - Async function that performs the API call
      * @returns Promise with { data, error } tuple
      *
      * @example
      * ```typescript
      * async listBuckets() {
      *   return this.handleOperation(async () => {
      *     return await get(this.fetch, `${this.url}/bucket`, {
      *       headers: this.headers,
      *     })
      *   })
      * }
      * ```
      */
      async handleOperation(operation) {
        var _this = this;
        try {
          return {
            data: await operation(),
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    var StreamDownloadBuilder = class {
      constructor(downloadFn, shouldThrowOnError) {
        this.downloadFn = downloadFn;
        this.shouldThrowOnError = shouldThrowOnError;
      }
      then(onfulfilled, onrejected) {
        return this.execute().then(onfulfilled, onrejected);
      }
      async execute() {
        var _this = this;
        try {
          return {
            data: (await _this.downloadFn()).body,
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    var _Symbol$toStringTag;
    _Symbol$toStringTag = Symbol.toStringTag;
    var BlobDownloadBuilder = class {
      constructor(downloadFn, shouldThrowOnError) {
        this.downloadFn = downloadFn;
        this.shouldThrowOnError = shouldThrowOnError;
        this[_Symbol$toStringTag] = "BlobDownloadBuilder";
        this.promise = null;
      }
      asStream() {
        return new StreamDownloadBuilder(this.downloadFn, this.shouldThrowOnError);
      }
      then(onfulfilled, onrejected) {
        return this.getPromise().then(onfulfilled, onrejected);
      }
      catch(onrejected) {
        return this.getPromise().catch(onrejected);
      }
      finally(onfinally) {
        return this.getPromise().finally(onfinally);
      }
      getPromise() {
        if (!this.promise) this.promise = this.execute();
        return this.promise;
      }
      async execute() {
        var _this = this;
        try {
          return {
            data: await (await _this.downloadFn()).blob(),
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    var DEFAULT_SEARCH_OPTIONS = {
      limit: 100,
      offset: 0,
      sortBy: {
        column: "name",
        order: "asc"
      }
    };
    var DEFAULT_FILE_OPTIONS = {
      cacheControl: "3600",
      contentType: "text/plain;charset=UTF-8",
      upsert: false
    };
    var StorageFileApi = class extends BaseApiClient {
      constructor(url, headers = {}, bucketId, fetch$1) {
        super(url, headers, fetch$1, "storage");
        this.bucketId = bucketId;
      }
      /**
      * Uploads a file to an existing bucket or replaces an existing file at the specified path with a new one.
      *
      * @param method HTTP method.
      * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
      * @param fileBody The body of the file to be stored in the bucket.
      */
      async uploadOrUpdate(method, path, fileBody, fileOptions) {
        var _this = this;
        return _this.handleOperation(async () => {
          let body;
          const options = _objectSpread2(_objectSpread2({}, DEFAULT_FILE_OPTIONS), fileOptions);
          let headers = _objectSpread2(_objectSpread2({}, _this.headers), method === "POST" && { "x-upsert": String(options.upsert) });
          const metadata = options.metadata;
          if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
            body = new FormData();
            body.append("cacheControl", options.cacheControl);
            if (metadata) body.append("metadata", _this.encodeMetadata(metadata));
            body.append("", fileBody);
          } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
            body = fileBody;
            if (!body.has("cacheControl")) body.append("cacheControl", options.cacheControl);
            if (metadata && !body.has("metadata")) body.append("metadata", _this.encodeMetadata(metadata));
          } else {
            body = fileBody;
            headers["cache-control"] = `max-age=${options.cacheControl}`;
            headers["content-type"] = options.contentType;
            if (metadata) headers["x-metadata"] = _this.toBase64(_this.encodeMetadata(metadata));
            if ((typeof ReadableStream !== "undefined" && body instanceof ReadableStream || body && typeof body === "object" && "pipe" in body && typeof body.pipe === "function") && !options.duplex) options.duplex = "half";
          }
          if (fileOptions === null || fileOptions === void 0 ? void 0 : fileOptions.headers) headers = _objectSpread2(_objectSpread2({}, headers), fileOptions.headers);
          const cleanPath = _this._removeEmptyFolders(path);
          const _path = _this._getFinalPath(cleanPath);
          const data = await (method == "PUT" ? put : post)(_this.fetch, `${_this.url}/object/${_path}`, body, _objectSpread2({ headers }, (options === null || options === void 0 ? void 0 : options.duplex) ? { duplex: options.duplex } : {}));
          return {
            path: cleanPath,
            id: data.Id,
            fullPath: data.Key
          };
        });
      }
      /**
      * Uploads a file to an existing bucket.
      *
      * @category File Buckets
      * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
      * @param fileBody The body of the file to be stored in the bucket.
      * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
      * @returns Promise with response containing file path, id, and fullPath or error
      *
      * @example Upload file
      * ```js
      * const avatarFile = event.target.files[0]
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .upload('public/avatar1.png', avatarFile, {
      *     cacheControl: '3600',
      *     upsert: false
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "public/avatar1.png",
      *     "fullPath": "avatars/public/avatar1.png"
      *   },
      *   "error": null
      * }
      * ```
      *
      * @example Upload file using `ArrayBuffer` from base64 file data
      * ```js
      * import { decode } from 'base64-arraybuffer'
      *
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .upload('public/avatar1.png', decode('base64FileData'), {
      *     contentType: 'image/png'
      *   })
      * ```
      */
      async upload(path, fileBody, fileOptions) {
        return this.uploadOrUpdate("POST", path, fileBody, fileOptions);
      }
      /**
      * Upload a file with a token generated from `createSignedUploadUrl`.
      *
      * @category File Buckets
      * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
      * @param token The token generated from `createSignedUploadUrl`
      * @param fileBody The body of the file to be stored in the bucket.
      * @param fileOptions HTTP headers (cacheControl, contentType, etc.).
      * **Note:** The `upsert` option has no effect here. To enable upsert behavior,
      * pass `{ upsert: true }` when calling `createSignedUploadUrl()` instead.
      * @returns Promise with response containing file path and fullPath or error
      *
      * @example Upload to a signed URL
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .uploadToSignedUrl('folder/cat.jpg', 'token-from-createSignedUploadUrl', file)
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "folder/cat.jpg",
      *     "fullPath": "avatars/folder/cat.jpg"
      *   },
      *   "error": null
      * }
      * ```
      */
      async uploadToSignedUrl(path, token, fileBody, fileOptions) {
        var _this3 = this;
        const cleanPath = _this3._removeEmptyFolders(path);
        const _path = _this3._getFinalPath(cleanPath);
        const url = new URL(_this3.url + `/object/upload/sign/${_path}`);
        url.searchParams.set("token", token);
        return _this3.handleOperation(async () => {
          let body;
          const options = _objectSpread2({ upsert: DEFAULT_FILE_OPTIONS.upsert }, fileOptions);
          const headers = _objectSpread2(_objectSpread2({}, _this3.headers), { "x-upsert": String(options.upsert) });
          if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
            body = new FormData();
            body.append("cacheControl", options.cacheControl);
            body.append("", fileBody);
          } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
            body = fileBody;
            body.append("cacheControl", options.cacheControl);
          } else {
            body = fileBody;
            headers["cache-control"] = `max-age=${options.cacheControl}`;
            headers["content-type"] = options.contentType;
          }
          return {
            path: cleanPath,
            fullPath: (await put(_this3.fetch, url.toString(), body, { headers })).Key
          };
        });
      }
      /**
      * Creates a signed upload URL.
      * Signed upload URLs can be used to upload files to the bucket without further authentication.
      * They are valid for 2 hours.
      *
      * @category File Buckets
      * @param path The file path, including the current file name. For example `folder/image.png`.
      * @param options.upsert If set to true, allows the file to be overwritten if it already exists.
      * @returns Promise with response containing signed upload URL, token, and path or error
      *
      * @example Create Signed Upload URL
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUploadUrl('folder/cat.jpg')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "signedUrl": "https://example.supabase.co/storage/v1/object/upload/sign/avatars/folder/cat.jpg?token=<TOKEN>",
      *     "path": "folder/cat.jpg",
      *     "token": "<TOKEN>"
      *   },
      *   "error": null
      * }
      * ```
      */
      async createSignedUploadUrl(path, options) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          let _path = _this4._getFinalPath(path);
          const headers = _objectSpread2({}, _this4.headers);
          if (options === null || options === void 0 ? void 0 : options.upsert) headers["x-upsert"] = "true";
          const data = await post(_this4.fetch, `${_this4.url}/object/upload/sign/${_path}`, {}, { headers });
          const url = new URL(_this4.url + data.url);
          const token = url.searchParams.get("token");
          if (!token) throw new StorageError("No token returned by API");
          return {
            signedUrl: url.toString(),
            path,
            token
          };
        });
      }
      /**
      * Replaces an existing file at the specified path with a new one.
      *
      * @category File Buckets
      * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to update.
      * @param fileBody The body of the file to be stored in the bucket.
      * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
      * @returns Promise with response containing file path, id, and fullPath or error
      *
      * @example Update file
      * ```js
      * const avatarFile = event.target.files[0]
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .update('public/avatar1.png', avatarFile, {
      *     cacheControl: '3600',
      *     upsert: true
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "public/avatar1.png",
      *     "fullPath": "avatars/public/avatar1.png"
      *   },
      *   "error": null
      * }
      * ```
      *
      * @example Update file using `ArrayBuffer` from base64 file data
      * ```js
      * import {decode} from 'base64-arraybuffer'
      *
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .update('public/avatar1.png', decode('base64FileData'), {
      *     contentType: 'image/png'
      *   })
      * ```
      */
      async update(path, fileBody, fileOptions) {
        return this.uploadOrUpdate("PUT", path, fileBody, fileOptions);
      }
      /**
      * Moves an existing file to a new path in the same bucket.
      *
      * @category File Buckets
      * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
      * @param toPath The new file path, including the new file name. For example `folder/image-new.png`.
      * @param options The destination options.
      * @returns Promise with response containing success message or error
      *
      * @example Move file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .move('public/avatar1.png', 'private/avatar2.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully moved"
      *   },
      *   "error": null
      * }
      * ```
      */
      async move(fromPath, toPath, options) {
        var _this6 = this;
        return _this6.handleOperation(async () => {
          return await post(_this6.fetch, `${_this6.url}/object/move`, {
            bucketId: _this6.bucketId,
            sourceKey: fromPath,
            destinationKey: toPath,
            destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
          }, { headers: _this6.headers });
        });
      }
      /**
      * Copies an existing file to a new path in the same bucket.
      *
      * @category File Buckets
      * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
      * @param toPath The new file path, including the new file name. For example `folder/image-copy.png`.
      * @param options The destination options.
      * @returns Promise with response containing copied file path or error
      *
      * @example Copy file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .copy('public/avatar1.png', 'private/avatar2.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "avatars/private/avatar2.png"
      *   },
      *   "error": null
      * }
      * ```
      */
      async copy(fromPath, toPath, options) {
        var _this7 = this;
        return _this7.handleOperation(async () => {
          return { path: (await post(_this7.fetch, `${_this7.url}/object/copy`, {
            bucketId: _this7.bucketId,
            sourceKey: fromPath,
            destinationKey: toPath,
            destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
          }, { headers: _this7.headers })).Key };
        });
      }
      /**
      * Creates a signed URL. Use a signed URL to share a file for a fixed amount of time.
      *
      * @category File Buckets
      * @param path The file path, including the current file name. For example `folder/image.png`.
      * @param expiresIn The number of seconds until the signed URL expires. For example, `60` for a URL which is valid for one minute.
      * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
      * @param options.transform Transform the asset before serving it to the client.
      * @returns Promise with response containing signed URL or error
      *
      * @example Create Signed URL
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrl('folder/avatar1.png', 60)
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
      *   },
      *   "error": null
      * }
      * ```
      *
      * @example Create a signed URL for an asset with transformations
      * ```js
      * const { data } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrl('folder/avatar1.png', 60, {
      *     transform: {
      *       width: 100,
      *       height: 100,
      *     }
      *   })
      * ```
      *
      * @example Create a signed URL which triggers the download of the asset
      * ```js
      * const { data } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrl('folder/avatar1.png', 60, {
      *     download: true,
      *   })
      * ```
      */
      async createSignedUrl(path, expiresIn, options) {
        var _this8 = this;
        return _this8.handleOperation(async () => {
          let _path = _this8._getFinalPath(path);
          let data = await post(_this8.fetch, `${_this8.url}/object/sign/${_path}`, _objectSpread2({ expiresIn }, (options === null || options === void 0 ? void 0 : options.transform) ? { transform: options.transform } : {}), { headers: _this8.headers });
          const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
          return { signedUrl: encodeURI(`${_this8.url}${data.signedURL}${downloadQueryParam}`) };
        });
      }
      /**
      * Creates multiple signed URLs. Use a signed URL to share a file for a fixed amount of time.
      *
      * @category File Buckets
      * @param paths The file paths to be downloaded, including the current file names. For example `['folder/image.png', 'folder2/image2.png']`.
      * @param expiresIn The number of seconds until the signed URLs expire. For example, `60` for URLs which are valid for one minute.
      * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
      * @returns Promise with response containing array of objects with signedUrl, path, and error or error
      *
      * @example Create Signed URLs
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrls(['folder/avatar1.png', 'folder/avatar2.png'], 60)
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [
      *     {
      *       "error": null,
      *       "path": "folder/avatar1.png",
      *       "signedURL": "/object/sign/avatars/folder/avatar1.png?token=<TOKEN>",
      *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
      *     },
      *     {
      *       "error": null,
      *       "path": "folder/avatar2.png",
      *       "signedURL": "/object/sign/avatars/folder/avatar2.png?token=<TOKEN>",
      *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar2.png?token=<TOKEN>"
      *     }
      *   ],
      *   "error": null
      * }
      * ```
      */
      async createSignedUrls(paths, expiresIn, options) {
        var _this9 = this;
        return _this9.handleOperation(async () => {
          const data = await post(_this9.fetch, `${_this9.url}/object/sign/${_this9.bucketId}`, {
            expiresIn,
            paths
          }, { headers: _this9.headers });
          const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
          return data.map((datum) => _objectSpread2(_objectSpread2({}, datum), {}, { signedUrl: datum.signedURL ? encodeURI(`${_this9.url}${datum.signedURL}${downloadQueryParam}`) : null }));
        });
      }
      /**
      * Downloads a file from a private bucket. For public buckets, make a request to the URL returned from `getPublicUrl` instead.
      *
      * @category File Buckets
      * @param path The full path and file name of the file to be downloaded. For example `folder/image.png`.
      * @param options.transform Transform the asset before serving it to the client.
      * @param parameters Additional fetch parameters like signal for cancellation. Supports standard fetch options including cache control.
      * @returns BlobDownloadBuilder instance for downloading the file
      *
      * @example Download file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": <BLOB>,
      *   "error": null
      * }
      * ```
      *
      * @example Download file with transformations
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png', {
      *     transform: {
      *       width: 100,
      *       height: 100,
      *       quality: 80
      *     }
      *   })
      * ```
      *
      * @example Download with cache control (useful in Edge Functions)
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png', {}, { cache: 'no-store' })
      * ```
      *
      * @example Download with abort signal
      * ```js
      * const controller = new AbortController()
      * setTimeout(() => controller.abort(), 5000)
      *
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png', {}, { signal: controller.signal })
      * ```
      */
      download(path, options, parameters) {
        const renderPath = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined" ? "render/image/authenticated" : "object";
        const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
        const queryString = transformationQuery ? `?${transformationQuery}` : "";
        const _path = this._getFinalPath(path);
        const downloadFn = () => get(this.fetch, `${this.url}/${renderPath}/${_path}${queryString}`, {
          headers: this.headers,
          noResolveJson: true
        }, parameters);
        return new BlobDownloadBuilder(downloadFn, this.shouldThrowOnError);
      }
      /**
      * Retrieves the details of an existing file.
      *
      * @category File Buckets
      * @param path The file path, including the file name. For example `folder/image.png`.
      * @returns Promise with response containing file metadata or error
      *
      * @example Get file info
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .info('folder/avatar1.png')
      * ```
      */
      async info(path) {
        var _this10 = this;
        const _path = _this10._getFinalPath(path);
        return _this10.handleOperation(async () => {
          return recursiveToCamel(await get(_this10.fetch, `${_this10.url}/object/info/${_path}`, { headers: _this10.headers }));
        });
      }
      /**
      * Checks the existence of a file.
      *
      * @category File Buckets
      * @param path The file path, including the file name. For example `folder/image.png`.
      * @returns Promise with response containing boolean indicating file existence or error
      *
      * @example Check file existence
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .exists('folder/avatar1.png')
      * ```
      */
      async exists(path) {
        var _this11 = this;
        const _path = _this11._getFinalPath(path);
        try {
          await head(_this11.fetch, `${_this11.url}/object/${_path}`, { headers: _this11.headers });
          return {
            data: true,
            error: null
          };
        } catch (error) {
          if (_this11.shouldThrowOnError) throw error;
          if (isStorageError(error) && error instanceof StorageUnknownError) {
            const originalError = error.originalError;
            if ([400, 404].includes(originalError === null || originalError === void 0 ? void 0 : originalError.status)) return {
              data: false,
              error
            };
          }
          throw error;
        }
      }
      /**
      * A simple convenience function to get the URL for an asset in a public bucket. If you do not want to use this function, you can construct the public URL by concatenating the bucket URL with the path to the asset.
      * This function does not verify if the bucket is public. If a public URL is created for a bucket which is not public, you will not be able to download the asset.
      *
      * @category File Buckets
      * @param path The path and name of the file to generate the public URL for. For example `folder/image.png`.
      * @param options.download Triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
      * @param options.transform Transform the asset before serving it to the client.
      * @returns Object with public URL
      *
      * @example Returns the URL for an asset in a public bucket
      * ```js
      * const { data } = supabase
      *   .storage
      *   .from('public-bucket')
      *   .getPublicUrl('folder/avatar1.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "publicUrl": "https://example.supabase.co/storage/v1/object/public/public-bucket/folder/avatar1.png"
      *   }
      * }
      * ```
      *
      * @example Returns the URL for an asset in a public bucket with transformations
      * ```js
      * const { data } = supabase
      *   .storage
      *   .from('public-bucket')
      *   .getPublicUrl('folder/avatar1.png', {
      *     transform: {
      *       width: 100,
      *       height: 100,
      *     }
      *   })
      * ```
      *
      * @example Returns the URL which triggers the download of an asset in a public bucket
      * ```js
      * const { data } = supabase
      *   .storage
      *   .from('public-bucket')
      *   .getPublicUrl('folder/avatar1.png', {
      *     download: true,
      *   })
      * ```
      */
      getPublicUrl(path, options) {
        const _path = this._getFinalPath(path);
        const _queryString = [];
        const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `download=${options.download === true ? "" : options.download}` : "";
        if (downloadQueryParam !== "") _queryString.push(downloadQueryParam);
        const renderPath = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined" ? "render/image" : "object";
        const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
        if (transformationQuery !== "") _queryString.push(transformationQuery);
        let queryString = _queryString.join("&");
        if (queryString !== "") queryString = `?${queryString}`;
        return { data: { publicUrl: encodeURI(`${this.url}/${renderPath}/public/${_path}${queryString}`) } };
      }
      /**
      * Deletes files within the same bucket
      *
      * @category File Buckets
      * @param paths An array of files to delete, including the path and file name. For example [`'folder/image.png'`].
      * @returns Promise with response containing array of deleted file objects or error
      *
      * @example Delete file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .remove(['folder/avatar1.png'])
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [],
      *   "error": null
      * }
      * ```
      */
      async remove(paths) {
        var _this12 = this;
        return _this12.handleOperation(async () => {
          return await remove(_this12.fetch, `${_this12.url}/object/${_this12.bucketId}`, { prefixes: paths }, { headers: _this12.headers });
        });
      }
      /**
      * Get file metadata
      * @param id the file id to retrieve metadata
      */
      /**
      * Update file metadata
      * @param id the file id to update metadata
      * @param meta the new file metadata
      */
      /**
      * Lists all the files and folders within a path of the bucket.
      *
      * @category File Buckets
      * @param path The folder path.
      * @param options Search options including limit (defaults to 100), offset, sortBy, and search
      * @param parameters Optional fetch parameters including signal for cancellation
      * @returns Promise with response containing array of files or error
      *
      * @example List files in a bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .list('folder', {
      *     limit: 100,
      *     offset: 0,
      *     sortBy: { column: 'name', order: 'asc' },
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "avatar1.png",
      *       "id": "e668cf7f-821b-4a2f-9dce-7dfa5dd1cfd2",
      *       "updated_at": "2024-05-22T23:06:05.580Z",
      *       "created_at": "2024-05-22T23:04:34.443Z",
      *       "last_accessed_at": "2024-05-22T23:04:34.443Z",
      *       "metadata": {
      *         "eTag": "\"c5e8c553235d9af30ef4f6e280790b92\"",
      *         "size": 32175,
      *         "mimetype": "image/png",
      *         "cacheControl": "max-age=3600",
      *         "lastModified": "2024-05-22T23:06:05.574Z",
      *         "contentLength": 32175,
      *         "httpStatusCode": 200
      *       }
      *     }
      *   ],
      *   "error": null
      * }
      * ```
      *
      * @example Search files in a bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .list('folder', {
      *     limit: 100,
      *     offset: 0,
      *     sortBy: { column: 'name', order: 'asc' },
      *     search: 'jon'
      *   })
      * ```
      */
      async list(path, options, parameters) {
        var _this13 = this;
        return _this13.handleOperation(async () => {
          const body = _objectSpread2(_objectSpread2(_objectSpread2({}, DEFAULT_SEARCH_OPTIONS), options), {}, { prefix: path || "" });
          return await post(_this13.fetch, `${_this13.url}/object/list/${_this13.bucketId}`, body, { headers: _this13.headers }, parameters);
        });
      }
      /**
      * @experimental this method signature might change in the future
      *
      * @category File Buckets
      * @param options search options
      * @param parameters
      */
      async listV2(options, parameters) {
        var _this14 = this;
        return _this14.handleOperation(async () => {
          const body = _objectSpread2({}, options);
          return await post(_this14.fetch, `${_this14.url}/object/list-v2/${_this14.bucketId}`, body, { headers: _this14.headers }, parameters);
        });
      }
      encodeMetadata(metadata) {
        return JSON.stringify(metadata);
      }
      toBase64(data) {
        if (typeof Buffer !== "undefined") return Buffer.from(data).toString("base64");
        return btoa(data);
      }
      _getFinalPath(path) {
        return `${this.bucketId}/${path.replace(/^\/+/, "")}`;
      }
      _removeEmptyFolders(path) {
        return path.replace(/^\/|\/$/g, "").replace(/\/+/g, "/");
      }
      transformOptsToQueryString(transform) {
        const params = [];
        if (transform.width) params.push(`width=${transform.width}`);
        if (transform.height) params.push(`height=${transform.height}`);
        if (transform.resize) params.push(`resize=${transform.resize}`);
        if (transform.format) params.push(`format=${transform.format}`);
        if (transform.quality) params.push(`quality=${transform.quality}`);
        return params.join("&");
      }
    };
    var version = "2.95.3";
    var DEFAULT_HEADERS = { "X-Client-Info": `storage-js/${version}` };
    var StorageBucketApi = class extends BaseApiClient {
      constructor(url, headers = {}, fetch$1, opts) {
        const baseUrl = new URL(url);
        if (opts === null || opts === void 0 ? void 0 : opts.useNewHostname) {
          if (/supabase\.(co|in|red)$/.test(baseUrl.hostname) && !baseUrl.hostname.includes("storage.supabase.")) baseUrl.hostname = baseUrl.hostname.replace("supabase.", "storage.supabase.");
        }
        const finalUrl = baseUrl.href.replace(/\/$/, "");
        const finalHeaders = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS), headers);
        super(finalUrl, finalHeaders, fetch$1, "storage");
      }
      /**
      * Retrieves the details of all Storage buckets within an existing project.
      *
      * @category File Buckets
      * @param options Query parameters for listing buckets
      * @param options.limit Maximum number of buckets to return
      * @param options.offset Number of buckets to skip
      * @param options.sortColumn Column to sort by ('id', 'name', 'created_at', 'updated_at')
      * @param options.sortOrder Sort order ('asc' or 'desc')
      * @param options.search Search term to filter bucket names
      * @returns Promise with response containing array of buckets or error
      *
      * @example List buckets
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .listBuckets()
      * ```
      *
      * @example List buckets with options
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .listBuckets({
      *     limit: 10,
      *     offset: 0,
      *     sortColumn: 'created_at',
      *     sortOrder: 'desc',
      *     search: 'prod'
      *   })
      * ```
      */
      async listBuckets(options) {
        var _this = this;
        return _this.handleOperation(async () => {
          const queryString = _this.listBucketOptionsToQueryString(options);
          return await get(_this.fetch, `${_this.url}/bucket${queryString}`, { headers: _this.headers });
        });
      }
      /**
      * Retrieves the details of an existing Storage bucket.
      *
      * @category File Buckets
      * @param id The unique identifier of the bucket you would like to retrieve.
      * @returns Promise with response containing bucket details or error
      *
      * @example Get bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .getBucket('avatars')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "id": "avatars",
      *     "name": "avatars",
      *     "owner": "",
      *     "public": false,
      *     "file_size_limit": 1024,
      *     "allowed_mime_types": [
      *       "image/png"
      *     ],
      *     "created_at": "2024-05-22T22:26:05.100Z",
      *     "updated_at": "2024-05-22T22:26:05.100Z"
      *   },
      *   "error": null
      * }
      * ```
      */
      async getBucket(id) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          return await get(_this2.fetch, `${_this2.url}/bucket/${id}`, { headers: _this2.headers });
        });
      }
      /**
      * Creates a new Storage bucket
      *
      * @category File Buckets
      * @param id A unique identifier for the bucket you are creating.
      * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations. By default, buckets are private.
      * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
      * The global file size limit takes precedence over this value.
      * The default value is null, which doesn't set a per bucket file size limit.
      * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
      * The default value is null, which allows files with all mime types to be uploaded.
      * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
      * @param options.type (private-beta) specifies the bucket type. see `BucketType` for more details.
      *   - default bucket type is `STANDARD`
      * @returns Promise with response containing newly created bucket name or error
      *
      * @example Create bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .createBucket('avatars', {
      *     public: false,
      *     allowedMimeTypes: ['image/png'],
      *     fileSizeLimit: 1024
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "name": "avatars"
      *   },
      *   "error": null
      * }
      * ```
      */
      async createBucket(id, options = { public: false }) {
        var _this3 = this;
        return _this3.handleOperation(async () => {
          return await post(_this3.fetch, `${_this3.url}/bucket`, {
            id,
            name: id,
            type: options.type,
            public: options.public,
            file_size_limit: options.fileSizeLimit,
            allowed_mime_types: options.allowedMimeTypes
          }, { headers: _this3.headers });
        });
      }
      /**
      * Updates a Storage bucket
      *
      * @category File Buckets
      * @param id A unique identifier for the bucket you are updating.
      * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations.
      * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
      * The global file size limit takes precedence over this value.
      * The default value is null, which doesn't set a per bucket file size limit.
      * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
      * The default value is null, which allows files with all mime types to be uploaded.
      * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
      * @returns Promise with response containing success message or error
      *
      * @example Update bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .updateBucket('avatars', {
      *     public: false,
      *     allowedMimeTypes: ['image/png'],
      *     fileSizeLimit: 1024
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully updated"
      *   },
      *   "error": null
      * }
      * ```
      */
      async updateBucket(id, options) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          return await put(_this4.fetch, `${_this4.url}/bucket/${id}`, {
            id,
            name: id,
            public: options.public,
            file_size_limit: options.fileSizeLimit,
            allowed_mime_types: options.allowedMimeTypes
          }, { headers: _this4.headers });
        });
      }
      /**
      * Removes all objects inside a single bucket.
      *
      * @category File Buckets
      * @param id The unique identifier of the bucket you would like to empty.
      * @returns Promise with success message or error
      *
      * @example Empty bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .emptyBucket('avatars')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully emptied"
      *   },
      *   "error": null
      * }
      * ```
      */
      async emptyBucket(id) {
        var _this5 = this;
        return _this5.handleOperation(async () => {
          return await post(_this5.fetch, `${_this5.url}/bucket/${id}/empty`, {}, { headers: _this5.headers });
        });
      }
      /**
      * Deletes an existing bucket. A bucket can't be deleted with existing objects inside it.
      * You must first `empty()` the bucket.
      *
      * @category File Buckets
      * @param id The unique identifier of the bucket you would like to delete.
      * @returns Promise with success message or error
      *
      * @example Delete bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .deleteBucket('avatars')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully deleted"
      *   },
      *   "error": null
      * }
      * ```
      */
      async deleteBucket(id) {
        var _this6 = this;
        return _this6.handleOperation(async () => {
          return await remove(_this6.fetch, `${_this6.url}/bucket/${id}`, {}, { headers: _this6.headers });
        });
      }
      listBucketOptionsToQueryString(options) {
        const params = {};
        if (options) {
          if ("limit" in options) params.limit = String(options.limit);
          if ("offset" in options) params.offset = String(options.offset);
          if (options.search) params.search = options.search;
          if (options.sortColumn) params.sortColumn = options.sortColumn;
          if (options.sortOrder) params.sortOrder = options.sortOrder;
        }
        return Object.keys(params).length > 0 ? "?" + new URLSearchParams(params).toString() : "";
      }
    };
    var StorageAnalyticsClient = class extends BaseApiClient {
      /**
      * @alpha
      *
      * Creates a new StorageAnalyticsClient instance
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param url - The base URL for the storage API
      * @param headers - HTTP headers to include in requests
      * @param fetch - Optional custom fetch implementation
      *
      * @example
      * ```typescript
      * const client = new StorageAnalyticsClient(url, headers)
      * ```
      */
      constructor(url, headers = {}, fetch$1) {
        const finalUrl = url.replace(/\/$/, "");
        const finalHeaders = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS), headers);
        super(finalUrl, finalHeaders, fetch$1, "storage");
      }
      /**
      * @alpha
      *
      * Creates a new analytics bucket using Iceberg tables
      * Analytics buckets are optimized for analytical queries and data processing
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param name A unique name for the bucket you are creating
      * @returns Promise with response containing newly created analytics bucket or error
      *
      * @example Create analytics bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .analytics
      *   .createBucket('analytics-data')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "name": "analytics-data",
      *     "type": "ANALYTICS",
      *     "format": "iceberg",
      *     "created_at": "2024-05-22T22:26:05.100Z",
      *     "updated_at": "2024-05-22T22:26:05.100Z"
      *   },
      *   "error": null
      * }
      * ```
      */
      async createBucket(name) {
        var _this = this;
        return _this.handleOperation(async () => {
          return await post(_this.fetch, `${_this.url}/bucket`, { name }, { headers: _this.headers });
        });
      }
      /**
      * @alpha
      *
      * Retrieves the details of all Analytics Storage buckets within an existing project
      * Only returns buckets of type 'ANALYTICS'
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param options Query parameters for listing buckets
      * @param options.limit Maximum number of buckets to return
      * @param options.offset Number of buckets to skip
      * @param options.sortColumn Column to sort by ('name', 'created_at', 'updated_at')
      * @param options.sortOrder Sort order ('asc' or 'desc')
      * @param options.search Search term to filter bucket names
      * @returns Promise with response containing array of analytics buckets or error
      *
      * @example List analytics buckets
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .analytics
      *   .listBuckets({
      *     limit: 10,
      *     offset: 0,
      *     sortColumn: 'created_at',
      *     sortOrder: 'desc'
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "analytics-data",
      *       "type": "ANALYTICS",
      *       "format": "iceberg",
      *       "created_at": "2024-05-22T22:26:05.100Z",
      *       "updated_at": "2024-05-22T22:26:05.100Z"
      *     }
      *   ],
      *   "error": null
      * }
      * ```
      */
      async listBuckets(options) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          const queryParams = new URLSearchParams();
          if ((options === null || options === void 0 ? void 0 : options.limit) !== void 0) queryParams.set("limit", options.limit.toString());
          if ((options === null || options === void 0 ? void 0 : options.offset) !== void 0) queryParams.set("offset", options.offset.toString());
          if (options === null || options === void 0 ? void 0 : options.sortColumn) queryParams.set("sortColumn", options.sortColumn);
          if (options === null || options === void 0 ? void 0 : options.sortOrder) queryParams.set("sortOrder", options.sortOrder);
          if (options === null || options === void 0 ? void 0 : options.search) queryParams.set("search", options.search);
          const queryString = queryParams.toString();
          const url = queryString ? `${_this2.url}/bucket?${queryString}` : `${_this2.url}/bucket`;
          return await get(_this2.fetch, url, { headers: _this2.headers });
        });
      }
      /**
      * @alpha
      *
      * Deletes an existing analytics bucket
      * A bucket can't be deleted with existing objects inside it
      * You must first empty the bucket before deletion
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param bucketName The unique identifier of the bucket you would like to delete
      * @returns Promise with response containing success message or error
      *
      * @example Delete analytics bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .analytics
      *   .deleteBucket('analytics-data')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully deleted"
      *   },
      *   "error": null
      * }
      * ```
      */
      async deleteBucket(bucketName) {
        var _this3 = this;
        return _this3.handleOperation(async () => {
          return await remove(_this3.fetch, `${_this3.url}/bucket/${bucketName}`, {}, { headers: _this3.headers });
        });
      }
      /**
      * @alpha
      *
      * Get an Iceberg REST Catalog client configured for a specific analytics bucket
      * Use this to perform advanced table and namespace operations within the bucket
      * The returned client provides full access to the Apache Iceberg REST Catalog API
      * with the Supabase `{ data, error }` pattern for consistent error handling on all operations.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param bucketName - The name of the analytics bucket (warehouse) to connect to
      * @returns The wrapped Iceberg catalog client
      * @throws {StorageError} If the bucket name is invalid
      *
      * @example Get catalog and create table
      * ```js
      * // First, create an analytics bucket
      * const { data: bucket, error: bucketError } = await supabase
      *   .storage
      *   .analytics
      *   .createBucket('analytics-data')
      *
      * // Get the Iceberg catalog for that bucket
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // Create a namespace
      * const { error: nsError } = await catalog.createNamespace({ namespace: ['default'] })
      *
      * // Create a table with schema
      * const { data: tableMetadata, error: tableError } = await catalog.createTable(
      *   { namespace: ['default'] },
      *   {
      *     name: 'events',
      *     schema: {
      *       type: 'struct',
      *       fields: [
      *         { id: 1, name: 'id', type: 'long', required: true },
      *         { id: 2, name: 'timestamp', type: 'timestamp', required: true },
      *         { id: 3, name: 'user_id', type: 'string', required: false }
      *       ],
      *       'schema-id': 0,
      *       'identifier-field-ids': [1]
      *     },
      *     'partition-spec': {
      *       'spec-id': 0,
      *       fields: []
      *     },
      *     'write-order': {
      *       'order-id': 0,
      *       fields: []
      *     },
      *     properties: {
      *       'write.format.default': 'parquet'
      *     }
      *   }
      * )
      * ```
      *
      * @example List tables in namespace
      * ```js
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // List all tables in the default namespace
      * const { data: tables, error: listError } = await catalog.listTables({ namespace: ['default'] })
      * if (listError) {
      *   if (listError.isNotFound()) {
      *     console.log('Namespace not found')
      *   }
      *   return
      * }
      * console.log(tables) // [{ namespace: ['default'], name: 'events' }]
      * ```
      *
      * @example Working with namespaces
      * ```js
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // List all namespaces
      * const { data: namespaces } = await catalog.listNamespaces()
      *
      * // Create namespace with properties
      * await catalog.createNamespace(
      *   { namespace: ['production'] },
      *   { properties: { owner: 'data-team', env: 'prod' } }
      * )
      * ```
      *
      * @example Cleanup operations
      * ```js
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // Drop table with purge option (removes all data)
      * const { error: dropError } = await catalog.dropTable(
      *   { namespace: ['default'], name: 'events' },
      *   { purge: true }
      * )
      *
      * if (dropError?.isNotFound()) {
      *   console.log('Table does not exist')
      * }
      *
      * // Drop namespace (must be empty)
      * await catalog.dropNamespace({ namespace: ['default'] })
      * ```
      *
      * @remarks
      * This method provides a bridge between Supabase's bucket management and the standard
      * Apache Iceberg REST Catalog API. The bucket name maps to the Iceberg warehouse parameter.
      * All authentication and configuration is handled automatically using your Supabase credentials.
      *
      * **Error Handling**: Invalid bucket names throw immediately. All catalog
      * operations return `{ data, error }` where errors are `IcebergError` instances from iceberg-js.
      * Use helper methods like `error.isNotFound()` or check `error.status` for specific error handling.
      * Use `.throwOnError()` on the analytics client if you prefer exceptions for catalog operations.
      *
      * **Cleanup Operations**: When using `dropTable`, the `purge: true` option permanently
      * deletes all table data. Without it, the table is marked as deleted but data remains.
      *
      * **Library Dependency**: The returned catalog wraps `IcebergRestCatalog` from iceberg-js.
      * For complete API documentation and advanced usage, refer to the
      * [iceberg-js documentation](https://supabase.github.io/iceberg-js/).
      */
      from(bucketName) {
        var _this4 = this;
        if (!isValidBucketName(bucketName)) throw new StorageError("Invalid bucket name: File, folder, and bucket names must follow AWS object key naming guidelines and should avoid the use of any other characters.");
        const catalog = new iceberg_js.IcebergRestCatalog({
          baseUrl: this.url,
          catalogName: bucketName,
          auth: {
            type: "custom",
            getHeaders: async () => _this4.headers
          },
          fetch: this.fetch
        });
        const shouldThrowOnError = this.shouldThrowOnError;
        return new Proxy(catalog, { get(target, prop) {
          const value = target[prop];
          if (typeof value !== "function") return value;
          return async (...args) => {
            try {
              return {
                data: await value.apply(target, args),
                error: null
              };
            } catch (error) {
              if (shouldThrowOnError) throw error;
              return {
                data: null,
                error
              };
            }
          };
        } });
      }
    };
    var VectorIndexApi = class extends BaseApiClient {
      /** Creates a new VectorIndexApi instance */
      constructor(url, headers = {}, fetch$1) {
        const finalUrl = url.replace(/\/$/, "");
        const finalHeaders = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS), {}, { "Content-Type": "application/json" }, headers);
        super(finalUrl, finalHeaders, fetch$1, "vectors");
      }
      /** Creates a new vector index within a bucket */
      async createIndex(options) {
        var _this = this;
        return _this.handleOperation(async () => {
          return await vectorsApi.post(_this.fetch, `${_this.url}/CreateIndex`, options, { headers: _this.headers }) || {};
        });
      }
      /** Retrieves metadata for a specific vector index */
      async getIndex(vectorBucketName, indexName) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          return await vectorsApi.post(_this2.fetch, `${_this2.url}/GetIndex`, {
            vectorBucketName,
            indexName
          }, { headers: _this2.headers });
        });
      }
      /** Lists vector indexes within a bucket with optional filtering and pagination */
      async listIndexes(options) {
        var _this3 = this;
        return _this3.handleOperation(async () => {
          return await vectorsApi.post(_this3.fetch, `${_this3.url}/ListIndexes`, options, { headers: _this3.headers });
        });
      }
      /** Deletes a vector index and all its data */
      async deleteIndex(vectorBucketName, indexName) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          return await vectorsApi.post(_this4.fetch, `${_this4.url}/DeleteIndex`, {
            vectorBucketName,
            indexName
          }, { headers: _this4.headers }) || {};
        });
      }
    };
    var VectorDataApi = class extends BaseApiClient {
      /** Creates a new VectorDataApi instance */
      constructor(url, headers = {}, fetch$1) {
        const finalUrl = url.replace(/\/$/, "");
        const finalHeaders = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS), {}, { "Content-Type": "application/json" }, headers);
        super(finalUrl, finalHeaders, fetch$1, "vectors");
      }
      /** Inserts or updates vectors in batch (1-500 per request) */
      async putVectors(options) {
        var _this = this;
        if (options.vectors.length < 1 || options.vectors.length > 500) throw new Error("Vector batch size must be between 1 and 500 items");
        return _this.handleOperation(async () => {
          return await vectorsApi.post(_this.fetch, `${_this.url}/PutVectors`, options, { headers: _this.headers }) || {};
        });
      }
      /** Retrieves vectors by their keys in batch */
      async getVectors(options) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          return await vectorsApi.post(_this2.fetch, `${_this2.url}/GetVectors`, options, { headers: _this2.headers });
        });
      }
      /** Lists vectors in an index with pagination */
      async listVectors(options) {
        var _this3 = this;
        if (options.segmentCount !== void 0) {
          if (options.segmentCount < 1 || options.segmentCount > 16) throw new Error("segmentCount must be between 1 and 16");
          if (options.segmentIndex !== void 0) {
            if (options.segmentIndex < 0 || options.segmentIndex >= options.segmentCount) throw new Error(`segmentIndex must be between 0 and ${options.segmentCount - 1}`);
          }
        }
        return _this3.handleOperation(async () => {
          return await vectorsApi.post(_this3.fetch, `${_this3.url}/ListVectors`, options, { headers: _this3.headers });
        });
      }
      /** Queries for similar vectors using approximate nearest neighbor search */
      async queryVectors(options) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          return await vectorsApi.post(_this4.fetch, `${_this4.url}/QueryVectors`, options, { headers: _this4.headers });
        });
      }
      /** Deletes vectors by their keys in batch (1-500 per request) */
      async deleteVectors(options) {
        var _this5 = this;
        if (options.keys.length < 1 || options.keys.length > 500) throw new Error("Keys batch size must be between 1 and 500 items");
        return _this5.handleOperation(async () => {
          return await vectorsApi.post(_this5.fetch, `${_this5.url}/DeleteVectors`, options, { headers: _this5.headers }) || {};
        });
      }
    };
    var VectorBucketApi = class extends BaseApiClient {
      /** Creates a new VectorBucketApi instance */
      constructor(url, headers = {}, fetch$1) {
        const finalUrl = url.replace(/\/$/, "");
        const finalHeaders = _objectSpread2(_objectSpread2({}, DEFAULT_HEADERS), {}, { "Content-Type": "application/json" }, headers);
        super(finalUrl, finalHeaders, fetch$1, "vectors");
      }
      /** Creates a new vector bucket */
      async createBucket(vectorBucketName) {
        var _this = this;
        return _this.handleOperation(async () => {
          return await vectorsApi.post(_this.fetch, `${_this.url}/CreateVectorBucket`, { vectorBucketName }, { headers: _this.headers }) || {};
        });
      }
      /** Retrieves metadata for a specific vector bucket */
      async getBucket(vectorBucketName) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          return await vectorsApi.post(_this2.fetch, `${_this2.url}/GetVectorBucket`, { vectorBucketName }, { headers: _this2.headers });
        });
      }
      /** Lists vector buckets with optional filtering and pagination */
      async listBuckets(options = {}) {
        var _this3 = this;
        return _this3.handleOperation(async () => {
          return await vectorsApi.post(_this3.fetch, `${_this3.url}/ListVectorBuckets`, options, { headers: _this3.headers });
        });
      }
      /** Deletes a vector bucket (must be empty first) */
      async deleteBucket(vectorBucketName) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          return await vectorsApi.post(_this4.fetch, `${_this4.url}/DeleteVectorBucket`, { vectorBucketName }, { headers: _this4.headers }) || {};
        });
      }
    };
    var StorageVectorsClient = class extends VectorBucketApi {
      /**
      * @alpha
      *
      * Creates a StorageVectorsClient that can manage buckets, indexes, and vectors.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param url - Base URL of the Storage Vectors REST API.
      * @param options.headers - Optional headers (for example `Authorization`) applied to every request.
      * @param options.fetch - Optional custom `fetch` implementation for non-browser runtimes.
      *
      * @example
      * ```typescript
      * const client = new StorageVectorsClient(url, options)
      * ```
      */
      constructor(url, options = {}) {
        super(url, options.headers || {}, options.fetch);
      }
      /**
      *
      * @alpha
      *
      * Access operations for a specific vector bucket
      * Returns a scoped client for index and vector operations within the bucket
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Name of the vector bucket
      * @returns Bucket-scoped client with index and vector operations
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * ```
      */
      from(vectorBucketName) {
        return new VectorBucketScope(this.url, this.headers, vectorBucketName, this.fetch);
      }
      /**
      *
      * @alpha
      *
      * Creates a new vector bucket
      * Vector buckets are containers for vector indexes and their data
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Unique name for the vector bucket
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .createBucket('embeddings-prod')
      * ```
      */
      async createBucket(vectorBucketName) {
        var _superprop_getCreateBucket = () => super.createBucket, _this = this;
        return _superprop_getCreateBucket().call(_this, vectorBucketName);
      }
      /**
      *
      * @alpha
      *
      * Retrieves metadata for a specific vector bucket
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Name of the vector bucket
      * @returns Promise with bucket metadata or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .getBucket('embeddings-prod')
      *
      * console.log('Bucket created:', data?.vectorBucket.creationTime)
      * ```
      */
      async getBucket(vectorBucketName) {
        var _superprop_getGetBucket = () => super.getBucket, _this2 = this;
        return _superprop_getGetBucket().call(_this2, vectorBucketName);
      }
      /**
      *
      * @alpha
      *
      * Lists all vector buckets with optional filtering and pagination
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Optional filters (prefix, maxResults, nextToken)
      * @returns Promise with list of buckets or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .listBuckets({ prefix: 'embeddings-' })
      *
      * data?.vectorBuckets.forEach(bucket => {
      *   console.log(bucket.vectorBucketName)
      * })
      * ```
      */
      async listBuckets(options = {}) {
        var _superprop_getListBuckets = () => super.listBuckets, _this3 = this;
        return _superprop_getListBuckets().call(_this3, options);
      }
      /**
      *
      * @alpha
      *
      * Deletes a vector bucket (bucket must be empty)
      * All indexes must be deleted before deleting the bucket
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Name of the vector bucket to delete
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .deleteBucket('embeddings-old')
      * ```
      */
      async deleteBucket(vectorBucketName) {
        var _superprop_getDeleteBucket = () => super.deleteBucket, _this4 = this;
        return _superprop_getDeleteBucket().call(_this4, vectorBucketName);
      }
    };
    var VectorBucketScope = class extends VectorIndexApi {
      /**
      * @alpha
      *
      * Creates a helper that automatically scopes all index operations to the provided bucket.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * ```
      */
      constructor(url, headers, vectorBucketName, fetch$1) {
        super(url, headers, fetch$1);
        this.vectorBucketName = vectorBucketName;
      }
      /**
      *
      * @alpha
      *
      * Creates a new vector index in this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Index configuration (vectorBucketName is automatically set)
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * await bucket.createIndex({
      *   indexName: 'documents-openai',
      *   dataType: 'float32',
      *   dimension: 1536,
      *   distanceMetric: 'cosine',
      *   metadataConfiguration: {
      *     nonFilterableMetadataKeys: ['raw_text']
      *   }
      * })
      * ```
      */
      async createIndex(options) {
        var _superprop_getCreateIndex = () => super.createIndex, _this5 = this;
        return _superprop_getCreateIndex().call(_this5, _objectSpread2(_objectSpread2({}, options), {}, { vectorBucketName: _this5.vectorBucketName }));
      }
      /**
      *
      * @alpha
      *
      * Lists indexes in this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Listing options (vectorBucketName is automatically set)
      * @returns Promise with response containing indexes array and pagination token or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * const { data } = await bucket.listIndexes({ prefix: 'documents-' })
      * ```
      */
      async listIndexes(options = {}) {
        var _superprop_getListIndexes = () => super.listIndexes, _this6 = this;
        return _superprop_getListIndexes().call(_this6, _objectSpread2(_objectSpread2({}, options), {}, { vectorBucketName: _this6.vectorBucketName }));
      }
      /**
      *
      * @alpha
      *
      * Retrieves metadata for a specific index in this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param indexName - Name of the index to retrieve
      * @returns Promise with index metadata or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * const { data } = await bucket.getIndex('documents-openai')
      * console.log('Dimension:', data?.index.dimension)
      * ```
      */
      async getIndex(indexName) {
        var _superprop_getGetIndex = () => super.getIndex, _this7 = this;
        return _superprop_getGetIndex().call(_this7, _this7.vectorBucketName, indexName);
      }
      /**
      *
      * @alpha
      *
      * Deletes an index from this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param indexName - Name of the index to delete
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * await bucket.deleteIndex('old-index')
      * ```
      */
      async deleteIndex(indexName) {
        var _superprop_getDeleteIndex = () => super.deleteIndex, _this8 = this;
        return _superprop_getDeleteIndex().call(_this8, _this8.vectorBucketName, indexName);
      }
      /**
      *
      * @alpha
      *
      * Access operations for a specific index within this bucket
      * Returns a scoped client for vector data operations
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param indexName - Name of the index
      * @returns Index-scoped client with vector data operations
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      *
      * // Insert vectors
      * await index.putVectors({
      *   vectors: [
      *     { key: 'doc-1', data: { float32: [...] }, metadata: { title: 'Intro' } }
      *   ]
      * })
      *
      * // Query similar vectors
      * const { data } = await index.queryVectors({
      *   queryVector: { float32: [...] },
      *   topK: 5
      * })
      * ```
      */
      index(indexName) {
        return new VectorIndexScope(this.url, this.headers, this.vectorBucketName, indexName, this.fetch);
      }
    };
    var VectorIndexScope = class extends VectorDataApi {
      /**
      *
      * @alpha
      *
      * Creates a helper that automatically scopes all vector operations to the provided bucket/index names.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * ```
      */
      constructor(url, headers, vectorBucketName, indexName, fetch$1) {
        super(url, headers, fetch$1);
        this.vectorBucketName = vectorBucketName;
        this.indexName = indexName;
      }
      /**
      *
      * @alpha
      *
      * Inserts or updates vectors in this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Vector insertion options (bucket and index names automatically set)
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * await index.putVectors({
      *   vectors: [
      *     {
      *       key: 'doc-1',
      *       data: { float32: [0.1, 0.2, ...] },
      *       metadata: { title: 'Introduction', page: 1 }
      *     }
      *   ]
      * })
      * ```
      */
      async putVectors(options) {
        var _superprop_getPutVectors = () => super.putVectors, _this9 = this;
        return _superprop_getPutVectors().call(_this9, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this9.vectorBucketName,
          indexName: _this9.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Retrieves vectors by keys from this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Vector retrieval options (bucket and index names automatically set)
      * @returns Promise with response containing vectors array or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * const { data } = await index.getVectors({
      *   keys: ['doc-1', 'doc-2'],
      *   returnMetadata: true
      * })
      * ```
      */
      async getVectors(options) {
        var _superprop_getGetVectors = () => super.getVectors, _this10 = this;
        return _superprop_getGetVectors().call(_this10, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this10.vectorBucketName,
          indexName: _this10.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Lists vectors in this index with pagination
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Listing options (bucket and index names automatically set)
      * @returns Promise with response containing vectors array and pagination token or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * const { data } = await index.listVectors({
      *   maxResults: 500,
      *   returnMetadata: true
      * })
      * ```
      */
      async listVectors(options = {}) {
        var _superprop_getListVectors = () => super.listVectors, _this11 = this;
        return _superprop_getListVectors().call(_this11, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this11.vectorBucketName,
          indexName: _this11.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Queries for similar vectors in this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Query options (bucket and index names automatically set)
      * @returns Promise with response containing matches array of similar vectors ordered by distance or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * const { data } = await index.queryVectors({
      *   queryVector: { float32: [0.1, 0.2, ...] },
      *   topK: 5,
      *   filter: { category: 'technical' },
      *   returnDistance: true,
      *   returnMetadata: true
      * })
      * ```
      */
      async queryVectors(options) {
        var _superprop_getQueryVectors = () => super.queryVectors, _this12 = this;
        return _superprop_getQueryVectors().call(_this12, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this12.vectorBucketName,
          indexName: _this12.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Deletes vectors by keys from this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Deletion options (bucket and index names automatically set)
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * await index.deleteVectors({
      *   keys: ['doc-1', 'doc-2', 'doc-3']
      * })
      * ```
      */
      async deleteVectors(options) {
        var _superprop_getDeleteVectors = () => super.deleteVectors, _this13 = this;
        return _superprop_getDeleteVectors().call(_this13, _objectSpread2(_objectSpread2({}, options), {}, {
          vectorBucketName: _this13.vectorBucketName,
          indexName: _this13.indexName
        }));
      }
    };
    var StorageClient = class extends StorageBucketApi {
      /**
      * Creates a client for Storage buckets, files, analytics, and vectors.
      *
      * @category File Buckets
      * @example
      * ```ts
      * import { StorageClient } from '@supabase/storage-js'
      *
      * const storage = new StorageClient('https://xyzcompany.supabase.co/storage/v1', {
      *   apikey: 'public-anon-key',
      * })
      * const avatars = storage.from('avatars')
      * ```
      */
      constructor(url, headers = {}, fetch$1, opts) {
        super(url, headers, fetch$1, opts);
      }
      /**
      * Perform file operation in a bucket.
      *
      * @category File Buckets
      * @param id The bucket id to operate on.
      *
      * @example
      * ```typescript
      * const avatars = supabase.storage.from('avatars')
      * ```
      */
      from(id) {
        return new StorageFileApi(this.url, this.headers, id, this.fetch);
      }
      /**
      *
      * @alpha
      *
      * Access vector storage operations.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @returns A StorageVectorsClient instance configured with the current storage settings.
      */
      get vectors() {
        return new StorageVectorsClient(this.url + "/vector", {
          headers: this.headers,
          fetch: this.fetch
        });
      }
      /**
      *
      * @alpha
      *
      * Access analytics storage operations using Iceberg tables.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @returns A StorageAnalyticsClient instance configured with the current storage settings.
      */
      get analytics() {
        return new StorageAnalyticsClient(this.url + "/iceberg", this.headers, this.fetch);
      }
    };
    exports2.StorageAnalyticsClient = StorageAnalyticsClient;
    exports2.StorageApiError = StorageApiError;
    exports2.StorageClient = StorageClient;
    exports2.StorageError = StorageError;
    exports2.StorageUnknownError = StorageUnknownError;
    exports2.StorageVectorsApiError = StorageVectorsApiError;
    exports2.StorageVectorsClient = StorageVectorsClient;
    exports2.StorageVectorsError = StorageVectorsError;
    exports2.StorageVectorsErrorCode = StorageVectorsErrorCode;
    exports2.StorageVectorsUnknownError = StorageVectorsUnknownError;
    exports2.VectorBucketApi = VectorBucketApi;
    exports2.VectorBucketScope = VectorBucketScope;
    exports2.VectorDataApi = VectorDataApi;
    exports2.VectorIndexApi = VectorIndexApi;
    exports2.VectorIndexScope = VectorIndexScope;
    exports2.isStorageError = isStorageError;
    exports2.isStorageVectorsError = isStorageVectorsError;
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/version.js
var require_version2 = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/version.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.version = void 0;
    exports2.version = "2.95.3";
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/constants.js
var require_constants2 = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.JWKS_TTL = exports2.BASE64URL_REGEX = exports2.API_VERSIONS = exports2.API_VERSION_HEADER_NAME = exports2.NETWORK_FAILURE = exports2.DEFAULT_HEADERS = exports2.AUDIENCE = exports2.STORAGE_KEY = exports2.GOTRUE_URL = exports2.EXPIRY_MARGIN_MS = exports2.AUTO_REFRESH_TICK_THRESHOLD = exports2.AUTO_REFRESH_TICK_DURATION_MS = void 0;
    var version_1 = require_version2();
    exports2.AUTO_REFRESH_TICK_DURATION_MS = 30 * 1e3;
    exports2.AUTO_REFRESH_TICK_THRESHOLD = 3;
    exports2.EXPIRY_MARGIN_MS = exports2.AUTO_REFRESH_TICK_THRESHOLD * exports2.AUTO_REFRESH_TICK_DURATION_MS;
    exports2.GOTRUE_URL = "http://localhost:9999";
    exports2.STORAGE_KEY = "supabase.auth.token";
    exports2.AUDIENCE = "";
    exports2.DEFAULT_HEADERS = { "X-Client-Info": `gotrue-js/${version_1.version}` };
    exports2.NETWORK_FAILURE = {
      MAX_RETRIES: 10,
      RETRY_INTERVAL: 2
      // in deciseconds
    };
    exports2.API_VERSION_HEADER_NAME = "X-Supabase-Api-Version";
    exports2.API_VERSIONS = {
      "2024-01-01": {
        timestamp: Date.parse("2024-01-01T00:00:00.0Z"),
        name: "2024-01-01"
      }
    };
    exports2.BASE64URL_REGEX = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}$|[a-z0-9_-]{2}$)$/i;
    exports2.JWKS_TTL = 10 * 60 * 1e3;
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/errors.js
var require_errors = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/errors.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.AuthInvalidJwtError = exports2.AuthWeakPasswordError = exports2.AuthRetryableFetchError = exports2.AuthPKCECodeVerifierMissingError = exports2.AuthPKCEGrantCodeExchangeError = exports2.AuthImplicitGrantRedirectError = exports2.AuthInvalidCredentialsError = exports2.AuthInvalidTokenResponseError = exports2.AuthSessionMissingError = exports2.CustomAuthError = exports2.AuthUnknownError = exports2.AuthApiError = exports2.AuthError = void 0;
    exports2.isAuthError = isAuthError;
    exports2.isAuthApiError = isAuthApiError;
    exports2.isAuthSessionMissingError = isAuthSessionMissingError;
    exports2.isAuthImplicitGrantRedirectError = isAuthImplicitGrantRedirectError;
    exports2.isAuthPKCECodeVerifierMissingError = isAuthPKCECodeVerifierMissingError;
    exports2.isAuthRetryableFetchError = isAuthRetryableFetchError;
    exports2.isAuthWeakPasswordError = isAuthWeakPasswordError;
    var AuthError = class extends Error {
      constructor(message, status, code) {
        super(message);
        this.__isAuthError = true;
        this.name = "AuthError";
        this.status = status;
        this.code = code;
      }
    };
    exports2.AuthError = AuthError;
    function isAuthError(error) {
      return typeof error === "object" && error !== null && "__isAuthError" in error;
    }
    var AuthApiError = class extends AuthError {
      constructor(message, status, code) {
        super(message, status, code);
        this.name = "AuthApiError";
        this.status = status;
        this.code = code;
      }
    };
    exports2.AuthApiError = AuthApiError;
    function isAuthApiError(error) {
      return isAuthError(error) && error.name === "AuthApiError";
    }
    var AuthUnknownError = class extends AuthError {
      constructor(message, originalError) {
        super(message);
        this.name = "AuthUnknownError";
        this.originalError = originalError;
      }
    };
    exports2.AuthUnknownError = AuthUnknownError;
    var CustomAuthError = class extends AuthError {
      constructor(message, name, status, code) {
        super(message, status, code);
        this.name = name;
        this.status = status;
      }
    };
    exports2.CustomAuthError = CustomAuthError;
    var AuthSessionMissingError = class extends CustomAuthError {
      constructor() {
        super("Auth session missing!", "AuthSessionMissingError", 400, void 0);
      }
    };
    exports2.AuthSessionMissingError = AuthSessionMissingError;
    function isAuthSessionMissingError(error) {
      return isAuthError(error) && error.name === "AuthSessionMissingError";
    }
    var AuthInvalidTokenResponseError = class extends CustomAuthError {
      constructor() {
        super("Auth session or user missing", "AuthInvalidTokenResponseError", 500, void 0);
      }
    };
    exports2.AuthInvalidTokenResponseError = AuthInvalidTokenResponseError;
    var AuthInvalidCredentialsError = class extends CustomAuthError {
      constructor(message) {
        super(message, "AuthInvalidCredentialsError", 400, void 0);
      }
    };
    exports2.AuthInvalidCredentialsError = AuthInvalidCredentialsError;
    var AuthImplicitGrantRedirectError = class extends CustomAuthError {
      constructor(message, details = null) {
        super(message, "AuthImplicitGrantRedirectError", 500, void 0);
        this.details = null;
        this.details = details;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          details: this.details
        };
      }
    };
    exports2.AuthImplicitGrantRedirectError = AuthImplicitGrantRedirectError;
    function isAuthImplicitGrantRedirectError(error) {
      return isAuthError(error) && error.name === "AuthImplicitGrantRedirectError";
    }
    var AuthPKCEGrantCodeExchangeError = class extends CustomAuthError {
      constructor(message, details = null) {
        super(message, "AuthPKCEGrantCodeExchangeError", 500, void 0);
        this.details = null;
        this.details = details;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          details: this.details
        };
      }
    };
    exports2.AuthPKCEGrantCodeExchangeError = AuthPKCEGrantCodeExchangeError;
    var AuthPKCECodeVerifierMissingError = class extends CustomAuthError {
      constructor() {
        super("PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.", "AuthPKCECodeVerifierMissingError", 400, "pkce_code_verifier_not_found");
      }
    };
    exports2.AuthPKCECodeVerifierMissingError = AuthPKCECodeVerifierMissingError;
    function isAuthPKCECodeVerifierMissingError(error) {
      return isAuthError(error) && error.name === "AuthPKCECodeVerifierMissingError";
    }
    var AuthRetryableFetchError = class extends CustomAuthError {
      constructor(message, status) {
        super(message, "AuthRetryableFetchError", status, void 0);
      }
    };
    exports2.AuthRetryableFetchError = AuthRetryableFetchError;
    function isAuthRetryableFetchError(error) {
      return isAuthError(error) && error.name === "AuthRetryableFetchError";
    }
    var AuthWeakPasswordError = class extends CustomAuthError {
      constructor(message, status, reasons) {
        super(message, "AuthWeakPasswordError", status, "weak_password");
        this.reasons = reasons;
      }
    };
    exports2.AuthWeakPasswordError = AuthWeakPasswordError;
    function isAuthWeakPasswordError(error) {
      return isAuthError(error) && error.name === "AuthWeakPasswordError";
    }
    var AuthInvalidJwtError = class extends CustomAuthError {
      constructor(message) {
        super(message, "AuthInvalidJwtError", 400, "invalid_jwt");
      }
    };
    exports2.AuthInvalidJwtError = AuthInvalidJwtError;
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/base64url.js
var require_base64url = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/base64url.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.byteToBase64URL = byteToBase64URL;
    exports2.byteFromBase64URL = byteFromBase64URL;
    exports2.stringToBase64URL = stringToBase64URL;
    exports2.stringFromBase64URL = stringFromBase64URL;
    exports2.codepointToUTF8 = codepointToUTF8;
    exports2.stringToUTF8 = stringToUTF8;
    exports2.stringFromUTF8 = stringFromUTF8;
    exports2.base64UrlToUint8Array = base64UrlToUint8Array;
    exports2.stringToUint8Array = stringToUint8Array;
    exports2.bytesToBase64URL = bytesToBase64URL;
    var TO_BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
    var IGNORE_BASE64URL = " 	\n\r=".split("");
    var FROM_BASE64URL = (() => {
      const charMap = new Array(128);
      for (let i = 0; i < charMap.length; i += 1) {
        charMap[i] = -1;
      }
      for (let i = 0; i < IGNORE_BASE64URL.length; i += 1) {
        charMap[IGNORE_BASE64URL[i].charCodeAt(0)] = -2;
      }
      for (let i = 0; i < TO_BASE64URL.length; i += 1) {
        charMap[TO_BASE64URL[i].charCodeAt(0)] = i;
      }
      return charMap;
    })();
    function byteToBase64URL(byte, state, emit) {
      if (byte !== null) {
        state.queue = state.queue << 8 | byte;
        state.queuedBits += 8;
        while (state.queuedBits >= 6) {
          const pos = state.queue >> state.queuedBits - 6 & 63;
          emit(TO_BASE64URL[pos]);
          state.queuedBits -= 6;
        }
      } else if (state.queuedBits > 0) {
        state.queue = state.queue << 6 - state.queuedBits;
        state.queuedBits = 6;
        while (state.queuedBits >= 6) {
          const pos = state.queue >> state.queuedBits - 6 & 63;
          emit(TO_BASE64URL[pos]);
          state.queuedBits -= 6;
        }
      }
    }
    function byteFromBase64URL(charCode, state, emit) {
      const bits = FROM_BASE64URL[charCode];
      if (bits > -1) {
        state.queue = state.queue << 6 | bits;
        state.queuedBits += 6;
        while (state.queuedBits >= 8) {
          emit(state.queue >> state.queuedBits - 8 & 255);
          state.queuedBits -= 8;
        }
      } else if (bits === -2) {
        return;
      } else {
        throw new Error(`Invalid Base64-URL character "${String.fromCharCode(charCode)}"`);
      }
    }
    function stringToBase64URL(str) {
      const base64 = [];
      const emitter = (char) => {
        base64.push(char);
      };
      const state = { queue: 0, queuedBits: 0 };
      stringToUTF8(str, (byte) => {
        byteToBase64URL(byte, state, emitter);
      });
      byteToBase64URL(null, state, emitter);
      return base64.join("");
    }
    function stringFromBase64URL(str) {
      const conv = [];
      const utf8Emit = (codepoint) => {
        conv.push(String.fromCodePoint(codepoint));
      };
      const utf8State = {
        utf8seq: 0,
        codepoint: 0
      };
      const b64State = { queue: 0, queuedBits: 0 };
      const byteEmit = (byte) => {
        stringFromUTF8(byte, utf8State, utf8Emit);
      };
      for (let i = 0; i < str.length; i += 1) {
        byteFromBase64URL(str.charCodeAt(i), b64State, byteEmit);
      }
      return conv.join("");
    }
    function codepointToUTF8(codepoint, emit) {
      if (codepoint <= 127) {
        emit(codepoint);
        return;
      } else if (codepoint <= 2047) {
        emit(192 | codepoint >> 6);
        emit(128 | codepoint & 63);
        return;
      } else if (codepoint <= 65535) {
        emit(224 | codepoint >> 12);
        emit(128 | codepoint >> 6 & 63);
        emit(128 | codepoint & 63);
        return;
      } else if (codepoint <= 1114111) {
        emit(240 | codepoint >> 18);
        emit(128 | codepoint >> 12 & 63);
        emit(128 | codepoint >> 6 & 63);
        emit(128 | codepoint & 63);
        return;
      }
      throw new Error(`Unrecognized Unicode codepoint: ${codepoint.toString(16)}`);
    }
    function stringToUTF8(str, emit) {
      for (let i = 0; i < str.length; i += 1) {
        let codepoint = str.charCodeAt(i);
        if (codepoint > 55295 && codepoint <= 56319) {
          const highSurrogate = (codepoint - 55296) * 1024 & 65535;
          const lowSurrogate = str.charCodeAt(i + 1) - 56320 & 65535;
          codepoint = (lowSurrogate | highSurrogate) + 65536;
          i += 1;
        }
        codepointToUTF8(codepoint, emit);
      }
    }
    function stringFromUTF8(byte, state, emit) {
      if (state.utf8seq === 0) {
        if (byte <= 127) {
          emit(byte);
          return;
        }
        for (let leadingBit = 1; leadingBit < 6; leadingBit += 1) {
          if ((byte >> 7 - leadingBit & 1) === 0) {
            state.utf8seq = leadingBit;
            break;
          }
        }
        if (state.utf8seq === 2) {
          state.codepoint = byte & 31;
        } else if (state.utf8seq === 3) {
          state.codepoint = byte & 15;
        } else if (state.utf8seq === 4) {
          state.codepoint = byte & 7;
        } else {
          throw new Error("Invalid UTF-8 sequence");
        }
        state.utf8seq -= 1;
      } else if (state.utf8seq > 0) {
        if (byte <= 127) {
          throw new Error("Invalid UTF-8 sequence");
        }
        state.codepoint = state.codepoint << 6 | byte & 63;
        state.utf8seq -= 1;
        if (state.utf8seq === 0) {
          emit(state.codepoint);
        }
      }
    }
    function base64UrlToUint8Array(str) {
      const result = [];
      const state = { queue: 0, queuedBits: 0 };
      const onByte = (byte) => {
        result.push(byte);
      };
      for (let i = 0; i < str.length; i += 1) {
        byteFromBase64URL(str.charCodeAt(i), state, onByte);
      }
      return new Uint8Array(result);
    }
    function stringToUint8Array(str) {
      const result = [];
      stringToUTF8(str, (byte) => result.push(byte));
      return new Uint8Array(result);
    }
    function bytesToBase64URL(bytes) {
      const result = [];
      const state = { queue: 0, queuedBits: 0 };
      const onChar = (char) => {
        result.push(char);
      };
      bytes.forEach((byte) => byteToBase64URL(byte, state, onChar));
      byteToBase64URL(null, state, onChar);
      return result.join("");
    }
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/helpers.js
var require_helpers = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/helpers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Deferred = exports2.removeItemAsync = exports2.getItemAsync = exports2.setItemAsync = exports2.looksLikeFetchResponse = exports2.resolveFetch = exports2.supportsLocalStorage = exports2.isBrowser = void 0;
    exports2.expiresAt = expiresAt;
    exports2.generateCallbackId = generateCallbackId;
    exports2.parseParametersFromURL = parseParametersFromURL;
    exports2.decodeJWT = decodeJWT;
    exports2.sleep = sleep;
    exports2.retryable = retryable;
    exports2.generatePKCEVerifier = generatePKCEVerifier;
    exports2.generatePKCEChallenge = generatePKCEChallenge;
    exports2.getCodeChallengeAndMethod = getCodeChallengeAndMethod;
    exports2.parseResponseAPIVersion = parseResponseAPIVersion;
    exports2.validateExp = validateExp;
    exports2.getAlgorithm = getAlgorithm;
    exports2.validateUUID = validateUUID;
    exports2.userNotAvailableProxy = userNotAvailableProxy;
    exports2.insecureUserWarningProxy = insecureUserWarningProxy;
    exports2.deepClone = deepClone;
    var constants_1 = require_constants2();
    var errors_1 = require_errors();
    var base64url_1 = require_base64url();
    function expiresAt(expiresIn) {
      const timeNow = Math.round(Date.now() / 1e3);
      return timeNow + expiresIn;
    }
    function generateCallbackId() {
      return /* @__PURE__ */ Symbol("auth-callback");
    }
    var isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
    exports2.isBrowser = isBrowser;
    var localStorageWriteTests = {
      tested: false,
      writable: false
    };
    var supportsLocalStorage = () => {
      if (!(0, exports2.isBrowser)()) {
        return false;
      }
      try {
        if (typeof globalThis.localStorage !== "object") {
          return false;
        }
      } catch (e) {
        return false;
      }
      if (localStorageWriteTests.tested) {
        return localStorageWriteTests.writable;
      }
      const randomKey = `lswt-${Math.random()}${Math.random()}`;
      try {
        globalThis.localStorage.setItem(randomKey, randomKey);
        globalThis.localStorage.removeItem(randomKey);
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = true;
      } catch (e) {
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = false;
      }
      return localStorageWriteTests.writable;
    };
    exports2.supportsLocalStorage = supportsLocalStorage;
    function parseParametersFromURL(href) {
      const result = {};
      const url = new URL(href);
      if (url.hash && url.hash[0] === "#") {
        try {
          const hashSearchParams = new URLSearchParams(url.hash.substring(1));
          hashSearchParams.forEach((value, key) => {
            result[key] = value;
          });
        } catch (e) {
        }
      }
      url.searchParams.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }
    var resolveFetch = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
    exports2.resolveFetch = resolveFetch;
    var looksLikeFetchResponse = (maybeResponse) => {
      return typeof maybeResponse === "object" && maybeResponse !== null && "status" in maybeResponse && "ok" in maybeResponse && "json" in maybeResponse && typeof maybeResponse.json === "function";
    };
    exports2.looksLikeFetchResponse = looksLikeFetchResponse;
    var setItemAsync = async (storage, key, data) => {
      await storage.setItem(key, JSON.stringify(data));
    };
    exports2.setItemAsync = setItemAsync;
    var getItemAsync = async (storage, key) => {
      const value = await storage.getItem(key);
      if (!value) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch (_a) {
        return value;
      }
    };
    exports2.getItemAsync = getItemAsync;
    var removeItemAsync = async (storage, key) => {
      await storage.removeItem(key);
    };
    exports2.removeItemAsync = removeItemAsync;
    var Deferred = class _Deferred {
      constructor() {
        ;
        this.promise = new _Deferred.promiseConstructor((res, rej) => {
          ;
          this.resolve = res;
          this.reject = rej;
        });
      }
    };
    exports2.Deferred = Deferred;
    Deferred.promiseConstructor = Promise;
    function decodeJWT(token) {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new errors_1.AuthInvalidJwtError("Invalid JWT structure");
      }
      for (let i = 0; i < parts.length; i++) {
        if (!constants_1.BASE64URL_REGEX.test(parts[i])) {
          throw new errors_1.AuthInvalidJwtError("JWT not in base64url format");
        }
      }
      const data = {
        // using base64url lib
        header: JSON.parse((0, base64url_1.stringFromBase64URL)(parts[0])),
        payload: JSON.parse((0, base64url_1.stringFromBase64URL)(parts[1])),
        signature: (0, base64url_1.base64UrlToUint8Array)(parts[2]),
        raw: {
          header: parts[0],
          payload: parts[1]
        }
      };
      return data;
    }
    async function sleep(time) {
      return await new Promise((accept) => {
        setTimeout(() => accept(null), time);
      });
    }
    function retryable(fn, isRetryable) {
      const promise = new Promise((accept, reject) => {
        ;
        (async () => {
          for (let attempt = 0; attempt < Infinity; attempt++) {
            try {
              const result = await fn(attempt);
              if (!isRetryable(attempt, null, result)) {
                accept(result);
                return;
              }
            } catch (e) {
              if (!isRetryable(attempt, e)) {
                reject(e);
                return;
              }
            }
          }
        })();
      });
      return promise;
    }
    function dec2hex(dec) {
      return ("0" + dec.toString(16)).substr(-2);
    }
    function generatePKCEVerifier() {
      const verifierLength = 56;
      const array = new Uint32Array(verifierLength);
      if (typeof crypto === "undefined") {
        const charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        const charSetLen = charSet.length;
        let verifier = "";
        for (let i = 0; i < verifierLength; i++) {
          verifier += charSet.charAt(Math.floor(Math.random() * charSetLen));
        }
        return verifier;
      }
      crypto.getRandomValues(array);
      return Array.from(array, dec2hex).join("");
    }
    async function sha256(randomString) {
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(randomString);
      const hash = await crypto.subtle.digest("SHA-256", encodedData);
      const bytes = new Uint8Array(hash);
      return Array.from(bytes).map((c) => String.fromCharCode(c)).join("");
    }
    async function generatePKCEChallenge(verifier) {
      const hasCryptoSupport = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof TextEncoder !== "undefined";
      if (!hasCryptoSupport) {
        console.warn("WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256.");
        return verifier;
      }
      const hashed = await sha256(verifier);
      return btoa(hashed).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    async function getCodeChallengeAndMethod(storage, storageKey, isPasswordRecovery = false) {
      const codeVerifier = generatePKCEVerifier();
      let storedCodeVerifier = codeVerifier;
      if (isPasswordRecovery) {
        storedCodeVerifier += "/PASSWORD_RECOVERY";
      }
      await (0, exports2.setItemAsync)(storage, `${storageKey}-code-verifier`, storedCodeVerifier);
      const codeChallenge = await generatePKCEChallenge(codeVerifier);
      const codeChallengeMethod = codeVerifier === codeChallenge ? "plain" : "s256";
      return [codeChallenge, codeChallengeMethod];
    }
    var API_VERSION_REGEX = /^2[0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/i;
    function parseResponseAPIVersion(response) {
      const apiVersion = response.headers.get(constants_1.API_VERSION_HEADER_NAME);
      if (!apiVersion) {
        return null;
      }
      if (!apiVersion.match(API_VERSION_REGEX)) {
        return null;
      }
      try {
        const date = /* @__PURE__ */ new Date(`${apiVersion}T00:00:00.0Z`);
        return date;
      } catch (e) {
        return null;
      }
    }
    function validateExp(exp) {
      if (!exp) {
        throw new Error("Missing exp claim");
      }
      const timeNow = Math.floor(Date.now() / 1e3);
      if (exp <= timeNow) {
        throw new Error("JWT has expired");
      }
    }
    function getAlgorithm(alg) {
      switch (alg) {
        case "RS256":
          return {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: "SHA-256" }
          };
        case "ES256":
          return {
            name: "ECDSA",
            namedCurve: "P-256",
            hash: { name: "SHA-256" }
          };
        default:
          throw new Error("Invalid alg claim");
      }
    }
    var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    function validateUUID(str) {
      if (!UUID_REGEX.test(str)) {
        throw new Error("@supabase/auth-js: Expected parameter to be UUID but is not");
      }
    }
    function userNotAvailableProxy() {
      const proxyTarget = {};
      return new Proxy(proxyTarget, {
        get: (target, prop) => {
          if (prop === "__isUserNotAvailableProxy") {
            return true;
          }
          if (typeof prop === "symbol") {
            const sProp = prop.toString();
            if (sProp === "Symbol(Symbol.toPrimitive)" || sProp === "Symbol(Symbol.toStringTag)" || sProp === "Symbol(util.inspect.custom)") {
              return void 0;
            }
          }
          throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Accessing the "${prop}" property of the session object is not supported. Please use getUser() instead.`);
        },
        set: (_target, prop) => {
          throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Setting the "${prop}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
        },
        deleteProperty: (_target, prop) => {
          throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Deleting the "${prop}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
        }
      });
    }
    function insecureUserWarningProxy(user, suppressWarningRef) {
      return new Proxy(user, {
        get: (target, prop, receiver) => {
          if (prop === "__isInsecureUserWarningProxy") {
            return true;
          }
          if (typeof prop === "symbol") {
            const sProp = prop.toString();
            if (sProp === "Symbol(Symbol.toPrimitive)" || sProp === "Symbol(Symbol.toStringTag)" || sProp === "Symbol(util.inspect.custom)" || sProp === "Symbol(nodejs.util.inspect.custom)") {
              return Reflect.get(target, prop, receiver);
            }
          }
          if (!suppressWarningRef.value && typeof prop === "string") {
            console.warn("Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server.");
            suppressWarningRef.value = true;
          }
          return Reflect.get(target, prop, receiver);
        }
      });
    }
    function deepClone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/fetch.js
var require_fetch = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/fetch.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.handleError = handleError;
    exports2._request = _request;
    exports2._sessionResponse = _sessionResponse;
    exports2._sessionResponsePassword = _sessionResponsePassword;
    exports2._userResponse = _userResponse;
    exports2._ssoResponse = _ssoResponse;
    exports2._generateLinkResponse = _generateLinkResponse;
    exports2._noResolveJsonResponse = _noResolveJsonResponse;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var constants_1 = require_constants2();
    var helpers_1 = require_helpers();
    var errors_1 = require_errors();
    var _getErrorMessage = (err) => err.msg || err.message || err.error_description || err.error || JSON.stringify(err);
    var NETWORK_ERROR_CODES = [502, 503, 504];
    async function handleError(error) {
      var _a;
      if (!(0, helpers_1.looksLikeFetchResponse)(error)) {
        throw new errors_1.AuthRetryableFetchError(_getErrorMessage(error), 0);
      }
      if (NETWORK_ERROR_CODES.includes(error.status)) {
        throw new errors_1.AuthRetryableFetchError(_getErrorMessage(error), error.status);
      }
      let data;
      try {
        data = await error.json();
      } catch (e) {
        throw new errors_1.AuthUnknownError(_getErrorMessage(e), e);
      }
      let errorCode = void 0;
      const responseAPIVersion = (0, helpers_1.parseResponseAPIVersion)(error);
      if (responseAPIVersion && responseAPIVersion.getTime() >= constants_1.API_VERSIONS["2024-01-01"].timestamp && typeof data === "object" && data && typeof data.code === "string") {
        errorCode = data.code;
      } else if (typeof data === "object" && data && typeof data.error_code === "string") {
        errorCode = data.error_code;
      }
      if (!errorCode) {
        if (typeof data === "object" && data && typeof data.weak_password === "object" && data.weak_password && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
          throw new errors_1.AuthWeakPasswordError(_getErrorMessage(data), error.status, data.weak_password.reasons);
        }
      } else if (errorCode === "weak_password") {
        throw new errors_1.AuthWeakPasswordError(_getErrorMessage(data), error.status, ((_a = data.weak_password) === null || _a === void 0 ? void 0 : _a.reasons) || []);
      } else if (errorCode === "session_not_found") {
        throw new errors_1.AuthSessionMissingError();
      }
      throw new errors_1.AuthApiError(_getErrorMessage(data), error.status || 500, errorCode);
    }
    var _getRequestParams = (method, options, parameters, body) => {
      const params = { method, headers: (options === null || options === void 0 ? void 0 : options.headers) || {} };
      if (method === "GET") {
        return params;
      }
      params.headers = Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, options === null || options === void 0 ? void 0 : options.headers);
      params.body = JSON.stringify(body);
      return Object.assign(Object.assign({}, params), parameters);
    };
    async function _request(fetcher, method, url, options) {
      var _a;
      const headers = Object.assign({}, options === null || options === void 0 ? void 0 : options.headers);
      if (!headers[constants_1.API_VERSION_HEADER_NAME]) {
        headers[constants_1.API_VERSION_HEADER_NAME] = constants_1.API_VERSIONS["2024-01-01"].name;
      }
      if (options === null || options === void 0 ? void 0 : options.jwt) {
        headers["Authorization"] = `Bearer ${options.jwt}`;
      }
      const qs = (_a = options === null || options === void 0 ? void 0 : options.query) !== null && _a !== void 0 ? _a : {};
      if (options === null || options === void 0 ? void 0 : options.redirectTo) {
        qs["redirect_to"] = options.redirectTo;
      }
      const queryString = Object.keys(qs).length ? "?" + new URLSearchParams(qs).toString() : "";
      const data = await _handleRequest(fetcher, method, url + queryString, {
        headers,
        noResolveJson: options === null || options === void 0 ? void 0 : options.noResolveJson
      }, {}, options === null || options === void 0 ? void 0 : options.body);
      return (options === null || options === void 0 ? void 0 : options.xform) ? options === null || options === void 0 ? void 0 : options.xform(data) : { data: Object.assign({}, data), error: null };
    }
    async function _handleRequest(fetcher, method, url, options, parameters, body) {
      const requestParams = _getRequestParams(method, options, parameters, body);
      let result;
      try {
        result = await fetcher(url, Object.assign({}, requestParams));
      } catch (e) {
        console.error(e);
        throw new errors_1.AuthRetryableFetchError(_getErrorMessage(e), 0);
      }
      if (!result.ok) {
        await handleError(result);
      }
      if (options === null || options === void 0 ? void 0 : options.noResolveJson) {
        return result;
      }
      try {
        return await result.json();
      } catch (e) {
        await handleError(e);
      }
    }
    function _sessionResponse(data) {
      var _a;
      let session = null;
      if (hasSession(data)) {
        session = Object.assign({}, data);
        if (!data.expires_at) {
          session.expires_at = (0, helpers_1.expiresAt)(data.expires_in);
        }
      }
      const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
      return { data: { session, user }, error: null };
    }
    function _sessionResponsePassword(data) {
      const response = _sessionResponse(data);
      if (!response.error && data.weak_password && typeof data.weak_password === "object" && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.message && typeof data.weak_password.message === "string" && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
        response.data.weak_password = data.weak_password;
      }
      return response;
    }
    function _userResponse(data) {
      var _a;
      const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
      return { data: { user }, error: null };
    }
    function _ssoResponse(data) {
      return { data, error: null };
    }
    function _generateLinkResponse(data) {
      const { action_link, email_otp, hashed_token, redirect_to, verification_type } = data, rest = tslib_1.__rest(data, ["action_link", "email_otp", "hashed_token", "redirect_to", "verification_type"]);
      const properties = {
        action_link,
        email_otp,
        hashed_token,
        redirect_to,
        verification_type
      };
      const user = Object.assign({}, rest);
      return {
        data: {
          properties,
          user
        },
        error: null
      };
    }
    function _noResolveJsonResponse(data) {
      return data;
    }
    function hasSession(data) {
      return data.access_token && data.refresh_token && data.expires_in;
    }
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/types.js
var require_types2 = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SIGN_OUT_SCOPES = void 0;
    exports2.SIGN_OUT_SCOPES = ["global", "local", "others"];
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js
var require_GoTrueAdminApi = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var fetch_1 = require_fetch();
    var helpers_1 = require_helpers();
    var types_1 = require_types2();
    var errors_1 = require_errors();
    var GoTrueAdminApi = class {
      /**
       * Creates an admin API client that can be used to manage users and OAuth clients.
       *
       * @example
       * ```ts
       * import { GoTrueAdminApi } from '@supabase/auth-js'
       *
       * const admin = new GoTrueAdminApi({
       *   url: 'https://xyzcompany.supabase.co/auth/v1',
       *   headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
       * })
       * ```
       */
      constructor({ url = "", headers = {}, fetch: fetch2 }) {
        this.url = url;
        this.headers = headers;
        this.fetch = (0, helpers_1.resolveFetch)(fetch2);
        this.mfa = {
          listFactors: this._listFactors.bind(this),
          deleteFactor: this._deleteFactor.bind(this)
        };
        this.oauth = {
          listClients: this._listOAuthClients.bind(this),
          createClient: this._createOAuthClient.bind(this),
          getClient: this._getOAuthClient.bind(this),
          updateClient: this._updateOAuthClient.bind(this),
          deleteClient: this._deleteOAuthClient.bind(this),
          regenerateClientSecret: this._regenerateOAuthClientSecret.bind(this)
        };
      }
      /**
       * Removes a logged-in session.
       * @param jwt A valid, logged-in JWT.
       * @param scope The logout sope.
       */
      async signOut(jwt, scope = types_1.SIGN_OUT_SCOPES[0]) {
        if (types_1.SIGN_OUT_SCOPES.indexOf(scope) < 0) {
          throw new Error(`@supabase/auth-js: Parameter scope must be one of ${types_1.SIGN_OUT_SCOPES.join(", ")}`);
        }
        try {
          await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/logout?scope=${scope}`, {
            headers: this.headers,
            jwt,
            noResolveJson: true
          });
          return { data: null, error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Sends an invite link to an email address.
       * @param email The email address of the user.
       * @param options Additional options to be included when inviting.
       */
      async inviteUserByEmail(email, options = {}) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/invite`, {
            body: { email, data: options.data },
            headers: this.headers,
            redirectTo: options.redirectTo,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Generates email links and OTPs to be sent via a custom email provider.
       * @param email The user's email.
       * @param options.password User password. For signup only.
       * @param options.data Optional user metadata. For signup only.
       * @param options.redirectTo The redirect url which should be appended to the generated link
       */
      async generateLink(params) {
        try {
          const { options } = params, rest = tslib_1.__rest(params, ["options"]);
          const body = Object.assign(Object.assign({}, rest), options);
          if ("newEmail" in rest) {
            body.new_email = rest === null || rest === void 0 ? void 0 : rest.newEmail;
            delete body["newEmail"];
          }
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/generate_link`, {
            body,
            headers: this.headers,
            xform: fetch_1._generateLinkResponse,
            redirectTo: options === null || options === void 0 ? void 0 : options.redirectTo
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return {
              data: {
                properties: null,
                user: null
              },
              error
            };
          }
          throw error;
        }
      }
      // User Admin API
      /**
       * Creates a new user.
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async createUser(attributes) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/users`, {
            body: attributes,
            headers: this.headers,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Get a list of users.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       * @param params An object which supports `page` and `perPage` as numbers, to alter the paginated results.
       */
      async listUsers(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
          const pagination = { nextPage: null, lastPage: 0, total: 0 };
          const response = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/users`, {
            headers: this.headers,
            noResolveJson: true,
            query: {
              page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
              per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
            },
            xform: fetch_1._noResolveJsonResponse
          });
          if (response.error)
            throw response.error;
          const users = await response.json();
          const total = (_e = response.headers.get("x-total-count")) !== null && _e !== void 0 ? _e : 0;
          const links = (_g = (_f = response.headers.get("link")) === null || _f === void 0 ? void 0 : _f.split(",")) !== null && _g !== void 0 ? _g : [];
          if (links.length > 0) {
            links.forEach((link) => {
              const page = parseInt(link.split(";")[0].split("=")[1].substring(0, 1));
              const rel = JSON.parse(link.split(";")[1].split("=")[1]);
              pagination[`${rel}Page`] = page;
            });
            pagination.total = parseInt(total);
          }
          return { data: Object.assign(Object.assign({}, users), pagination), error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { users: [] }, error };
          }
          throw error;
        }
      }
      /**
       * Get user by id.
       *
       * @param uid The user's unique identifier
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async getUserById(uid) {
        (0, helpers_1.validateUUID)(uid);
        try {
          return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/users/${uid}`, {
            headers: this.headers,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Updates the user data. Changes are applied directly without confirmation flows.
       *
       * @param attributes The data you want to update.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async updateUserById(uid, attributes) {
        (0, helpers_1.validateUUID)(uid);
        try {
          return await (0, fetch_1._request)(this.fetch, "PUT", `${this.url}/admin/users/${uid}`, {
            body: attributes,
            headers: this.headers,
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Delete a user. Requires a `service_role` key.
       *
       * @param id The user id you want to remove.
       * @param shouldSoftDelete If true, then the user will be soft-deleted from the auth schema. Soft deletion allows user identification from the hashed user ID but is not reversible.
       * Defaults to false for backward compatibility.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async deleteUser(id, shouldSoftDelete = false) {
        (0, helpers_1.validateUUID)(id);
        try {
          return await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/admin/users/${id}`, {
            headers: this.headers,
            body: {
              should_soft_delete: shouldSoftDelete
            },
            xform: fetch_1._userResponse
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      async _listFactors(params) {
        (0, helpers_1.validateUUID)(params.userId);
        try {
          const { data, error } = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/users/${params.userId}/factors`, {
            headers: this.headers,
            xform: (factors) => {
              return { data: { factors }, error: null };
            }
          });
          return { data, error };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      async _deleteFactor(params) {
        (0, helpers_1.validateUUID)(params.userId);
        (0, helpers_1.validateUUID)(params.id);
        try {
          const data = await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/admin/users/${params.userId}/factors/${params.id}`, {
            headers: this.headers
          });
          return { data, error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Lists all OAuth clients with optional pagination.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _listOAuthClients(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
          const pagination = { nextPage: null, lastPage: 0, total: 0 };
          const response = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/oauth/clients`, {
            headers: this.headers,
            noResolveJson: true,
            query: {
              page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
              per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
            },
            xform: fetch_1._noResolveJsonResponse
          });
          if (response.error)
            throw response.error;
          const clients = await response.json();
          const total = (_e = response.headers.get("x-total-count")) !== null && _e !== void 0 ? _e : 0;
          const links = (_g = (_f = response.headers.get("link")) === null || _f === void 0 ? void 0 : _f.split(",")) !== null && _g !== void 0 ? _g : [];
          if (links.length > 0) {
            links.forEach((link) => {
              const page = parseInt(link.split(";")[0].split("=")[1].substring(0, 1));
              const rel = JSON.parse(link.split(";")[1].split("=")[1]);
              pagination[`${rel}Page`] = page;
            });
            pagination.total = parseInt(total);
          }
          return { data: Object.assign(Object.assign({}, clients), pagination), error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: { clients: [] }, error };
          }
          throw error;
        }
      }
      /**
       * Creates a new OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _createOAuthClient(params) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/oauth/clients`, {
            body: params,
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Gets details of a specific OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _getOAuthClient(clientId) {
        try {
          return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/admin/oauth/clients/${clientId}`, {
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Updates an existing OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _updateOAuthClient(clientId, params) {
        try {
          return await (0, fetch_1._request)(this.fetch, "PUT", `${this.url}/admin/oauth/clients/${clientId}`, {
            body: params,
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Deletes an OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _deleteOAuthClient(clientId) {
        try {
          await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/admin/oauth/clients/${clientId}`, {
            headers: this.headers,
            noResolveJson: true
          });
          return { data: null, error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Regenerates the secret for an OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _regenerateOAuthClientSecret(clientId) {
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/admin/oauth/clients/${clientId}/regenerate_secret`, {
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
    };
    exports2.default = GoTrueAdminApi;
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/local-storage.js
var require_local_storage = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/local-storage.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.memoryLocalStorageAdapter = memoryLocalStorageAdapter;
    function memoryLocalStorageAdapter(store = {}) {
      return {
        getItem: (key) => {
          return store[key] || null;
        },
        setItem: (key, value) => {
          store[key] = value;
        },
        removeItem: (key) => {
          delete store[key];
        }
      };
    }
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/locks.js
var require_locks = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/locks.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ProcessLockAcquireTimeoutError = exports2.NavigatorLockAcquireTimeoutError = exports2.LockAcquireTimeoutError = exports2.internals = void 0;
    exports2.navigatorLock = navigatorLock;
    exports2.processLock = processLock;
    var helpers_1 = require_helpers();
    exports2.internals = {
      /**
       * @experimental
       */
      debug: !!(globalThis && (0, helpers_1.supportsLocalStorage)() && globalThis.localStorage && globalThis.localStorage.getItem("supabase.gotrue-js.locks.debug") === "true")
    };
    var LockAcquireTimeoutError = class extends Error {
      constructor(message) {
        super(message);
        this.isAcquireTimeout = true;
      }
    };
    exports2.LockAcquireTimeoutError = LockAcquireTimeoutError;
    var NavigatorLockAcquireTimeoutError = class extends LockAcquireTimeoutError {
    };
    exports2.NavigatorLockAcquireTimeoutError = NavigatorLockAcquireTimeoutError;
    var ProcessLockAcquireTimeoutError = class extends LockAcquireTimeoutError {
    };
    exports2.ProcessLockAcquireTimeoutError = ProcessLockAcquireTimeoutError;
    async function navigatorLock(name, acquireTimeout, fn) {
      if (exports2.internals.debug) {
        console.log("@supabase/gotrue-js: navigatorLock: acquire lock", name, acquireTimeout);
      }
      const abortController = new globalThis.AbortController();
      if (acquireTimeout > 0) {
        setTimeout(() => {
          abortController.abort();
          if (exports2.internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock acquire timed out", name);
          }
        }, acquireTimeout);
      }
      return await Promise.resolve().then(() => globalThis.navigator.locks.request(name, acquireTimeout === 0 ? {
        mode: "exclusive",
        ifAvailable: true
      } : {
        mode: "exclusive",
        signal: abortController.signal
      }, async (lock) => {
        if (lock) {
          if (exports2.internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock: acquired", name, lock.name);
          }
          try {
            return await fn();
          } finally {
            if (exports2.internals.debug) {
              console.log("@supabase/gotrue-js: navigatorLock: released", name, lock.name);
            }
          }
        } else {
          if (acquireTimeout === 0) {
            if (exports2.internals.debug) {
              console.log("@supabase/gotrue-js: navigatorLock: not immediately available", name);
            }
            throw new NavigatorLockAcquireTimeoutError(`Acquiring an exclusive Navigator LockManager lock "${name}" immediately failed`);
          } else {
            if (exports2.internals.debug) {
              try {
                const result = await globalThis.navigator.locks.query();
                console.log("@supabase/gotrue-js: Navigator LockManager state", JSON.stringify(result, null, "  "));
              } catch (e) {
                console.warn("@supabase/gotrue-js: Error when querying Navigator LockManager state", e);
              }
            }
            console.warn("@supabase/gotrue-js: Navigator LockManager returned a null lock when using #request without ifAvailable set to true, it appears this browser is not following the LockManager spec https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request");
            return await fn();
          }
        }
      }));
    }
    var PROCESS_LOCKS = {};
    async function processLock(name, acquireTimeout, fn) {
      var _a;
      const previousOperation = (_a = PROCESS_LOCKS[name]) !== null && _a !== void 0 ? _a : Promise.resolve();
      const currentOperation = Promise.race([
        previousOperation.catch(() => {
          return null;
        }),
        acquireTimeout >= 0 ? new Promise((_, reject) => {
          setTimeout(() => {
            console.warn(`@supabase/gotrue-js: Lock "${name}" acquisition timed out after ${acquireTimeout}ms. This may be caused by another operation holding the lock. Consider increasing lockAcquireTimeout or checking for stuck operations.`);
            reject(new ProcessLockAcquireTimeoutError(`Acquiring process lock with name "${name}" timed out`));
          }, acquireTimeout);
        }) : null
      ].filter((x) => x)).catch((e) => {
        if (e && e.isAcquireTimeout) {
          throw e;
        }
        return null;
      }).then(async () => {
        return await fn();
      });
      PROCESS_LOCKS[name] = currentOperation.catch(async (e) => {
        if (e && e.isAcquireTimeout) {
          await previousOperation;
          return null;
        }
        throw e;
      });
      return await currentOperation;
    }
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/polyfills.js
var require_polyfills = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/polyfills.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.polyfillGlobalThis = polyfillGlobalThis;
    function polyfillGlobalThis() {
      if (typeof globalThis === "object")
        return;
      try {
        Object.defineProperty(Object.prototype, "__magic__", {
          get: function() {
            return this;
          },
          configurable: true
        });
        __magic__.globalThis = __magic__;
        delete Object.prototype.__magic__;
      } catch (e) {
        if (typeof self !== "undefined") {
          self.globalThis = self;
        }
      }
    }
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/web3/ethereum.js
var require_ethereum = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/web3/ethereum.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getAddress = getAddress;
    exports2.fromHex = fromHex;
    exports2.toHex = toHex;
    exports2.createSiweMessage = createSiweMessage;
    function getAddress(address) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error(`@supabase/auth-js: Address "${address}" is invalid.`);
      }
      return address.toLowerCase();
    }
    function fromHex(hex) {
      return parseInt(hex, 16);
    }
    function toHex(value) {
      const bytes = new TextEncoder().encode(value);
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return "0x" + hex;
    }
    function createSiweMessage(parameters) {
      var _a;
      const { chainId, domain, expirationTime, issuedAt = /* @__PURE__ */ new Date(), nonce, notBefore, requestId, resources, scheme, uri, version } = parameters;
      {
        if (!Number.isInteger(chainId))
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "chainId". Chain ID must be a EIP-155 chain ID. Provided value: ${chainId}`);
        if (!domain)
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "domain". Domain must be provided.`);
        if (nonce && nonce.length < 8)
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "nonce". Nonce must be at least 8 characters. Provided value: ${nonce}`);
        if (!uri)
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "uri". URI must be provided.`);
        if (version !== "1")
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "version". Version must be '1'. Provided value: ${version}`);
        if ((_a = parameters.statement) === null || _a === void 0 ? void 0 : _a.includes("\n"))
          throw new Error(`@supabase/auth-js: Invalid SIWE message field "statement". Statement must not include '\\n'. Provided value: ${parameters.statement}`);
      }
      const address = getAddress(parameters.address);
      const origin = scheme ? `${scheme}://${domain}` : domain;
      const statement = parameters.statement ? `${parameters.statement}
` : "";
      const prefix = `${origin} wants you to sign in with your Ethereum account:
${address}

${statement}`;
      let suffix = `URI: ${uri}
Version: ${version}
Chain ID: ${chainId}${nonce ? `
Nonce: ${nonce}` : ""}
Issued At: ${issuedAt.toISOString()}`;
      if (expirationTime)
        suffix += `
Expiration Time: ${expirationTime.toISOString()}`;
      if (notBefore)
        suffix += `
Not Before: ${notBefore.toISOString()}`;
      if (requestId)
        suffix += `
Request ID: ${requestId}`;
      if (resources) {
        let content = "\nResources:";
        for (const resource of resources) {
          if (!resource || typeof resource !== "string")
            throw new Error(`@supabase/auth-js: Invalid SIWE message field "resources". Every resource must be a valid string. Provided value: ${resource}`);
          content += `
- ${resource}`;
        }
        suffix += content;
      }
      return `${prefix}
${suffix}`;
    }
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/webauthn.errors.js
var require_webauthn_errors = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/webauthn.errors.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WebAuthnUnknownError = exports2.WebAuthnError = void 0;
    exports2.isWebAuthnError = isWebAuthnError;
    exports2.identifyRegistrationError = identifyRegistrationError;
    exports2.identifyAuthenticationError = identifyAuthenticationError;
    var webauthn_1 = require_webauthn();
    var WebAuthnError = class extends Error {
      constructor({ message, code, cause, name }) {
        var _a;
        super(message, { cause });
        this.__isWebAuthnError = true;
        this.name = (_a = name !== null && name !== void 0 ? name : cause instanceof Error ? cause.name : void 0) !== null && _a !== void 0 ? _a : "Unknown Error";
        this.code = code;
      }
    };
    exports2.WebAuthnError = WebAuthnError;
    var WebAuthnUnknownError = class extends WebAuthnError {
      constructor(message, originalError) {
        super({
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: originalError,
          message
        });
        this.name = "WebAuthnUnknownError";
        this.originalError = originalError;
      }
    };
    exports2.WebAuthnUnknownError = WebAuthnUnknownError;
    function isWebAuthnError(error) {
      return typeof error === "object" && error !== null && "__isWebAuthnError" in error;
    }
    function identifyRegistrationError({ error, options }) {
      var _a, _b, _c;
      const { publicKey } = options;
      if (!publicKey) {
        throw Error("options was missing required publicKey property");
      }
      if (error.name === "AbortError") {
        if (options.signal instanceof AbortSignal) {
          return new WebAuthnError({
            message: "Registration ceremony was sent an abort signal",
            code: "ERROR_CEREMONY_ABORTED",
            cause: error
          });
        }
      } else if (error.name === "ConstraintError") {
        if (((_a = publicKey.authenticatorSelection) === null || _a === void 0 ? void 0 : _a.requireResidentKey) === true) {
          return new WebAuthnError({
            message: "Discoverable credentials were required but no available authenticator supported it",
            code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
            cause: error
          });
        } else if (
          // @ts-ignore: `mediation` doesn't yet exist on CredentialCreationOptions but it's possible as of Sept 2024
          options.mediation === "conditional" && ((_b = publicKey.authenticatorSelection) === null || _b === void 0 ? void 0 : _b.userVerification) === "required"
        ) {
          return new WebAuthnError({
            message: "User verification was required during automatic registration but it could not be performed",
            code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE",
            cause: error
          });
        } else if (((_c = publicKey.authenticatorSelection) === null || _c === void 0 ? void 0 : _c.userVerification) === "required") {
          return new WebAuthnError({
            message: "User verification was required but no available authenticator supported it",
            code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
            cause: error
          });
        }
      } else if (error.name === "InvalidStateError") {
        return new WebAuthnError({
          message: "The authenticator was previously registered",
          code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
          cause: error
        });
      } else if (error.name === "NotAllowedError") {
        return new WebAuthnError({
          message: error.message,
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: error
        });
      } else if (error.name === "NotSupportedError") {
        const validPubKeyCredParams = publicKey.pubKeyCredParams.filter((param) => param.type === "public-key");
        if (validPubKeyCredParams.length === 0) {
          return new WebAuthnError({
            message: 'No entry in pubKeyCredParams was of type "public-key"',
            code: "ERROR_MALFORMED_PUBKEYCREDPARAMS",
            cause: error
          });
        }
        return new WebAuthnError({
          message: "No available authenticator supported any of the specified pubKeyCredParams algorithms",
          code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
          cause: error
        });
      } else if (error.name === "SecurityError") {
        const effectiveDomain = window.location.hostname;
        if (!(0, webauthn_1.isValidDomain)(effectiveDomain)) {
          return new WebAuthnError({
            message: `${window.location.hostname} is an invalid domain`,
            code: "ERROR_INVALID_DOMAIN",
            cause: error
          });
        } else if (publicKey.rp.id !== effectiveDomain) {
          return new WebAuthnError({
            message: `The RP ID "${publicKey.rp.id}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: error
          });
        }
      } else if (error.name === "TypeError") {
        if (publicKey.user.id.byteLength < 1 || publicKey.user.id.byteLength > 64) {
          return new WebAuthnError({
            message: "User ID was not between 1 and 64 characters",
            code: "ERROR_INVALID_USER_ID_LENGTH",
            cause: error
          });
        }
      } else if (error.name === "UnknownError") {
        return new WebAuthnError({
          message: "The authenticator was unable to process the specified options, or could not create a new credential",
          code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
          cause: error
        });
      }
      return new WebAuthnError({
        message: "a Non-Webauthn related error has occurred",
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: error
      });
    }
    function identifyAuthenticationError({ error, options }) {
      const { publicKey } = options;
      if (!publicKey) {
        throw Error("options was missing required publicKey property");
      }
      if (error.name === "AbortError") {
        if (options.signal instanceof AbortSignal) {
          return new WebAuthnError({
            message: "Authentication ceremony was sent an abort signal",
            code: "ERROR_CEREMONY_ABORTED",
            cause: error
          });
        }
      } else if (error.name === "NotAllowedError") {
        return new WebAuthnError({
          message: error.message,
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: error
        });
      } else if (error.name === "SecurityError") {
        const effectiveDomain = window.location.hostname;
        if (!(0, webauthn_1.isValidDomain)(effectiveDomain)) {
          return new WebAuthnError({
            message: `${window.location.hostname} is an invalid domain`,
            code: "ERROR_INVALID_DOMAIN",
            cause: error
          });
        } else if (publicKey.rpId !== effectiveDomain) {
          return new WebAuthnError({
            message: `The RP ID "${publicKey.rpId}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: error
          });
        }
      } else if (error.name === "UnknownError") {
        return new WebAuthnError({
          message: "The authenticator was unable to process the specified options, or could not create a new assertion signature",
          code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
          cause: error
        });
      }
      return new WebAuthnError({
        message: "a Non-Webauthn related error has occurred",
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: error
      });
    }
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/webauthn.js
var require_webauthn = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/lib/webauthn.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WebAuthnApi = exports2.DEFAULT_REQUEST_OPTIONS = exports2.DEFAULT_CREATION_OPTIONS = exports2.webAuthnAbortService = exports2.WebAuthnAbortService = exports2.identifyAuthenticationError = exports2.identifyRegistrationError = exports2.isWebAuthnError = exports2.WebAuthnError = void 0;
    exports2.deserializeCredentialCreationOptions = deserializeCredentialCreationOptions;
    exports2.deserializeCredentialRequestOptions = deserializeCredentialRequestOptions;
    exports2.serializeCredentialCreationResponse = serializeCredentialCreationResponse;
    exports2.serializeCredentialRequestResponse = serializeCredentialRequestResponse;
    exports2.isValidDomain = isValidDomain;
    exports2.createCredential = createCredential;
    exports2.getCredential = getCredential;
    exports2.mergeCredentialCreationOptions = mergeCredentialCreationOptions;
    exports2.mergeCredentialRequestOptions = mergeCredentialRequestOptions;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var base64url_1 = require_base64url();
    var errors_1 = require_errors();
    var helpers_1 = require_helpers();
    var webauthn_errors_1 = require_webauthn_errors();
    Object.defineProperty(exports2, "identifyAuthenticationError", { enumerable: true, get: function() {
      return webauthn_errors_1.identifyAuthenticationError;
    } });
    Object.defineProperty(exports2, "identifyRegistrationError", { enumerable: true, get: function() {
      return webauthn_errors_1.identifyRegistrationError;
    } });
    Object.defineProperty(exports2, "isWebAuthnError", { enumerable: true, get: function() {
      return webauthn_errors_1.isWebAuthnError;
    } });
    Object.defineProperty(exports2, "WebAuthnError", { enumerable: true, get: function() {
      return webauthn_errors_1.WebAuthnError;
    } });
    var WebAuthnAbortService = class {
      /**
       * Create an abort signal for a new WebAuthn operation.
       * Automatically cancels any existing operation.
       *
       * @returns {AbortSignal} Signal to pass to navigator.credentials.create() or .get()
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal MDN - AbortSignal}
       */
      createNewAbortSignal() {
        if (this.controller) {
          const abortError = new Error("Cancelling existing WebAuthn API call for new one");
          abortError.name = "AbortError";
          this.controller.abort(abortError);
        }
        const newController = new AbortController();
        this.controller = newController;
        return newController.signal;
      }
      /**
       * Manually cancel the current WebAuthn operation.
       * Useful for cleaning up when user cancels or navigates away.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort MDN - AbortController.abort}
       */
      cancelCeremony() {
        if (this.controller) {
          const abortError = new Error("Manually cancelling existing WebAuthn API call");
          abortError.name = "AbortError";
          this.controller.abort(abortError);
          this.controller = void 0;
        }
      }
    };
    exports2.WebAuthnAbortService = WebAuthnAbortService;
    exports2.webAuthnAbortService = new WebAuthnAbortService();
    function deserializeCredentialCreationOptions(options) {
      if (!options) {
        throw new Error("Credential creation options are required");
      }
      if (typeof PublicKeyCredential !== "undefined" && "parseCreationOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function") {
        return PublicKeyCredential.parseCreationOptionsFromJSON(
          /** we assert the options here as typescript still doesn't know about future webauthn types */
          options
        );
      }
      const { challenge: challengeStr, user: userOpts, excludeCredentials } = options, restOptions = tslib_1.__rest(
        options,
        ["challenge", "user", "excludeCredentials"]
      );
      const challenge = (0, base64url_1.base64UrlToUint8Array)(challengeStr).buffer;
      const user = Object.assign(Object.assign({}, userOpts), { id: (0, base64url_1.base64UrlToUint8Array)(userOpts.id).buffer });
      const result = Object.assign(Object.assign({}, restOptions), {
        challenge,
        user
      });
      if (excludeCredentials && excludeCredentials.length > 0) {
        result.excludeCredentials = new Array(excludeCredentials.length);
        for (let i = 0; i < excludeCredentials.length; i++) {
          const cred = excludeCredentials[i];
          result.excludeCredentials[i] = Object.assign(Object.assign({}, cred), {
            id: (0, base64url_1.base64UrlToUint8Array)(cred.id).buffer,
            type: cred.type || "public-key",
            // Cast transports to handle future transport types like "cable"
            transports: cred.transports
          });
        }
      }
      return result;
    }
    function deserializeCredentialRequestOptions(options) {
      if (!options) {
        throw new Error("Credential request options are required");
      }
      if (typeof PublicKeyCredential !== "undefined" && "parseRequestOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function") {
        return PublicKeyCredential.parseRequestOptionsFromJSON(options);
      }
      const { challenge: challengeStr, allowCredentials } = options, restOptions = tslib_1.__rest(
        options,
        ["challenge", "allowCredentials"]
      );
      const challenge = (0, base64url_1.base64UrlToUint8Array)(challengeStr).buffer;
      const result = Object.assign(Object.assign({}, restOptions), { challenge });
      if (allowCredentials && allowCredentials.length > 0) {
        result.allowCredentials = new Array(allowCredentials.length);
        for (let i = 0; i < allowCredentials.length; i++) {
          const cred = allowCredentials[i];
          result.allowCredentials[i] = Object.assign(Object.assign({}, cred), {
            id: (0, base64url_1.base64UrlToUint8Array)(cred.id).buffer,
            type: cred.type || "public-key",
            // Cast transports to handle future transport types like "cable"
            transports: cred.transports
          });
        }
      }
      return result;
    }
    function serializeCredentialCreationResponse(credential) {
      var _a;
      if ("toJSON" in credential && typeof credential.toJSON === "function") {
        return credential.toJSON();
      }
      const credentialWithAttachment = credential;
      return {
        id: credential.id,
        rawId: credential.id,
        response: {
          attestationObject: (0, base64url_1.bytesToBase64URL)(new Uint8Array(credential.response.attestationObject)),
          clientDataJSON: (0, base64url_1.bytesToBase64URL)(new Uint8Array(credential.response.clientDataJSON))
        },
        type: "public-key",
        clientExtensionResults: credential.getClientExtensionResults(),
        // Convert null to undefined and cast to AuthenticatorAttachment type
        authenticatorAttachment: (_a = credentialWithAttachment.authenticatorAttachment) !== null && _a !== void 0 ? _a : void 0
      };
    }
    function serializeCredentialRequestResponse(credential) {
      var _a;
      if ("toJSON" in credential && typeof credential.toJSON === "function") {
        return credential.toJSON();
      }
      const credentialWithAttachment = credential;
      const clientExtensionResults = credential.getClientExtensionResults();
      const assertionResponse = credential.response;
      return {
        id: credential.id,
        rawId: credential.id,
        // W3C spec expects rawId to match id for JSON format
        response: {
          authenticatorData: (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.authenticatorData)),
          clientDataJSON: (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.clientDataJSON)),
          signature: (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.signature)),
          userHandle: assertionResponse.userHandle ? (0, base64url_1.bytesToBase64URL)(new Uint8Array(assertionResponse.userHandle)) : void 0
        },
        type: "public-key",
        clientExtensionResults,
        // Convert null to undefined and cast to AuthenticatorAttachment type
        authenticatorAttachment: (_a = credentialWithAttachment.authenticatorAttachment) !== null && _a !== void 0 ? _a : void 0
      };
    }
    function isValidDomain(hostname) {
      return (
        // Consider localhost valid as well since it's okay wrt Secure Contexts
        hostname === "localhost" || /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(hostname)
      );
    }
    function browserSupportsWebAuthn() {
      var _a, _b;
      return !!((0, helpers_1.isBrowser)() && "PublicKeyCredential" in window && window.PublicKeyCredential && "credentials" in navigator && typeof ((_a = navigator === null || navigator === void 0 ? void 0 : navigator.credentials) === null || _a === void 0 ? void 0 : _a.create) === "function" && typeof ((_b = navigator === null || navigator === void 0 ? void 0 : navigator.credentials) === null || _b === void 0 ? void 0 : _b.get) === "function");
    }
    async function createCredential(options) {
      try {
        const response = await navigator.credentials.create(
          /** we assert the type here until typescript types are updated */
          options
        );
        if (!response) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Empty credential response", response)
          };
        }
        if (!(response instanceof PublicKeyCredential)) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Browser returned unexpected credential type", response)
          };
        }
        return { data: response, error: null };
      } catch (err) {
        return {
          data: null,
          error: (0, webauthn_errors_1.identifyRegistrationError)({
            error: err,
            options
          })
        };
      }
    }
    async function getCredential(options) {
      try {
        const response = await navigator.credentials.get(
          /** we assert the type here until typescript types are updated */
          options
        );
        if (!response) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Empty credential response", response)
          };
        }
        if (!(response instanceof PublicKeyCredential)) {
          return {
            data: null,
            error: new webauthn_errors_1.WebAuthnUnknownError("Browser returned unexpected credential type", response)
          };
        }
        return { data: response, error: null };
      } catch (err) {
        return {
          data: null,
          error: (0, webauthn_errors_1.identifyAuthenticationError)({
            error: err,
            options
          })
        };
      }
    }
    exports2.DEFAULT_CREATION_OPTIONS = {
      hints: ["security-key"],
      authenticatorSelection: {
        authenticatorAttachment: "cross-platform",
        requireResidentKey: false,
        /** set to preferred because older yubikeys don't have PIN/Biometric */
        userVerification: "preferred",
        residentKey: "discouraged"
      },
      attestation: "direct"
    };
    exports2.DEFAULT_REQUEST_OPTIONS = {
      /** set to preferred because older yubikeys don't have PIN/Biometric */
      userVerification: "preferred",
      hints: ["security-key"],
      attestation: "direct"
    };
    function deepMerge(...sources) {
      const isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
      const isArrayBufferLike = (val) => val instanceof ArrayBuffer || ArrayBuffer.isView(val);
      const result = {};
      for (const source of sources) {
        if (!source)
          continue;
        for (const key in source) {
          const value = source[key];
          if (value === void 0)
            continue;
          if (Array.isArray(value)) {
            result[key] = value;
          } else if (isArrayBufferLike(value)) {
            result[key] = value;
          } else if (isObject(value)) {
            const existing = result[key];
            if (isObject(existing)) {
              result[key] = deepMerge(existing, value);
            } else {
              result[key] = deepMerge(value);
            }
          } else {
            result[key] = value;
          }
        }
      }
      return result;
    }
    function mergeCredentialCreationOptions(baseOptions, overrides) {
      return deepMerge(exports2.DEFAULT_CREATION_OPTIONS, baseOptions, overrides || {});
    }
    function mergeCredentialRequestOptions(baseOptions, overrides) {
      return deepMerge(exports2.DEFAULT_REQUEST_OPTIONS, baseOptions, overrides || {});
    }
    var WebAuthnApi = class {
      constructor(client) {
        this.client = client;
        this.enroll = this._enroll.bind(this);
        this.challenge = this._challenge.bind(this);
        this.verify = this._verify.bind(this);
        this.authenticate = this._authenticate.bind(this);
        this.register = this._register.bind(this);
      }
      /**
       * Enroll a new WebAuthn factor.
       * Creates an unverified WebAuthn factor that must be verified with a credential.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Omit<MFAEnrollWebauthnParams, 'factorType'>} params - Enrollment parameters (friendlyName required)
       * @returns {Promise<AuthMFAEnrollWebauthnResponse>} Enrolled factor details or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registering a New Credential}
       */
      async _enroll(params) {
        return this.client.mfa.enroll(Object.assign(Object.assign({}, params), { factorType: "webauthn" }));
      }
      /**
       * Challenge for WebAuthn credential creation or authentication.
       * Combines server challenge with browser credential operations.
       * Handles both registration (create) and authentication (request) flows.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {MFAChallengeWebauthnParams & { friendlyName?: string; signal?: AbortSignal }} params - Challenge parameters including factorId
       * @param {Object} overrides - Allows you to override the parameters passed to navigator.credentials
       * @param {PublicKeyCredentialCreationOptionsFuture} overrides.create - Override options for credential creation
       * @param {PublicKeyCredentialRequestOptionsFuture} overrides.request - Override options for credential request
       * @returns {Promise<RequestResult>} Challenge response with credential or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-credential-creation W3C WebAuthn Spec - Credential Creation}
       * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying Assertion}
       */
      async _challenge({ factorId, webauthn, friendlyName, signal }, overrides) {
        var _a;
        try {
          const { data: challengeResponse, error: challengeError } = await this.client.mfa.challenge({
            factorId,
            webauthn
          });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          const abortSignal = signal !== null && signal !== void 0 ? signal : exports2.webAuthnAbortService.createNewAbortSignal();
          if (challengeResponse.webauthn.type === "create") {
            const { user } = challengeResponse.webauthn.credential_options.publicKey;
            if (!user.name) {
              const nameToUse = friendlyName;
              if (!nameToUse) {
                const currentUser = await this.client.getUser();
                const userData = currentUser.data.user;
                const fallbackName = ((_a = userData === null || userData === void 0 ? void 0 : userData.user_metadata) === null || _a === void 0 ? void 0 : _a.name) || (userData === null || userData === void 0 ? void 0 : userData.email) || (userData === null || userData === void 0 ? void 0 : userData.id) || "User";
                user.name = `${user.id}:${fallbackName}`;
              } else {
                user.name = `${user.id}:${nameToUse}`;
              }
            }
            if (!user.displayName) {
              user.displayName = user.name;
            }
          }
          switch (challengeResponse.webauthn.type) {
            case "create": {
              const options = mergeCredentialCreationOptions(challengeResponse.webauthn.credential_options.publicKey, overrides === null || overrides === void 0 ? void 0 : overrides.create);
              const { data, error } = await createCredential({
                publicKey: options,
                signal: abortSignal
              });
              if (data) {
                return {
                  data: {
                    factorId,
                    challengeId: challengeResponse.id,
                    webauthn: {
                      type: challengeResponse.webauthn.type,
                      credential_response: data
                    }
                  },
                  error: null
                };
              }
              return { data: null, error };
            }
            case "request": {
              const options = mergeCredentialRequestOptions(challengeResponse.webauthn.credential_options.publicKey, overrides === null || overrides === void 0 ? void 0 : overrides.request);
              const { data, error } = await getCredential(Object.assign(Object.assign({}, challengeResponse.webauthn.credential_options), { publicKey: options, signal: abortSignal }));
              if (data) {
                return {
                  data: {
                    factorId,
                    challengeId: challengeResponse.id,
                    webauthn: {
                      type: challengeResponse.webauthn.type,
                      credential_response: data
                    }
                  },
                  error: null
                };
              }
              return { data: null, error };
            }
          }
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new errors_1.AuthUnknownError("Unexpected error in challenge", error)
          };
        }
      }
      /**
       * Verify a WebAuthn credential with the server.
       * Completes the WebAuthn ceremony by sending the credential to the server for verification.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Verification parameters
       * @param {string} params.challengeId - ID of the challenge being verified
       * @param {string} params.factorId - ID of the WebAuthn factor
       * @param {MFAVerifyWebauthnParams<T>['webauthn']} params.webauthn - WebAuthn credential response
       * @returns {Promise<AuthMFAVerifyResponse>} Verification result with session or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying an Authentication Assertion}
       * */
      async _verify({ challengeId, factorId, webauthn }) {
        return this.client.mfa.verify({
          factorId,
          challengeId,
          webauthn
        });
      }
      /**
       * Complete WebAuthn authentication flow.
       * Performs challenge and verification in a single operation for existing credentials.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Authentication parameters
       * @param {string} params.factorId - ID of the WebAuthn factor to authenticate with
       * @param {Object} params.webauthn - WebAuthn configuration
       * @param {string} params.webauthn.rpId - Relying Party ID (defaults to current hostname)
       * @param {string[]} params.webauthn.rpOrigins - Allowed origins (defaults to current origin)
       * @param {AbortSignal} params.webauthn.signal - Optional abort signal
       * @param {PublicKeyCredentialRequestOptionsFuture} overrides - Override options for navigator.credentials.get
       * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Authentication result
       * @see {@link https://w3c.github.io/webauthn/#sctn-authentication W3C WebAuthn Spec - Authentication Ceremony}
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions MDN - PublicKeyCredentialRequestOptions}
       */
      async _authenticate({ factorId, webauthn: { rpId = typeof window !== "undefined" ? window.location.hostname : void 0, rpOrigins = typeof window !== "undefined" ? [window.location.origin] : void 0, signal } = {} }, overrides) {
        if (!rpId) {
          return {
            data: null,
            error: new errors_1.AuthError("rpId is required for WebAuthn authentication")
          };
        }
        try {
          if (!browserSupportsWebAuthn()) {
            return {
              data: null,
              error: new errors_1.AuthUnknownError("Browser does not support WebAuthn", null)
            };
          }
          const { data: challengeResponse, error: challengeError } = await this.challenge({
            factorId,
            webauthn: { rpId, rpOrigins },
            signal
          }, { request: overrides });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          const { webauthn } = challengeResponse;
          return this._verify({
            factorId,
            challengeId: challengeResponse.challengeId,
            webauthn: {
              type: webauthn.type,
              rpId,
              rpOrigins,
              credential_response: webauthn.credential_response
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new errors_1.AuthUnknownError("Unexpected error in authenticate", error)
          };
        }
      }
      /**
       * Complete WebAuthn registration flow.
       * Performs enrollment, challenge, and verification in a single operation for new credentials.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Registration parameters
       * @param {string} params.friendlyName - User-friendly name for the credential
       * @param {string} params.rpId - Relying Party ID (defaults to current hostname)
       * @param {string[]} params.rpOrigins - Allowed origins (defaults to current origin)
       * @param {AbortSignal} params.signal - Optional abort signal
       * @param {PublicKeyCredentialCreationOptionsFuture} overrides - Override options for navigator.credentials.create
       * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Registration result
       * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registration Ceremony}
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialCreationOptions MDN - PublicKeyCredentialCreationOptions}
       */
      async _register({ friendlyName, webauthn: { rpId = typeof window !== "undefined" ? window.location.hostname : void 0, rpOrigins = typeof window !== "undefined" ? [window.location.origin] : void 0, signal } = {} }, overrides) {
        if (!rpId) {
          return {
            data: null,
            error: new errors_1.AuthError("rpId is required for WebAuthn registration")
          };
        }
        try {
          if (!browserSupportsWebAuthn()) {
            return {
              data: null,
              error: new errors_1.AuthUnknownError("Browser does not support WebAuthn", null)
            };
          }
          const { data: factor, error: enrollError } = await this._enroll({
            friendlyName
          });
          if (!factor) {
            await this.client.mfa.listFactors().then((factors) => {
              var _a;
              return (_a = factors.data) === null || _a === void 0 ? void 0 : _a.all.find((v) => v.factor_type === "webauthn" && v.friendly_name === friendlyName && v.status !== "unverified");
            }).then((factor2) => factor2 ? this.client.mfa.unenroll({ factorId: factor2 === null || factor2 === void 0 ? void 0 : factor2.id }) : void 0);
            return { data: null, error: enrollError };
          }
          const { data: challengeResponse, error: challengeError } = await this._challenge({
            factorId: factor.id,
            friendlyName: factor.friendly_name,
            webauthn: { rpId, rpOrigins },
            signal
          }, {
            create: overrides
          });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          return this._verify({
            factorId: factor.id,
            challengeId: challengeResponse.challengeId,
            webauthn: {
              rpId,
              rpOrigins,
              type: challengeResponse.webauthn.type,
              credential_response: challengeResponse.webauthn.credential_response
            }
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new errors_1.AuthUnknownError("Unexpected error in register", error)
          };
        }
      }
    };
    exports2.WebAuthnApi = WebAuthnApi;
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js
var require_GoTrueClient = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueAdminApi_1 = tslib_1.__importDefault(require_GoTrueAdminApi());
    var constants_1 = require_constants2();
    var errors_1 = require_errors();
    var fetch_1 = require_fetch();
    var helpers_1 = require_helpers();
    var local_storage_1 = require_local_storage();
    var locks_1 = require_locks();
    var polyfills_1 = require_polyfills();
    var version_1 = require_version2();
    var base64url_1 = require_base64url();
    var ethereum_1 = require_ethereum();
    var webauthn_1 = require_webauthn();
    (0, polyfills_1.polyfillGlobalThis)();
    var DEFAULT_OPTIONS = {
      url: constants_1.GOTRUE_URL,
      storageKey: constants_1.STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      headers: constants_1.DEFAULT_HEADERS,
      flowType: "implicit",
      debug: false,
      hasCustomAuthorizationHeader: false,
      throwOnError: false,
      lockAcquireTimeout: 1e4
      // 10 seconds
    };
    async function lockNoOp(name, acquireTimeout, fn) {
      return await fn();
    }
    var GLOBAL_JWKS = {};
    var GoTrueClient = class _GoTrueClient {
      /**
       * The JWKS used for verifying asymmetric JWTs
       */
      get jwks() {
        var _a, _b;
        return (_b = (_a = GLOBAL_JWKS[this.storageKey]) === null || _a === void 0 ? void 0 : _a.jwks) !== null && _b !== void 0 ? _b : { keys: [] };
      }
      set jwks(value) {
        GLOBAL_JWKS[this.storageKey] = Object.assign(Object.assign({}, GLOBAL_JWKS[this.storageKey]), { jwks: value });
      }
      get jwks_cached_at() {
        var _a, _b;
        return (_b = (_a = GLOBAL_JWKS[this.storageKey]) === null || _a === void 0 ? void 0 : _a.cachedAt) !== null && _b !== void 0 ? _b : Number.MIN_SAFE_INTEGER;
      }
      set jwks_cached_at(value) {
        GLOBAL_JWKS[this.storageKey] = Object.assign(Object.assign({}, GLOBAL_JWKS[this.storageKey]), { cachedAt: value });
      }
      /**
       * Create a new client for use in the browser.
       *
       * @example
       * ```ts
       * import { GoTrueClient } from '@supabase/auth-js'
       *
       * const auth = new GoTrueClient({
       *   url: 'https://xyzcompany.supabase.co/auth/v1',
       *   headers: { apikey: 'public-anon-key' },
       *   storageKey: 'supabase-auth',
       * })
       * ```
       */
      constructor(options) {
        var _a, _b, _c;
        this.userStorage = null;
        this.memoryStorage = null;
        this.stateChangeEmitters = /* @__PURE__ */ new Map();
        this.autoRefreshTicker = null;
        this.autoRefreshTickTimeout = null;
        this.visibilityChangedCallback = null;
        this.refreshingDeferred = null;
        this.initializePromise = null;
        this.detectSessionInUrl = true;
        this.hasCustomAuthorizationHeader = false;
        this.suppressGetSessionWarning = false;
        this.lockAcquired = false;
        this.pendingInLock = [];
        this.broadcastChannel = null;
        this.logger = console.log;
        const settings = Object.assign(Object.assign({}, DEFAULT_OPTIONS), options);
        this.storageKey = settings.storageKey;
        this.instanceID = (_a = _GoTrueClient.nextInstanceID[this.storageKey]) !== null && _a !== void 0 ? _a : 0;
        _GoTrueClient.nextInstanceID[this.storageKey] = this.instanceID + 1;
        this.logDebugMessages = !!settings.debug;
        if (typeof settings.debug === "function") {
          this.logger = settings.debug;
        }
        if (this.instanceID > 0 && (0, helpers_1.isBrowser)()) {
          const message = `${this._logPrefix()} Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`;
          console.warn(message);
          if (this.logDebugMessages) {
            console.trace(message);
          }
        }
        this.persistSession = settings.persistSession;
        this.autoRefreshToken = settings.autoRefreshToken;
        this.admin = new GoTrueAdminApi_1.default({
          url: settings.url,
          headers: settings.headers,
          fetch: settings.fetch
        });
        this.url = settings.url;
        this.headers = settings.headers;
        this.fetch = (0, helpers_1.resolveFetch)(settings.fetch);
        this.lock = settings.lock || lockNoOp;
        this.detectSessionInUrl = settings.detectSessionInUrl;
        this.flowType = settings.flowType;
        this.hasCustomAuthorizationHeader = settings.hasCustomAuthorizationHeader;
        this.throwOnError = settings.throwOnError;
        this.lockAcquireTimeout = settings.lockAcquireTimeout;
        if (settings.lock) {
          this.lock = settings.lock;
        } else if (this.persistSession && (0, helpers_1.isBrowser)() && ((_b = globalThis === null || globalThis === void 0 ? void 0 : globalThis.navigator) === null || _b === void 0 ? void 0 : _b.locks)) {
          this.lock = locks_1.navigatorLock;
        } else {
          this.lock = lockNoOp;
        }
        if (!this.jwks) {
          this.jwks = { keys: [] };
          this.jwks_cached_at = Number.MIN_SAFE_INTEGER;
        }
        this.mfa = {
          verify: this._verify.bind(this),
          enroll: this._enroll.bind(this),
          unenroll: this._unenroll.bind(this),
          challenge: this._challenge.bind(this),
          listFactors: this._listFactors.bind(this),
          challengeAndVerify: this._challengeAndVerify.bind(this),
          getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this),
          webauthn: new webauthn_1.WebAuthnApi(this)
        };
        this.oauth = {
          getAuthorizationDetails: this._getAuthorizationDetails.bind(this),
          approveAuthorization: this._approveAuthorization.bind(this),
          denyAuthorization: this._denyAuthorization.bind(this),
          listGrants: this._listOAuthGrants.bind(this),
          revokeGrant: this._revokeOAuthGrant.bind(this)
        };
        if (this.persistSession) {
          if (settings.storage) {
            this.storage = settings.storage;
          } else {
            if ((0, helpers_1.supportsLocalStorage)()) {
              this.storage = globalThis.localStorage;
            } else {
              this.memoryStorage = {};
              this.storage = (0, local_storage_1.memoryLocalStorageAdapter)(this.memoryStorage);
            }
          }
          if (settings.userStorage) {
            this.userStorage = settings.userStorage;
          }
        } else {
          this.memoryStorage = {};
          this.storage = (0, local_storage_1.memoryLocalStorageAdapter)(this.memoryStorage);
        }
        if ((0, helpers_1.isBrowser)() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
          try {
            this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
          } catch (e) {
            console.error("Failed to create a new BroadcastChannel, multi-tab state changes will not be available", e);
          }
          (_c = this.broadcastChannel) === null || _c === void 0 ? void 0 : _c.addEventListener("message", async (event) => {
            this._debug("received broadcast notification from other tab or client", event);
            try {
              await this._notifyAllSubscribers(event.data.event, event.data.session, false);
            } catch (error) {
              this._debug("#broadcastChannel", "error", error);
            }
          });
        }
        this.initialize().catch((error) => {
          this._debug("#initialize()", "error", error);
        });
      }
      /**
       * Returns whether error throwing mode is enabled for this client.
       */
      isThrowOnErrorEnabled() {
        return this.throwOnError;
      }
      /**
       * Centralizes return handling with optional error throwing. When `throwOnError` is enabled
       * and the provided result contains a non-nullish error, the error is thrown instead of
       * being returned. This ensures consistent behavior across all public API methods.
       */
      _returnResult(result) {
        if (this.throwOnError && result && result.error) {
          throw result.error;
        }
        return result;
      }
      _logPrefix() {
        return `GoTrueClient@${this.storageKey}:${this.instanceID} (${version_1.version}) ${(/* @__PURE__ */ new Date()).toISOString()}`;
      }
      _debug(...args) {
        if (this.logDebugMessages) {
          this.logger(this._logPrefix(), ...args);
        }
        return this;
      }
      /**
       * Initializes the client session either from the url or from storage.
       * This method is automatically called when instantiating the client, but should also be called
       * manually when checking for an error from an auth redirect (oauth, magiclink, password recovery, etc).
       */
      async initialize() {
        if (this.initializePromise) {
          return await this.initializePromise;
        }
        this.initializePromise = (async () => {
          return await this._acquireLock(this.lockAcquireTimeout, async () => {
            return await this._initialize();
          });
        })();
        return await this.initializePromise;
      }
      /**
       * IMPORTANT:
       * 1. Never throw in this method, as it is called from the constructor
       * 2. Never return a session from this method as it would be cached over
       *    the whole lifetime of the client
       */
      async _initialize() {
        var _a;
        try {
          let params = {};
          let callbackUrlType = "none";
          if ((0, helpers_1.isBrowser)()) {
            params = (0, helpers_1.parseParametersFromURL)(window.location.href);
            if (this._isImplicitGrantCallback(params)) {
              callbackUrlType = "implicit";
            } else if (await this._isPKCECallback(params)) {
              callbackUrlType = "pkce";
            }
          }
          if ((0, helpers_1.isBrowser)() && this.detectSessionInUrl && callbackUrlType !== "none") {
            const { data, error } = await this._getSessionFromURL(params, callbackUrlType);
            if (error) {
              this._debug("#_initialize()", "error detecting session from URL", error);
              if ((0, errors_1.isAuthImplicitGrantRedirectError)(error)) {
                const errorCode = (_a = error.details) === null || _a === void 0 ? void 0 : _a.code;
                if (errorCode === "identity_already_exists" || errorCode === "identity_not_found" || errorCode === "single_identity_not_deletable") {
                  return { error };
                }
              }
              return { error };
            }
            const { session, redirectType } = data;
            this._debug("#_initialize()", "detected session in URL", session, "redirect type", redirectType);
            await this._saveSession(session);
            setTimeout(async () => {
              if (redirectType === "recovery") {
                await this._notifyAllSubscribers("PASSWORD_RECOVERY", session);
              } else {
                await this._notifyAllSubscribers("SIGNED_IN", session);
              }
            }, 0);
            return { error: null };
          }
          await this._recoverAndRefresh();
          return { error: null };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ error });
          }
          return this._returnResult({
            error: new errors_1.AuthUnknownError("Unexpected error during initialization", error)
          });
        } finally {
          await this._handleVisibilityChange();
          this._debug("#_initialize()", "end");
        }
      }
      /**
       * Creates a new anonymous user.
       *
       * @returns A session where the is_anonymous claim in the access token JWT set to true
       */
      async signInAnonymously(credentials) {
        var _a, _b, _c;
        try {
          const res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/signup`, {
            headers: this.headers,
            body: {
              data: (_b = (_a = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _a === void 0 ? void 0 : _a.data) !== null && _b !== void 0 ? _b : {},
              gotrue_meta_security: { captcha_token: (_c = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _c === void 0 ? void 0 : _c.captchaToken }
            },
            xform: fetch_1._sessionResponse
          });
          const { data, error } = res;
          if (error || !data) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          const session = data.session;
          const user = data.user;
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Creates a new user.
       *
       * Be aware that if a user account exists in the system you may get back an
       * error message that attempts to hide this information from the user.
       * This method has support for PKCE via email signups. The PKCE flow cannot be used when autoconfirm is enabled.
       *
       * @returns A logged-in session if the server has "autoconfirm" ON
       * @returns A user if the server has "autoconfirm" OFF
       */
      async signUp(credentials) {
        var _a, _b, _c;
        try {
          let res;
          if ("email" in credentials) {
            const { email, password, options } = credentials;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce") {
              ;
              [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
            }
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/signup`, {
              headers: this.headers,
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
              body: {
                email,
                password,
                data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod
              },
              xform: fetch_1._sessionResponse
            });
          } else if ("phone" in credentials) {
            const { phone, password, options } = credentials;
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/signup`, {
              headers: this.headers,
              body: {
                phone,
                password,
                data: (_b = options === null || options === void 0 ? void 0 : options.data) !== null && _b !== void 0 ? _b : {},
                channel: (_c = options === null || options === void 0 ? void 0 : options.channel) !== null && _c !== void 0 ? _c : "sms",
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponse
            });
          } else {
            throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
          }
          const { data, error } = res;
          if (error || !data) {
            await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          const session = data.session;
          const user = data.user;
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in an existing user with an email and password or phone and password.
       *
       * Be aware that you may get back an error message that will not distinguish
       * between the cases where the account does not exist or that the
       * email/phone and password combination is wrong or that the account can only
       * be accessed via social login.
       */
      async signInWithPassword(credentials) {
        try {
          let res;
          if ("email" in credentials) {
            const { email, password, options } = credentials;
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
              headers: this.headers,
              body: {
                email,
                password,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponsePassword
            });
          } else if ("phone" in credentials) {
            const { phone, password, options } = credentials;
            res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
              headers: this.headers,
              body: {
                phone,
                password,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponsePassword
            });
          } else {
            throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
          }
          const { data, error } = res;
          if (error) {
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({
            data: Object.assign({ user: data.user, session: data.session }, data.weak_password ? { weakPassword: data.weak_password } : null),
            error
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in an existing user via a third-party provider.
       * This method supports the PKCE flow.
       */
      async signInWithOAuth(credentials) {
        var _a, _b, _c, _d;
        return await this._handleProviderSignIn(credentials.provider, {
          redirectTo: (_a = credentials.options) === null || _a === void 0 ? void 0 : _a.redirectTo,
          scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
          queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
          skipBrowserRedirect: (_d = credentials.options) === null || _d === void 0 ? void 0 : _d.skipBrowserRedirect
        });
      }
      /**
       * Log in an existing user by exchanging an Auth Code issued during the PKCE flow.
       */
      async exchangeCodeForSession(authCode) {
        await this.initializePromise;
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          return this._exchangeCodeForSession(authCode);
        });
      }
      /**
       * Signs in a user by verifying a message signed by the user's private key.
       * Supports Ethereum (via Sign-In-With-Ethereum) & Solana (Sign-In-With-Solana) standards,
       * both of which derive from the EIP-4361 standard
       * With slight variation on Solana's side.
       * @reference https://eips.ethereum.org/EIPS/eip-4361
       */
      async signInWithWeb3(credentials) {
        const { chain } = credentials;
        switch (chain) {
          case "ethereum":
            return await this.signInWithEthereum(credentials);
          case "solana":
            return await this.signInWithSolana(credentials);
          default:
            throw new Error(`@supabase/auth-js: Unsupported chain "${chain}"`);
        }
      }
      async signInWithEthereum(credentials) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        let message;
        let signature;
        if ("message" in credentials) {
          message = credentials.message;
          signature = credentials.signature;
        } else {
          const { chain, wallet, statement, options } = credentials;
          let resolvedWallet;
          if (!(0, helpers_1.isBrowser)()) {
            if (typeof wallet !== "object" || !(options === null || options === void 0 ? void 0 : options.url)) {
              throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
            }
            resolvedWallet = wallet;
          } else if (typeof wallet === "object") {
            resolvedWallet = wallet;
          } else {
            const windowAny = window;
            if ("ethereum" in windowAny && typeof windowAny.ethereum === "object" && "request" in windowAny.ethereum && typeof windowAny.ethereum.request === "function") {
              resolvedWallet = windowAny.ethereum;
            } else {
              throw new Error(`@supabase/auth-js: No compatible Ethereum wallet interface on the window object (window.ethereum) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'ethereum', wallet: resolvedUserWallet }) instead.`);
            }
          }
          const url = new URL((_a = options === null || options === void 0 ? void 0 : options.url) !== null && _a !== void 0 ? _a : window.location.href);
          const accounts = await resolvedWallet.request({
            method: "eth_requestAccounts"
          }).then((accs) => accs).catch(() => {
            throw new Error(`@supabase/auth-js: Wallet method eth_requestAccounts is missing or invalid`);
          });
          if (!accounts || accounts.length === 0) {
            throw new Error(`@supabase/auth-js: No accounts available. Please ensure the wallet is connected.`);
          }
          const address = (0, ethereum_1.getAddress)(accounts[0]);
          let chainId = (_b = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _b === void 0 ? void 0 : _b.chainId;
          if (!chainId) {
            const chainIdHex = await resolvedWallet.request({
              method: "eth_chainId"
            });
            chainId = (0, ethereum_1.fromHex)(chainIdHex);
          }
          const siweMessage = {
            domain: url.host,
            address,
            statement,
            uri: url.href,
            version: "1",
            chainId,
            nonce: (_c = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _c === void 0 ? void 0 : _c.nonce,
            issuedAt: (_e = (_d = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _d === void 0 ? void 0 : _d.issuedAt) !== null && _e !== void 0 ? _e : /* @__PURE__ */ new Date(),
            expirationTime: (_f = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _f === void 0 ? void 0 : _f.expirationTime,
            notBefore: (_g = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _g === void 0 ? void 0 : _g.notBefore,
            requestId: (_h = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _h === void 0 ? void 0 : _h.requestId,
            resources: (_j = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _j === void 0 ? void 0 : _j.resources
          };
          message = (0, ethereum_1.createSiweMessage)(siweMessage);
          signature = await resolvedWallet.request({
            method: "personal_sign",
            params: [(0, ethereum_1.toHex)(message), address]
          });
        }
        try {
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
            headers: this.headers,
            body: Object.assign({
              chain: "ethereum",
              message,
              signature
            }, ((_k = credentials.options) === null || _k === void 0 ? void 0 : _k.captchaToken) ? { gotrue_meta_security: { captcha_token: (_l = credentials.options) === null || _l === void 0 ? void 0 : _l.captchaToken } } : null),
            xform: fetch_1._sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign({}, data), error });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      async signInWithSolana(credentials) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        let message;
        let signature;
        if ("message" in credentials) {
          message = credentials.message;
          signature = credentials.signature;
        } else {
          const { chain, wallet, statement, options } = credentials;
          let resolvedWallet;
          if (!(0, helpers_1.isBrowser)()) {
            if (typeof wallet !== "object" || !(options === null || options === void 0 ? void 0 : options.url)) {
              throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
            }
            resolvedWallet = wallet;
          } else if (typeof wallet === "object") {
            resolvedWallet = wallet;
          } else {
            const windowAny = window;
            if ("solana" in windowAny && typeof windowAny.solana === "object" && ("signIn" in windowAny.solana && typeof windowAny.solana.signIn === "function" || "signMessage" in windowAny.solana && typeof windowAny.solana.signMessage === "function")) {
              resolvedWallet = windowAny.solana;
            } else {
              throw new Error(`@supabase/auth-js: No compatible Solana wallet interface on the window object (window.solana) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'solana', wallet: resolvedUserWallet }) instead.`);
            }
          }
          const url = new URL((_a = options === null || options === void 0 ? void 0 : options.url) !== null && _a !== void 0 ? _a : window.location.href);
          if ("signIn" in resolvedWallet && resolvedWallet.signIn) {
            const output = await resolvedWallet.signIn(Object.assign(Object.assign(Object.assign({ issuedAt: (/* @__PURE__ */ new Date()).toISOString() }, options === null || options === void 0 ? void 0 : options.signInWithSolana), {
              // non-overridable properties
              version: "1",
              domain: url.host,
              uri: url.href
            }), statement ? { statement } : null));
            let outputToProcess;
            if (Array.isArray(output) && output[0] && typeof output[0] === "object") {
              outputToProcess = output[0];
            } else if (output && typeof output === "object" && "signedMessage" in output && "signature" in output) {
              outputToProcess = output;
            } else {
              throw new Error("@supabase/auth-js: Wallet method signIn() returned unrecognized value");
            }
            if ("signedMessage" in outputToProcess && "signature" in outputToProcess && (typeof outputToProcess.signedMessage === "string" || outputToProcess.signedMessage instanceof Uint8Array) && outputToProcess.signature instanceof Uint8Array) {
              message = typeof outputToProcess.signedMessage === "string" ? outputToProcess.signedMessage : new TextDecoder().decode(outputToProcess.signedMessage);
              signature = outputToProcess.signature;
            } else {
              throw new Error("@supabase/auth-js: Wallet method signIn() API returned object without signedMessage and signature fields");
            }
          } else {
            if (!("signMessage" in resolvedWallet) || typeof resolvedWallet.signMessage !== "function" || !("publicKey" in resolvedWallet) || typeof resolvedWallet !== "object" || !resolvedWallet.publicKey || !("toBase58" in resolvedWallet.publicKey) || typeof resolvedWallet.publicKey.toBase58 !== "function") {
              throw new Error("@supabase/auth-js: Wallet does not have a compatible signMessage() and publicKey.toBase58() API");
            }
            message = [
              `${url.host} wants you to sign in with your Solana account:`,
              resolvedWallet.publicKey.toBase58(),
              ...statement ? ["", statement, ""] : [""],
              "Version: 1",
              `URI: ${url.href}`,
              `Issued At: ${(_c = (_b = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _b === void 0 ? void 0 : _b.issuedAt) !== null && _c !== void 0 ? _c : (/* @__PURE__ */ new Date()).toISOString()}`,
              ...((_d = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _d === void 0 ? void 0 : _d.notBefore) ? [`Not Before: ${options.signInWithSolana.notBefore}`] : [],
              ...((_e = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _e === void 0 ? void 0 : _e.expirationTime) ? [`Expiration Time: ${options.signInWithSolana.expirationTime}`] : [],
              ...((_f = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _f === void 0 ? void 0 : _f.chainId) ? [`Chain ID: ${options.signInWithSolana.chainId}`] : [],
              ...((_g = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _g === void 0 ? void 0 : _g.nonce) ? [`Nonce: ${options.signInWithSolana.nonce}`] : [],
              ...((_h = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _h === void 0 ? void 0 : _h.requestId) ? [`Request ID: ${options.signInWithSolana.requestId}`] : [],
              ...((_k = (_j = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _j === void 0 ? void 0 : _j.resources) === null || _k === void 0 ? void 0 : _k.length) ? [
                "Resources",
                ...options.signInWithSolana.resources.map((resource) => `- ${resource}`)
              ] : []
            ].join("\n");
            const maybeSignature = await resolvedWallet.signMessage(new TextEncoder().encode(message), "utf8");
            if (!maybeSignature || !(maybeSignature instanceof Uint8Array)) {
              throw new Error("@supabase/auth-js: Wallet signMessage() API returned an recognized value");
            }
            signature = maybeSignature;
          }
        }
        try {
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
            headers: this.headers,
            body: Object.assign({ chain: "solana", message, signature: (0, base64url_1.bytesToBase64URL)(signature) }, ((_l = credentials.options) === null || _l === void 0 ? void 0 : _l.captchaToken) ? { gotrue_meta_security: { captcha_token: (_m = credentials.options) === null || _m === void 0 ? void 0 : _m.captchaToken } } : null),
            xform: fetch_1._sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign({}, data), error });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      async _exchangeCodeForSession(authCode) {
        const storageItem = await (0, helpers_1.getItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
        const [codeVerifier, redirectType] = (storageItem !== null && storageItem !== void 0 ? storageItem : "").split("/");
        try {
          if (!codeVerifier && this.flowType === "pkce") {
            throw new errors_1.AuthPKCECodeVerifierMissingError();
          }
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=pkce`, {
            headers: this.headers,
            body: {
              auth_code: authCode,
              code_verifier: codeVerifier
            },
            xform: fetch_1._sessionResponse
          });
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({
              data: { user: null, session: null, redirectType: null },
              error: invalidTokenError
            });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign(Object.assign({}, data), { redirectType: redirectType !== null && redirectType !== void 0 ? redirectType : null }), error });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({
              data: { user: null, session: null, redirectType: null },
              error
            });
          }
          throw error;
        }
      }
      /**
       * Allows signing in with an OIDC ID token. The authentication provider used
       * should be enabled and configured.
       */
      async signInWithIdToken(credentials) {
        try {
          const { options, provider, token, access_token, nonce } = credentials;
          const res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
            headers: this.headers,
            body: {
              provider,
              id_token: token,
              access_token,
              nonce,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
            },
            xform: fetch_1._sessionResponse
          });
          const { data, error } = res;
          if (error) {
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if (!data || !data.session || !data.user) {
            const invalidTokenError = new errors_1.AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data, error });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in a user using magiclink or a one-time password (OTP).
       *
       * If the `{{ .ConfirmationURL }}` variable is specified in the email template, a magiclink will be sent.
       * If the `{{ .Token }}` variable is specified in the email template, an OTP will be sent.
       * If you're using phone sign-ins, only an OTP will be sent. You won't be able to send a magiclink for phone sign-ins.
       *
       * Be aware that you may get back an error message that will not distinguish
       * between the cases where the account does not exist or, that the account
       * can only be accessed via social login.
       *
       * Do note that you will need to configure a Whatsapp sender on Twilio
       * if you are using phone sign in with the 'whatsapp' channel. The whatsapp
       * channel is not supported on other providers
       * at this time.
       * This method supports PKCE when an email is passed.
       */
      async signInWithOtp(credentials) {
        var _a, _b, _c, _d, _e;
        try {
          if ("email" in credentials) {
            const { email, options } = credentials;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce") {
              ;
              [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
            }
            const { error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/otp`, {
              headers: this.headers,
              body: {
                email,
                data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                create_user: (_b = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _b !== void 0 ? _b : true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod
              },
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          if ("phone" in credentials) {
            const { phone, options } = credentials;
            const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/otp`, {
              headers: this.headers,
              body: {
                phone,
                data: (_c = options === null || options === void 0 ? void 0 : options.data) !== null && _c !== void 0 ? _c : {},
                create_user: (_d = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _d !== void 0 ? _d : true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                channel: (_e = options === null || options === void 0 ? void 0 : options.channel) !== null && _e !== void 0 ? _e : "sms"
              }
            });
            return this._returnResult({
              data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id },
              error
            });
          }
          throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number.");
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in a user given a User supplied OTP or TokenHash received through mobile or email.
       */
      async verifyOtp(params) {
        var _a, _b;
        try {
          let redirectTo = void 0;
          let captchaToken = void 0;
          if ("options" in params) {
            redirectTo = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo;
            captchaToken = (_b = params.options) === null || _b === void 0 ? void 0 : _b.captchaToken;
          }
          const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/verify`, {
            headers: this.headers,
            body: Object.assign(Object.assign({}, params), { gotrue_meta_security: { captcha_token: captchaToken } }),
            redirectTo,
            xform: fetch_1._sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data) {
            const tokenVerificationError = new Error("An error occurred on token verification.");
            throw tokenVerificationError;
          }
          const session = data.session;
          const user = data.user;
          if (session === null || session === void 0 ? void 0 : session.access_token) {
            await this._saveSession(session);
            await this._notifyAllSubscribers(params.type == "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Attempts a single-sign on using an enterprise Identity Provider. A
       * successful SSO attempt will redirect the current page to the identity
       * provider authorization page. The redirect URL is implementation and SSO
       * protocol specific.
       *
       * You can use it by providing a SSO domain. Typically you can extract this
       * domain by asking users for their email address. If this domain is
       * registered on the Auth instance the redirect will use that organization's
       * currently active SSO Identity Provider for the login.
       *
       * If you have built an organization-specific login page, you can use the
       * organization's SSO Identity Provider UUID directly instead.
       */
      async signInWithSSO(params) {
        var _a, _b, _c, _d, _e;
        try {
          let codeChallenge = null;
          let codeChallengeMethod = null;
          if (this.flowType === "pkce") {
            ;
            [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
          }
          const result = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/sso`, {
            body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, "providerId" in params ? { provider_id: params.providerId } : null), "domain" in params ? { domain: params.domain } : null), { redirect_to: (_b = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo) !== null && _b !== void 0 ? _b : void 0 }), ((_c = params === null || params === void 0 ? void 0 : params.options) === null || _c === void 0 ? void 0 : _c.captchaToken) ? { gotrue_meta_security: { captcha_token: params.options.captchaToken } } : null), { skip_http_redirect: true, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
            headers: this.headers,
            xform: fetch_1._ssoResponse
          });
          if (((_d = result.data) === null || _d === void 0 ? void 0 : _d.url) && (0, helpers_1.isBrowser)() && !((_e = params.options) === null || _e === void 0 ? void 0 : _e.skipBrowserRedirect)) {
            window.location.assign(result.data.url);
          }
          return this._returnResult(result);
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Sends a reauthentication OTP to the user's email or phone number.
       * Requires the user to be signed-in.
       */
      async reauthenticate() {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._reauthenticate();
        });
      }
      async _reauthenticate() {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError)
              throw sessionError;
            if (!session)
              throw new errors_1.AuthSessionMissingError();
            const { error } = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/reauthenticate`, {
              headers: this.headers,
              jwt: session.access_token
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Resends an existing signup confirmation email, email change email, SMS OTP or phone change OTP.
       */
      async resend(credentials) {
        try {
          const endpoint = `${this.url}/resend`;
          if ("email" in credentials) {
            const { email, type, options } = credentials;
            const { error } = await (0, fetch_1._request)(this.fetch, "POST", endpoint, {
              headers: this.headers,
              body: {
                email,
                type,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if ("phone" in credentials) {
            const { phone, type, options } = credentials;
            const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", endpoint, {
              headers: this.headers,
              body: {
                phone,
                type,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              }
            });
            return this._returnResult({
              data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id },
              error
            });
          }
          throw new errors_1.AuthInvalidCredentialsError("You must provide either an email or phone number and a type");
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Returns the session, refreshing it if necessary.
       *
       * The session returned can be null if the session is not detected which can happen in the event a user is not signed-in or has logged out.
       *
       * **IMPORTANT:** This method loads values directly from the storage attached
       * to the client. If that storage is based on request cookies for example,
       * the values in it may not be authentic and therefore it's strongly advised
       * against using this method and its results in such circumstances. A warning
       * will be emitted if this is detected. Use {@link #getUser()} instead.
       */
      async getSession() {
        await this.initializePromise;
        const result = await this._acquireLock(this.lockAcquireTimeout, async () => {
          return this._useSession(async (result2) => {
            return result2;
          });
        });
        return result;
      }
      /**
       * Acquires a global lock based on the storage key.
       */
      async _acquireLock(acquireTimeout, fn) {
        this._debug("#_acquireLock", "begin", acquireTimeout);
        try {
          if (this.lockAcquired) {
            const last = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve();
            const result = (async () => {
              await last;
              return await fn();
            })();
            this.pendingInLock.push((async () => {
              try {
                await result;
              } catch (e) {
              }
            })());
            return result;
          }
          return await this.lock(`lock:${this.storageKey}`, acquireTimeout, async () => {
            this._debug("#_acquireLock", "lock acquired for storage key", this.storageKey);
            try {
              this.lockAcquired = true;
              const result = fn();
              this.pendingInLock.push((async () => {
                try {
                  await result;
                } catch (e) {
                }
              })());
              await result;
              while (this.pendingInLock.length) {
                const waitOn = [...this.pendingInLock];
                await Promise.all(waitOn);
                this.pendingInLock.splice(0, waitOn.length);
              }
              return await result;
            } finally {
              this._debug("#_acquireLock", "lock released for storage key", this.storageKey);
              this.lockAcquired = false;
            }
          });
        } finally {
          this._debug("#_acquireLock", "end");
        }
      }
      /**
       * Use instead of {@link #getSession} inside the library. It is
       * semantically usually what you want, as getting a session involves some
       * processing afterwards that requires only one client operating on the
       * session at once across multiple tabs or processes.
       */
      async _useSession(fn) {
        this._debug("#_useSession", "begin");
        try {
          const result = await this.__loadSession();
          return await fn(result);
        } finally {
          this._debug("#_useSession", "end");
        }
      }
      /**
       * NEVER USE DIRECTLY!
       *
       * Always use {@link #_useSession}.
       */
      async __loadSession() {
        this._debug("#__loadSession()", "begin");
        if (!this.lockAcquired) {
          this._debug("#__loadSession()", "used outside of an acquired lock!", new Error().stack);
        }
        try {
          let currentSession = null;
          const maybeSession = await (0, helpers_1.getItemAsync)(this.storage, this.storageKey);
          this._debug("#getSession()", "session from storage", maybeSession);
          if (maybeSession !== null) {
            if (this._isValidSession(maybeSession)) {
              currentSession = maybeSession;
            } else {
              this._debug("#getSession()", "session from storage is not valid");
              await this._removeSession();
            }
          }
          if (!currentSession) {
            return { data: { session: null }, error: null };
          }
          const hasExpired = currentSession.expires_at ? currentSession.expires_at * 1e3 - Date.now() < constants_1.EXPIRY_MARGIN_MS : false;
          this._debug("#__loadSession()", `session has${hasExpired ? "" : " not"} expired`, "expires_at", currentSession.expires_at);
          if (!hasExpired) {
            if (this.userStorage) {
              const maybeUser = await (0, helpers_1.getItemAsync)(this.userStorage, this.storageKey + "-user");
              if (maybeUser === null || maybeUser === void 0 ? void 0 : maybeUser.user) {
                currentSession.user = maybeUser.user;
              } else {
                currentSession.user = (0, helpers_1.userNotAvailableProxy)();
              }
            }
            if (this.storage.isServer && currentSession.user && !currentSession.user.__isUserNotAvailableProxy) {
              const suppressWarningRef = { value: this.suppressGetSessionWarning };
              currentSession.user = (0, helpers_1.insecureUserWarningProxy)(currentSession.user, suppressWarningRef);
              if (suppressWarningRef.value) {
                this.suppressGetSessionWarning = true;
              }
            }
            return { data: { session: currentSession }, error: null };
          }
          const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token);
          if (error) {
            return this._returnResult({ data: { session: null }, error });
          }
          return this._returnResult({ data: { session }, error: null });
        } finally {
          this._debug("#__loadSession()", "end");
        }
      }
      /**
       * Gets the current user details if there is an existing session. This method
       * performs a network request to the Supabase Auth server, so the returned
       * value is authentic and can be used to base authorization rules on.
       *
       * @param jwt Takes in an optional access token JWT. If no JWT is provided, the JWT from the current session is used.
       */
      async getUser(jwt) {
        if (jwt) {
          return await this._getUser(jwt);
        }
        await this.initializePromise;
        const result = await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._getUser();
        });
        if (result.data.user) {
          this.suppressGetSessionWarning = true;
        }
        return result;
      }
      async _getUser(jwt) {
        try {
          if (jwt) {
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/user`, {
              headers: this.headers,
              jwt,
              xform: fetch_1._userResponse
            });
          }
          return await this._useSession(async (result) => {
            var _a, _b, _c;
            const { data, error } = result;
            if (error) {
              throw error;
            }
            if (!((_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) && !this.hasCustomAuthorizationHeader) {
              return { data: { user: null }, error: new errors_1.AuthSessionMissingError() };
            }
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/user`, {
              headers: this.headers,
              jwt: (_c = (_b = data.session) === null || _b === void 0 ? void 0 : _b.access_token) !== null && _c !== void 0 ? _c : void 0,
              xform: fetch_1._userResponse
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            if ((0, errors_1.isAuthSessionMissingError)(error)) {
              await this._removeSession();
              await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
            }
            return this._returnResult({ data: { user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Updates user data for a logged in user.
       */
      async updateUser(attributes, options = {}) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._updateUser(attributes, options);
        });
      }
      async _updateUser(attributes, options = {}) {
        try {
          return await this._useSession(async (result) => {
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              throw sessionError;
            }
            if (!sessionData.session) {
              throw new errors_1.AuthSessionMissingError();
            }
            const session = sessionData.session;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce" && attributes.email != null) {
              ;
              [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
            }
            const { data, error: userError } = await (0, fetch_1._request)(this.fetch, "PUT", `${this.url}/user`, {
              headers: this.headers,
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
              body: Object.assign(Object.assign({}, attributes), { code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
              jwt: session.access_token,
              xform: fetch_1._userResponse
            });
            if (userError) {
              throw userError;
            }
            session.user = data.user;
            await this._saveSession(session);
            await this._notifyAllSubscribers("USER_UPDATED", session);
            return this._returnResult({ data: { user: session.user }, error: null });
          });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Sets the session data from the current session. If the current session is expired, setSession will take care of refreshing it to obtain a new session.
       * If the refresh token or access token in the current session is invalid, an error will be thrown.
       * @param currentSession The current session that minimally contains an access token and refresh token.
       */
      async setSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._setSession(currentSession);
        });
      }
      async _setSession(currentSession) {
        try {
          if (!currentSession.access_token || !currentSession.refresh_token) {
            throw new errors_1.AuthSessionMissingError();
          }
          const timeNow = Date.now() / 1e3;
          let expiresAt = timeNow;
          let hasExpired = true;
          let session = null;
          const { payload } = (0, helpers_1.decodeJWT)(currentSession.access_token);
          if (payload.exp) {
            expiresAt = payload.exp;
            hasExpired = expiresAt <= timeNow;
          }
          if (hasExpired) {
            const { data: refreshedSession, error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            if (!refreshedSession) {
              return { data: { user: null, session: null }, error: null };
            }
            session = refreshedSession;
          } else {
            const { data, error } = await this._getUser(currentSession.access_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            session = {
              access_token: currentSession.access_token,
              refresh_token: currentSession.refresh_token,
              user: data.user,
              token_type: "bearer",
              expires_in: expiresAt - timeNow,
              expires_at: expiresAt
            };
            await this._saveSession(session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user: session.user, session }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { session: null, user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Returns a new session, regardless of expiry status.
       * Takes in an optional current session. If not passed in, then refreshSession() will attempt to retrieve it from getSession().
       * If the current session's refresh token is invalid, an error will be thrown.
       * @param currentSession The current session. If passed in, it must contain a refresh token.
       */
      async refreshSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._refreshSession(currentSession);
        });
      }
      async _refreshSession(currentSession) {
        try {
          return await this._useSession(async (result) => {
            var _a;
            if (!currentSession) {
              const { data, error: error2 } = result;
              if (error2) {
                throw error2;
              }
              currentSession = (_a = data.session) !== null && _a !== void 0 ? _a : void 0;
            }
            if (!(currentSession === null || currentSession === void 0 ? void 0 : currentSession.refresh_token)) {
              throw new errors_1.AuthSessionMissingError();
            }
            const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            if (!session) {
              return this._returnResult({ data: { user: null, session: null }, error: null });
            }
            return this._returnResult({ data: { user: session.user, session }, error: null });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Gets the session data from a URL string
       */
      async _getSessionFromURL(params, callbackUrlType) {
        try {
          if (!(0, helpers_1.isBrowser)())
            throw new errors_1.AuthImplicitGrantRedirectError("No browser detected.");
          if (params.error || params.error_description || params.error_code) {
            throw new errors_1.AuthImplicitGrantRedirectError(params.error_description || "Error in URL with unspecified error_description", {
              error: params.error || "unspecified_error",
              code: params.error_code || "unspecified_code"
            });
          }
          switch (callbackUrlType) {
            case "implicit":
              if (this.flowType === "pkce") {
                throw new errors_1.AuthPKCEGrantCodeExchangeError("Not a valid PKCE flow url.");
              }
              break;
            case "pkce":
              if (this.flowType === "implicit") {
                throw new errors_1.AuthImplicitGrantRedirectError("Not a valid implicit grant flow url.");
              }
              break;
            default:
          }
          if (callbackUrlType === "pkce") {
            this._debug("#_initialize()", "begin", "is PKCE flow", true);
            if (!params.code)
              throw new errors_1.AuthPKCEGrantCodeExchangeError("No code detected.");
            const { data: data2, error: error2 } = await this._exchangeCodeForSession(params.code);
            if (error2)
              throw error2;
            const url = new URL(window.location.href);
            url.searchParams.delete("code");
            window.history.replaceState(window.history.state, "", url.toString());
            return { data: { session: data2.session, redirectType: null }, error: null };
          }
          const { provider_token, provider_refresh_token, access_token, refresh_token, expires_in, expires_at, token_type } = params;
          if (!access_token || !expires_in || !refresh_token || !token_type) {
            throw new errors_1.AuthImplicitGrantRedirectError("No session defined in URL");
          }
          const timeNow = Math.round(Date.now() / 1e3);
          const expiresIn = parseInt(expires_in);
          let expiresAt = timeNow + expiresIn;
          if (expires_at) {
            expiresAt = parseInt(expires_at);
          }
          const actuallyExpiresIn = expiresAt - timeNow;
          if (actuallyExpiresIn * 1e3 <= constants_1.AUTO_REFRESH_TICK_DURATION_MS) {
            console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${actuallyExpiresIn}s, should have been closer to ${expiresIn}s`);
          }
          const issuedAt = expiresAt - expiresIn;
          if (timeNow - issuedAt >= 120) {
            console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale", issuedAt, expiresAt, timeNow);
          } else if (timeNow - issuedAt < 0) {
            console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew", issuedAt, expiresAt, timeNow);
          }
          const { data, error } = await this._getUser(access_token);
          if (error)
            throw error;
          const session = {
            provider_token,
            provider_refresh_token,
            access_token,
            expires_in: expiresIn,
            expires_at: expiresAt,
            refresh_token,
            token_type,
            user: data.user
          };
          window.location.hash = "";
          this._debug("#_getSessionFromURL()", "clearing window.location.hash");
          return this._returnResult({ data: { session, redirectType: params.type }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { session: null, redirectType: null }, error });
          }
          throw error;
        }
      }
      /**
       * Checks if the current URL contains parameters given by an implicit oauth grant flow (https://www.rfc-editor.org/rfc/rfc6749.html#section-4.2)
       *
       * If `detectSessionInUrl` is a function, it will be called with the URL and params to determine
       * if the URL should be processed as a Supabase auth callback. This allows users to exclude
       * URLs from other OAuth providers (e.g., Facebook Login) that also return access_token in the fragment.
       */
      _isImplicitGrantCallback(params) {
        if (typeof this.detectSessionInUrl === "function") {
          return this.detectSessionInUrl(new URL(window.location.href), params);
        }
        return Boolean(params.access_token || params.error_description);
      }
      /**
       * Checks if the current URL and backing storage contain parameters given by a PKCE flow
       */
      async _isPKCECallback(params) {
        const currentStorageContent = await (0, helpers_1.getItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
        return !!(params.code && currentStorageContent);
      }
      /**
       * Inside a browser context, `signOut()` will remove the logged in user from the browser session and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.
       *
       * For server-side management, you can revoke all refresh tokens for a user by passing a user's JWT through to `auth.api.signOut(JWT: string)`.
       * There is no way to revoke a user's access token jwt until it expires. It is recommended to set a shorter expiry on the jwt for this reason.
       *
       * If using `others` scope, no `SIGNED_OUT` event is fired!
       */
      async signOut(options = { scope: "global" }) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._signOut(options);
        });
      }
      async _signOut({ scope } = { scope: "global" }) {
        return await this._useSession(async (result) => {
          var _a;
          const { data, error: sessionError } = result;
          if (sessionError && !(0, errors_1.isAuthSessionMissingError)(sessionError)) {
            return this._returnResult({ error: sessionError });
          }
          const accessToken = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token;
          if (accessToken) {
            const { error } = await this.admin.signOut(accessToken, scope);
            if (error) {
              if (!((0, errors_1.isAuthApiError)(error) && (error.status === 404 || error.status === 401 || error.status === 403) || (0, errors_1.isAuthSessionMissingError)(error))) {
                return this._returnResult({ error });
              }
            }
          }
          if (scope !== "others") {
            await this._removeSession();
            await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          }
          return this._returnResult({ error: null });
        });
      }
      onAuthStateChange(callback) {
        const id = (0, helpers_1.generateCallbackId)();
        const subscription = {
          id,
          callback,
          unsubscribe: () => {
            this._debug("#unsubscribe()", "state change callback with id removed", id);
            this.stateChangeEmitters.delete(id);
          }
        };
        this._debug("#onAuthStateChange()", "registered callback with id", id);
        this.stateChangeEmitters.set(id, subscription);
        (async () => {
          await this.initializePromise;
          await this._acquireLock(this.lockAcquireTimeout, async () => {
            this._emitInitialSession(id);
          });
        })();
        return { data: { subscription } };
      }
      async _emitInitialSession(id) {
        return await this._useSession(async (result) => {
          var _a, _b;
          try {
            const { data: { session }, error } = result;
            if (error)
              throw error;
            await ((_a = this.stateChangeEmitters.get(id)) === null || _a === void 0 ? void 0 : _a.callback("INITIAL_SESSION", session));
            this._debug("INITIAL_SESSION", "callback id", id, "session", session);
          } catch (err) {
            await ((_b = this.stateChangeEmitters.get(id)) === null || _b === void 0 ? void 0 : _b.callback("INITIAL_SESSION", null));
            this._debug("INITIAL_SESSION", "callback id", id, "error", err);
            console.error(err);
          }
        });
      }
      /**
       * Sends a password reset request to an email address. This method supports the PKCE flow.
       *
       * @param email The email address of the user.
       * @param options.redirectTo The URL to send the user to after they click the password reset link.
       * @param options.captchaToken Verification token received when the user completes the captcha on the site.
       */
      async resetPasswordForEmail(email, options = {}) {
        let codeChallenge = null;
        let codeChallengeMethod = null;
        if (this.flowType === "pkce") {
          ;
          [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(
            this.storage,
            this.storageKey,
            true
            // isPasswordRecovery
          );
        }
        try {
          return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/recover`, {
            body: {
              email,
              code_challenge: codeChallenge,
              code_challenge_method: codeChallengeMethod,
              gotrue_meta_security: { captcha_token: options.captchaToken }
            },
            headers: this.headers,
            redirectTo: options.redirectTo
          });
        } catch (error) {
          await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Gets all the identities linked to a user.
       */
      async getUserIdentities() {
        var _a;
        try {
          const { data, error } = await this.getUser();
          if (error)
            throw error;
          return this._returnResult({ data: { identities: (_a = data.user.identities) !== null && _a !== void 0 ? _a : [] }, error: null });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async linkIdentity(credentials) {
        if ("token" in credentials) {
          return this.linkIdentityIdToken(credentials);
        }
        return this.linkIdentityOAuth(credentials);
      }
      async linkIdentityOAuth(credentials) {
        var _a;
        try {
          const { data, error } = await this._useSession(async (result) => {
            var _a2, _b, _c, _d, _e;
            const { data: data2, error: error2 } = result;
            if (error2)
              throw error2;
            const url = await this._getUrlForProvider(`${this.url}/user/identities/authorize`, credentials.provider, {
              redirectTo: (_a2 = credentials.options) === null || _a2 === void 0 ? void 0 : _a2.redirectTo,
              scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
              queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
              skipBrowserRedirect: true
            });
            return await (0, fetch_1._request)(this.fetch, "GET", url, {
              headers: this.headers,
              jwt: (_e = (_d = data2.session) === null || _d === void 0 ? void 0 : _d.access_token) !== null && _e !== void 0 ? _e : void 0
            });
          });
          if (error)
            throw error;
          if ((0, helpers_1.isBrowser)() && !((_a = credentials.options) === null || _a === void 0 ? void 0 : _a.skipBrowserRedirect)) {
            window.location.assign(data === null || data === void 0 ? void 0 : data.url);
          }
          return this._returnResult({
            data: { provider: credentials.provider, url: data === null || data === void 0 ? void 0 : data.url },
            error: null
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { provider: credentials.provider, url: null }, error });
          }
          throw error;
        }
      }
      async linkIdentityIdToken(credentials) {
        return await this._useSession(async (result) => {
          var _a;
          try {
            const { error: sessionError, data: { session } } = result;
            if (sessionError)
              throw sessionError;
            const { options, provider, token, access_token, nonce } = credentials;
            const res = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
              headers: this.headers,
              jwt: (_a = session === null || session === void 0 ? void 0 : session.access_token) !== null && _a !== void 0 ? _a : void 0,
              body: {
                provider,
                id_token: token,
                access_token,
                nonce,
                link_identity: true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: fetch_1._sessionResponse
            });
            const { data, error } = res;
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            } else if (!data || !data.session || !data.user) {
              return this._returnResult({
                data: { user: null, session: null },
                error: new errors_1.AuthInvalidTokenResponseError()
              });
            }
            if (data.session) {
              await this._saveSession(data.session);
              await this._notifyAllSubscribers("USER_UPDATED", data.session);
            }
            return this._returnResult({ data, error });
          } catch (error) {
            await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            throw error;
          }
        });
      }
      /**
       * Unlinks an identity from a user by deleting it. The user will no longer be able to sign in with that identity once it's unlinked.
       */
      async unlinkIdentity(identity) {
        try {
          return await this._useSession(async (result) => {
            var _a, _b;
            const { data, error } = result;
            if (error) {
              throw error;
            }
            return await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/user/identities/${identity.identity_id}`, {
              headers: this.headers,
              jwt: (_b = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) !== null && _b !== void 0 ? _b : void 0
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Generates a new JWT.
       * @param refreshToken A valid refresh token that was returned on login.
       */
      async _refreshAccessToken(refreshToken) {
        const debugName = `#_refreshAccessToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, "begin");
        try {
          const startedAt = Date.now();
          return await (0, helpers_1.retryable)(async (attempt) => {
            if (attempt > 0) {
              await (0, helpers_1.sleep)(200 * Math.pow(2, attempt - 1));
            }
            this._debug(debugName, "refreshing attempt", attempt);
            return await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/token?grant_type=refresh_token`, {
              body: { refresh_token: refreshToken },
              headers: this.headers,
              xform: fetch_1._sessionResponse
            });
          }, (attempt, error) => {
            const nextBackOffInterval = 200 * Math.pow(2, attempt);
            return error && (0, errors_1.isAuthRetryableFetchError)(error) && // retryable only if the request can be sent before the backoff overflows the tick duration
            Date.now() + nextBackOffInterval - startedAt < constants_1.AUTO_REFRESH_TICK_DURATION_MS;
          });
        } catch (error) {
          this._debug(debugName, "error", error);
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: { session: null, user: null }, error });
          }
          throw error;
        } finally {
          this._debug(debugName, "end");
        }
      }
      _isValidSession(maybeSession) {
        const isValidSession = typeof maybeSession === "object" && maybeSession !== null && "access_token" in maybeSession && "refresh_token" in maybeSession && "expires_at" in maybeSession;
        return isValidSession;
      }
      async _handleProviderSignIn(provider, options) {
        const url = await this._getUrlForProvider(`${this.url}/authorize`, provider, {
          redirectTo: options.redirectTo,
          scopes: options.scopes,
          queryParams: options.queryParams
        });
        this._debug("#_handleProviderSignIn()", "provider", provider, "options", options, "url", url);
        if ((0, helpers_1.isBrowser)() && !options.skipBrowserRedirect) {
          window.location.assign(url);
        }
        return { data: { provider, url }, error: null };
      }
      /**
       * Recovers the session from LocalStorage and refreshes the token
       * Note: this method is async to accommodate for AsyncStorage e.g. in React native.
       */
      async _recoverAndRefresh() {
        var _a, _b;
        const debugName = "#_recoverAndRefresh()";
        this._debug(debugName, "begin");
        try {
          const currentSession = await (0, helpers_1.getItemAsync)(this.storage, this.storageKey);
          if (currentSession && this.userStorage) {
            let maybeUser = await (0, helpers_1.getItemAsync)(this.userStorage, this.storageKey + "-user");
            if (!this.storage.isServer && Object.is(this.storage, this.userStorage) && !maybeUser) {
              maybeUser = { user: currentSession.user };
              await (0, helpers_1.setItemAsync)(this.userStorage, this.storageKey + "-user", maybeUser);
            }
            currentSession.user = (_a = maybeUser === null || maybeUser === void 0 ? void 0 : maybeUser.user) !== null && _a !== void 0 ? _a : (0, helpers_1.userNotAvailableProxy)();
          } else if (currentSession && !currentSession.user) {
            if (!currentSession.user) {
              const separateUser = await (0, helpers_1.getItemAsync)(this.storage, this.storageKey + "-user");
              if (separateUser && (separateUser === null || separateUser === void 0 ? void 0 : separateUser.user)) {
                currentSession.user = separateUser.user;
                await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey + "-user");
                await (0, helpers_1.setItemAsync)(this.storage, this.storageKey, currentSession);
              } else {
                currentSession.user = (0, helpers_1.userNotAvailableProxy)();
              }
            }
          }
          this._debug(debugName, "session from storage", currentSession);
          if (!this._isValidSession(currentSession)) {
            this._debug(debugName, "session is not valid");
            if (currentSession !== null) {
              await this._removeSession();
            }
            return;
          }
          const expiresWithMargin = ((_b = currentSession.expires_at) !== null && _b !== void 0 ? _b : Infinity) * 1e3 - Date.now() < constants_1.EXPIRY_MARGIN_MS;
          this._debug(debugName, `session has${expiresWithMargin ? "" : " not"} expired with margin of ${constants_1.EXPIRY_MARGIN_MS}s`);
          if (expiresWithMargin) {
            if (this.autoRefreshToken && currentSession.refresh_token) {
              const { error } = await this._callRefreshToken(currentSession.refresh_token);
              if (error) {
                console.error(error);
                if (!(0, errors_1.isAuthRetryableFetchError)(error)) {
                  this._debug(debugName, "refresh failed with a non-retryable error, removing the session", error);
                  await this._removeSession();
                }
              }
            }
          } else if (currentSession.user && currentSession.user.__isUserNotAvailableProxy === true) {
            try {
              const { data, error: userError } = await this._getUser(currentSession.access_token);
              if (!userError && (data === null || data === void 0 ? void 0 : data.user)) {
                currentSession.user = data.user;
                await this._saveSession(currentSession);
                await this._notifyAllSubscribers("SIGNED_IN", currentSession);
              } else {
                this._debug(debugName, "could not get user data, skipping SIGNED_IN notification");
              }
            } catch (getUserError) {
              console.error("Error getting user data:", getUserError);
              this._debug(debugName, "error getting user data, skipping SIGNED_IN notification", getUserError);
            }
          } else {
            await this._notifyAllSubscribers("SIGNED_IN", currentSession);
          }
        } catch (err) {
          this._debug(debugName, "error", err);
          console.error(err);
          return;
        } finally {
          this._debug(debugName, "end");
        }
      }
      async _callRefreshToken(refreshToken) {
        var _a, _b;
        if (!refreshToken) {
          throw new errors_1.AuthSessionMissingError();
        }
        if (this.refreshingDeferred) {
          return this.refreshingDeferred.promise;
        }
        const debugName = `#_callRefreshToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, "begin");
        try {
          this.refreshingDeferred = new helpers_1.Deferred();
          const { data, error } = await this._refreshAccessToken(refreshToken);
          if (error)
            throw error;
          if (!data.session)
            throw new errors_1.AuthSessionMissingError();
          await this._saveSession(data.session);
          await this._notifyAllSubscribers("TOKEN_REFRESHED", data.session);
          const result = { data: data.session, error: null };
          this.refreshingDeferred.resolve(result);
          return result;
        } catch (error) {
          this._debug(debugName, "error", error);
          if ((0, errors_1.isAuthError)(error)) {
            const result = { data: null, error };
            if (!(0, errors_1.isAuthRetryableFetchError)(error)) {
              await this._removeSession();
            }
            (_a = this.refreshingDeferred) === null || _a === void 0 ? void 0 : _a.resolve(result);
            return result;
          }
          (_b = this.refreshingDeferred) === null || _b === void 0 ? void 0 : _b.reject(error);
          throw error;
        } finally {
          this.refreshingDeferred = null;
          this._debug(debugName, "end");
        }
      }
      async _notifyAllSubscribers(event, session, broadcast = true) {
        const debugName = `#_notifyAllSubscribers(${event})`;
        this._debug(debugName, "begin", session, `broadcast = ${broadcast}`);
        try {
          if (this.broadcastChannel && broadcast) {
            this.broadcastChannel.postMessage({ event, session });
          }
          const errors = [];
          const promises = Array.from(this.stateChangeEmitters.values()).map(async (x) => {
            try {
              await x.callback(event, session);
            } catch (e) {
              errors.push(e);
            }
          });
          await Promise.all(promises);
          if (errors.length > 0) {
            for (let i = 0; i < errors.length; i += 1) {
              console.error(errors[i]);
            }
            throw errors[0];
          }
        } finally {
          this._debug(debugName, "end");
        }
      }
      /**
       * set currentSession and currentUser
       * process to _startAutoRefreshToken if possible
       */
      async _saveSession(session) {
        this._debug("#_saveSession()", session);
        this.suppressGetSessionWarning = true;
        await (0, helpers_1.removeItemAsync)(this.storage, `${this.storageKey}-code-verifier`);
        const sessionToProcess = Object.assign({}, session);
        const userIsProxy = sessionToProcess.user && sessionToProcess.user.__isUserNotAvailableProxy === true;
        if (this.userStorage) {
          if (!userIsProxy && sessionToProcess.user) {
            await (0, helpers_1.setItemAsync)(this.userStorage, this.storageKey + "-user", {
              user: sessionToProcess.user
            });
          } else if (userIsProxy) {
          }
          const mainSessionData = Object.assign({}, sessionToProcess);
          delete mainSessionData.user;
          const clonedMainSessionData = (0, helpers_1.deepClone)(mainSessionData);
          await (0, helpers_1.setItemAsync)(this.storage, this.storageKey, clonedMainSessionData);
        } else {
          const clonedSession = (0, helpers_1.deepClone)(sessionToProcess);
          await (0, helpers_1.setItemAsync)(this.storage, this.storageKey, clonedSession);
        }
      }
      async _removeSession() {
        this._debug("#_removeSession()");
        this.suppressGetSessionWarning = false;
        await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey);
        await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey + "-code-verifier");
        await (0, helpers_1.removeItemAsync)(this.storage, this.storageKey + "-user");
        if (this.userStorage) {
          await (0, helpers_1.removeItemAsync)(this.userStorage, this.storageKey + "-user");
        }
        await this._notifyAllSubscribers("SIGNED_OUT", null);
      }
      /**
       * Removes any registered visibilitychange callback.
       *
       * {@see #startAutoRefresh}
       * {@see #stopAutoRefresh}
       */
      _removeVisibilityChangedCallback() {
        this._debug("#_removeVisibilityChangedCallback()");
        const callback = this.visibilityChangedCallback;
        this.visibilityChangedCallback = null;
        try {
          if (callback && (0, helpers_1.isBrowser)() && (window === null || window === void 0 ? void 0 : window.removeEventListener)) {
            window.removeEventListener("visibilitychange", callback);
          }
        } catch (e) {
          console.error("removing visibilitychange callback failed", e);
        }
      }
      /**
       * This is the private implementation of {@link #startAutoRefresh}. Use this
       * within the library.
       */
      async _startAutoRefresh() {
        await this._stopAutoRefresh();
        this._debug("#_startAutoRefresh()");
        const ticker = setInterval(() => this._autoRefreshTokenTick(), constants_1.AUTO_REFRESH_TICK_DURATION_MS);
        this.autoRefreshTicker = ticker;
        if (ticker && typeof ticker === "object" && typeof ticker.unref === "function") {
          ticker.unref();
        } else if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
          Deno.unrefTimer(ticker);
        }
        const timeout = setTimeout(async () => {
          await this.initializePromise;
          await this._autoRefreshTokenTick();
        }, 0);
        this.autoRefreshTickTimeout = timeout;
        if (timeout && typeof timeout === "object" && typeof timeout.unref === "function") {
          timeout.unref();
        } else if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
          Deno.unrefTimer(timeout);
        }
      }
      /**
       * This is the private implementation of {@link #stopAutoRefresh}. Use this
       * within the library.
       */
      async _stopAutoRefresh() {
        this._debug("#_stopAutoRefresh()");
        const ticker = this.autoRefreshTicker;
        this.autoRefreshTicker = null;
        if (ticker) {
          clearInterval(ticker);
        }
        const timeout = this.autoRefreshTickTimeout;
        this.autoRefreshTickTimeout = null;
        if (timeout) {
          clearTimeout(timeout);
        }
      }
      /**
       * Starts an auto-refresh process in the background. The session is checked
       * every few seconds. Close to the time of expiration a process is started to
       * refresh the session. If refreshing fails it will be retried for as long as
       * necessary.
       *
       * If you set the {@link GoTrueClientOptions#autoRefreshToken} you don't need
       * to call this function, it will be called for you.
       *
       * On browsers the refresh process works only when the tab/window is in the
       * foreground to conserve resources as well as prevent race conditions and
       * flooding auth with requests. If you call this method any managed
       * visibility change callback will be removed and you must manage visibility
       * changes on your own.
       *
       * On non-browser platforms the refresh process works *continuously* in the
       * background, which may not be desirable. You should hook into your
       * platform's foreground indication mechanism and call these methods
       * appropriately to conserve resources.
       *
       * {@see #stopAutoRefresh}
       */
      async startAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._startAutoRefresh();
      }
      /**
       * Stops an active auto refresh process running in the background (if any).
       *
       * If you call this method any managed visibility change callback will be
       * removed and you must manage visibility changes on your own.
       *
       * See {@link #startAutoRefresh} for more details.
       */
      async stopAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._stopAutoRefresh();
      }
      /**
       * Runs the auto refresh token tick.
       */
      async _autoRefreshTokenTick() {
        this._debug("#_autoRefreshTokenTick()", "begin");
        try {
          await this._acquireLock(0, async () => {
            try {
              const now = Date.now();
              try {
                return await this._useSession(async (result) => {
                  const { data: { session } } = result;
                  if (!session || !session.refresh_token || !session.expires_at) {
                    this._debug("#_autoRefreshTokenTick()", "no session");
                    return;
                  }
                  const expiresInTicks = Math.floor((session.expires_at * 1e3 - now) / constants_1.AUTO_REFRESH_TICK_DURATION_MS);
                  this._debug("#_autoRefreshTokenTick()", `access token expires in ${expiresInTicks} ticks, a tick lasts ${constants_1.AUTO_REFRESH_TICK_DURATION_MS}ms, refresh threshold is ${constants_1.AUTO_REFRESH_TICK_THRESHOLD} ticks`);
                  if (expiresInTicks <= constants_1.AUTO_REFRESH_TICK_THRESHOLD) {
                    await this._callRefreshToken(session.refresh_token);
                  }
                });
              } catch (e) {
                console.error("Auto refresh tick failed with error. This is likely a transient error.", e);
              }
            } finally {
              this._debug("#_autoRefreshTokenTick()", "end");
            }
          });
        } catch (e) {
          if (e.isAcquireTimeout || e instanceof locks_1.LockAcquireTimeoutError) {
            this._debug("auto refresh token tick lock not available");
          } else {
            throw e;
          }
        }
      }
      /**
       * Registers callbacks on the browser / platform, which in-turn run
       * algorithms when the browser window/tab are in foreground. On non-browser
       * platforms it assumes always foreground.
       */
      async _handleVisibilityChange() {
        this._debug("#_handleVisibilityChange()");
        if (!(0, helpers_1.isBrowser)() || !(window === null || window === void 0 ? void 0 : window.addEventListener)) {
          if (this.autoRefreshToken) {
            this.startAutoRefresh();
          }
          return false;
        }
        try {
          this.visibilityChangedCallback = async () => {
            try {
              await this._onVisibilityChanged(false);
            } catch (error) {
              this._debug("#visibilityChangedCallback", "error", error);
            }
          };
          window === null || window === void 0 ? void 0 : window.addEventListener("visibilitychange", this.visibilityChangedCallback);
          await this._onVisibilityChanged(true);
        } catch (error) {
          console.error("_handleVisibilityChange", error);
        }
      }
      /**
       * Callback registered with `window.addEventListener('visibilitychange')`.
       */
      async _onVisibilityChanged(calledFromInitialize) {
        const methodName = `#_onVisibilityChanged(${calledFromInitialize})`;
        this._debug(methodName, "visibilityState", document.visibilityState);
        if (document.visibilityState === "visible") {
          if (this.autoRefreshToken) {
            this._startAutoRefresh();
          }
          if (!calledFromInitialize) {
            await this.initializePromise;
            await this._acquireLock(this.lockAcquireTimeout, async () => {
              if (document.visibilityState !== "visible") {
                this._debug(methodName, "acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting");
                return;
              }
              await this._recoverAndRefresh();
            });
          }
        } else if (document.visibilityState === "hidden") {
          if (this.autoRefreshToken) {
            this._stopAutoRefresh();
          }
        }
      }
      /**
       * Generates the relevant login URL for a third-party provider.
       * @param options.redirectTo A URL or mobile address to send the user to after they are confirmed.
       * @param options.scopes A space-separated list of scopes granted to the OAuth application.
       * @param options.queryParams An object of key-value pairs containing query parameters granted to the OAuth application.
       */
      async _getUrlForProvider(url, provider, options) {
        const urlParams = [`provider=${encodeURIComponent(provider)}`];
        if (options === null || options === void 0 ? void 0 : options.redirectTo) {
          urlParams.push(`redirect_to=${encodeURIComponent(options.redirectTo)}`);
        }
        if (options === null || options === void 0 ? void 0 : options.scopes) {
          urlParams.push(`scopes=${encodeURIComponent(options.scopes)}`);
        }
        if (this.flowType === "pkce") {
          const [codeChallenge, codeChallengeMethod] = await (0, helpers_1.getCodeChallengeAndMethod)(this.storage, this.storageKey);
          const flowParams = new URLSearchParams({
            code_challenge: `${encodeURIComponent(codeChallenge)}`,
            code_challenge_method: `${encodeURIComponent(codeChallengeMethod)}`
          });
          urlParams.push(flowParams.toString());
        }
        if (options === null || options === void 0 ? void 0 : options.queryParams) {
          const query = new URLSearchParams(options.queryParams);
          urlParams.push(query.toString());
        }
        if (options === null || options === void 0 ? void 0 : options.skipBrowserRedirect) {
          urlParams.push(`skip_http_redirect=${options.skipBrowserRedirect}`);
        }
        return `${url}?${urlParams.join("&")}`;
      }
      async _unenroll(params) {
        try {
          return await this._useSession(async (result) => {
            var _a;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            return await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/factors/${params.factorId}`, {
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async _enroll(params) {
        try {
          return await this._useSession(async (result) => {
            var _a, _b;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            const body = Object.assign({ friendly_name: params.friendlyName, factor_type: params.factorType }, params.factorType === "phone" ? { phone: params.phone } : params.factorType === "totp" ? { issuer: params.issuer } : {});
            const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/factors`, {
              body,
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
            if (error) {
              return this._returnResult({ data: null, error });
            }
            if (params.factorType === "totp" && data.type === "totp" && ((_b = data === null || data === void 0 ? void 0 : data.totp) === null || _b === void 0 ? void 0 : _b.qr_code)) {
              data.totp.qr_code = `data:image/svg+xml;utf-8,${data.totp.qr_code}`;
            }
            return this._returnResult({ data, error: null });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async _verify(params) {
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          try {
            return await this._useSession(async (result) => {
              var _a;
              const { data: sessionData, error: sessionError } = result;
              if (sessionError) {
                return this._returnResult({ data: null, error: sessionError });
              }
              const body = Object.assign({ challenge_id: params.challengeId }, "webauthn" in params ? {
                webauthn: Object.assign(Object.assign({}, params.webauthn), { credential_response: params.webauthn.type === "create" ? (0, webauthn_1.serializeCredentialCreationResponse)(params.webauthn.credential_response) : (0, webauthn_1.serializeCredentialRequestResponse)(params.webauthn.credential_response) })
              } : { code: params.code });
              const { data, error } = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/factors/${params.factorId}/verify`, {
                body,
                headers: this.headers,
                jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
              });
              if (error) {
                return this._returnResult({ data: null, error });
              }
              await this._saveSession(Object.assign({ expires_at: Math.round(Date.now() / 1e3) + data.expires_in }, data));
              await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", data);
              return this._returnResult({ data, error });
            });
          } catch (error) {
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        });
      }
      async _challenge(params) {
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          try {
            return await this._useSession(async (result) => {
              var _a;
              const { data: sessionData, error: sessionError } = result;
              if (sessionError) {
                return this._returnResult({ data: null, error: sessionError });
              }
              const response = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/factors/${params.factorId}/challenge`, {
                body: params,
                headers: this.headers,
                jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
              });
              if (response.error) {
                return response;
              }
              const { data } = response;
              if (data.type !== "webauthn") {
                return { data, error: null };
              }
              switch (data.webauthn.type) {
                case "create":
                  return {
                    data: Object.assign(Object.assign({}, data), { webauthn: Object.assign(Object.assign({}, data.webauthn), { credential_options: Object.assign(Object.assign({}, data.webauthn.credential_options), { publicKey: (0, webauthn_1.deserializeCredentialCreationOptions)(data.webauthn.credential_options.publicKey) }) }) }),
                    error: null
                  };
                case "request":
                  return {
                    data: Object.assign(Object.assign({}, data), { webauthn: Object.assign(Object.assign({}, data.webauthn), { credential_options: Object.assign(Object.assign({}, data.webauthn.credential_options), { publicKey: (0, webauthn_1.deserializeCredentialRequestOptions)(data.webauthn.credential_options.publicKey) }) }) }),
                    error: null
                  };
              }
            });
          } catch (error) {
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        });
      }
      /**
       * {@see GoTrueMFAApi#challengeAndVerify}
       */
      async _challengeAndVerify(params) {
        const { data: challengeData, error: challengeError } = await this._challenge({
          factorId: params.factorId
        });
        if (challengeError) {
          return this._returnResult({ data: null, error: challengeError });
        }
        return await this._verify({
          factorId: params.factorId,
          challengeId: challengeData.id,
          code: params.code
        });
      }
      /**
       * {@see GoTrueMFAApi#listFactors}
       */
      async _listFactors() {
        var _a;
        const { data: { user }, error: userError } = await this.getUser();
        if (userError) {
          return { data: null, error: userError };
        }
        const data = {
          all: [],
          phone: [],
          totp: [],
          webauthn: []
        };
        for (const factor of (_a = user === null || user === void 0 ? void 0 : user.factors) !== null && _a !== void 0 ? _a : []) {
          data.all.push(factor);
          if (factor.status === "verified") {
            ;
            data[factor.factor_type].push(factor);
          }
        }
        return {
          data,
          error: null
        };
      }
      /**
       * {@see GoTrueMFAApi#getAuthenticatorAssuranceLevel}
       */
      async _getAuthenticatorAssuranceLevel(jwt) {
        var _a, _b, _c, _d;
        if (jwt) {
          try {
            const { payload: payload2 } = (0, helpers_1.decodeJWT)(jwt);
            let currentLevel2 = null;
            if (payload2.aal) {
              currentLevel2 = payload2.aal;
            }
            let nextLevel2 = currentLevel2;
            const { data: { user }, error: userError } = await this.getUser(jwt);
            if (userError) {
              return this._returnResult({ data: null, error: userError });
            }
            const verifiedFactors2 = (_b = (_a = user === null || user === void 0 ? void 0 : user.factors) === null || _a === void 0 ? void 0 : _a.filter((factor) => factor.status === "verified")) !== null && _b !== void 0 ? _b : [];
            if (verifiedFactors2.length > 0) {
              nextLevel2 = "aal2";
            }
            const currentAuthenticationMethods2 = payload2.amr || [];
            return { data: { currentLevel: currentLevel2, nextLevel: nextLevel2, currentAuthenticationMethods: currentAuthenticationMethods2 }, error: null };
          } catch (error) {
            if ((0, errors_1.isAuthError)(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        }
        const { data: { session }, error: sessionError } = await this.getSession();
        if (sessionError) {
          return this._returnResult({ data: null, error: sessionError });
        }
        if (!session) {
          return {
            data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
            error: null
          };
        }
        const { payload } = (0, helpers_1.decodeJWT)(session.access_token);
        let currentLevel = null;
        if (payload.aal) {
          currentLevel = payload.aal;
        }
        let nextLevel = currentLevel;
        const verifiedFactors = (_d = (_c = session.user.factors) === null || _c === void 0 ? void 0 : _c.filter((factor) => factor.status === "verified")) !== null && _d !== void 0 ? _d : [];
        if (verifiedFactors.length > 0) {
          nextLevel = "aal2";
        }
        const currentAuthenticationMethods = payload.amr || [];
        return { data: { currentLevel, nextLevel, currentAuthenticationMethods }, error: null };
      }
      /**
       * Retrieves details about an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * Returns authorization details including client info, scopes, and user information.
       * If the response includes only a redirect_url field, it means consent was already given - the caller
       * should handle the redirect manually if needed.
       */
      async _getAuthorizationDetails(authorizationId) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/oauth/authorizations/${authorizationId}`, {
              headers: this.headers,
              jwt: session.access_token,
              xform: (data) => ({ data, error: null })
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Approves an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _approveAuthorization(authorizationId, options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            const response = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/oauth/authorizations/${authorizationId}/consent`, {
              headers: this.headers,
              jwt: session.access_token,
              body: { action: "approve" },
              xform: (data) => ({ data, error: null })
            });
            if (response.data && response.data.redirect_url) {
              if ((0, helpers_1.isBrowser)() && !(options === null || options === void 0 ? void 0 : options.skipBrowserRedirect)) {
                window.location.assign(response.data.redirect_url);
              }
            }
            return response;
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Denies an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _denyAuthorization(authorizationId, options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            const response = await (0, fetch_1._request)(this.fetch, "POST", `${this.url}/oauth/authorizations/${authorizationId}/consent`, {
              headers: this.headers,
              jwt: session.access_token,
              body: { action: "deny" },
              xform: (data) => ({ data, error: null })
            });
            if (response.data && response.data.redirect_url) {
              if ((0, helpers_1.isBrowser)() && !(options === null || options === void 0 ? void 0 : options.skipBrowserRedirect)) {
                window.location.assign(response.data.redirect_url);
              }
            }
            return response;
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Lists all OAuth grants that the authenticated user has authorized.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _listOAuthGrants() {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            return await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/user/oauth/grants`, {
              headers: this.headers,
              jwt: session.access_token,
              xform: (data) => ({ data, error: null })
            });
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Revokes a user's OAuth grant for a specific client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _revokeOAuthGrant(options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new errors_1.AuthSessionMissingError() });
            }
            await (0, fetch_1._request)(this.fetch, "DELETE", `${this.url}/user/oauth/grants`, {
              headers: this.headers,
              jwt: session.access_token,
              query: { client_id: options.clientId },
              noResolveJson: true
            });
            return { data: {}, error: null };
          });
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async fetchJwk(kid, jwks = { keys: [] }) {
        let jwk = jwks.keys.find((key) => key.kid === kid);
        if (jwk) {
          return jwk;
        }
        const now = Date.now();
        jwk = this.jwks.keys.find((key) => key.kid === kid);
        if (jwk && this.jwks_cached_at + constants_1.JWKS_TTL > now) {
          return jwk;
        }
        const { data, error } = await (0, fetch_1._request)(this.fetch, "GET", `${this.url}/.well-known/jwks.json`, {
          headers: this.headers
        });
        if (error) {
          throw error;
        }
        if (!data.keys || data.keys.length === 0) {
          return null;
        }
        this.jwks = data;
        this.jwks_cached_at = now;
        jwk = data.keys.find((key) => key.kid === kid);
        if (!jwk) {
          return null;
        }
        return jwk;
      }
      /**
       * Extracts the JWT claims present in the access token by first verifying the
       * JWT against the server's JSON Web Key Set endpoint
       * `/.well-known/jwks.json` which is often cached, resulting in significantly
       * faster responses. Prefer this method over {@link #getUser} which always
       * sends a request to the Auth server for each JWT.
       *
       * If the project is not using an asymmetric JWT signing key (like ECC or
       * RSA) it always sends a request to the Auth server (similar to {@link
       * #getUser}) to verify the JWT.
       *
       * @param jwt An optional specific JWT you wish to verify, not the one you
       *            can obtain from {@link #getSession}.
       * @param options Various additional options that allow you to customize the
       *                behavior of this method.
       */
      async getClaims(jwt, options = {}) {
        try {
          let token = jwt;
          if (!token) {
            const { data, error } = await this.getSession();
            if (error || !data.session) {
              return this._returnResult({ data: null, error });
            }
            token = data.session.access_token;
          }
          const { header, payload, signature, raw: { header: rawHeader, payload: rawPayload } } = (0, helpers_1.decodeJWT)(token);
          if (!(options === null || options === void 0 ? void 0 : options.allowExpired)) {
            (0, helpers_1.validateExp)(payload.exp);
          }
          const signingKey = !header.alg || header.alg.startsWith("HS") || !header.kid || !("crypto" in globalThis && "subtle" in globalThis.crypto) ? null : await this.fetchJwk(header.kid, (options === null || options === void 0 ? void 0 : options.keys) ? { keys: options.keys } : options === null || options === void 0 ? void 0 : options.jwks);
          if (!signingKey) {
            const { error } = await this.getUser(token);
            if (error) {
              throw error;
            }
            return {
              data: {
                claims: payload,
                header,
                signature
              },
              error: null
            };
          }
          const algorithm = (0, helpers_1.getAlgorithm)(header.alg);
          const publicKey = await crypto.subtle.importKey("jwk", signingKey, algorithm, true, [
            "verify"
          ]);
          const isValid = await crypto.subtle.verify(algorithm, publicKey, signature, (0, base64url_1.stringToUint8Array)(`${rawHeader}.${rawPayload}`));
          if (!isValid) {
            throw new errors_1.AuthInvalidJwtError("Invalid JWT signature");
          }
          return {
            data: {
              claims: payload,
              header,
              signature
            },
            error: null
          };
        } catch (error) {
          if ((0, errors_1.isAuthError)(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
    };
    GoTrueClient.nextInstanceID = {};
    exports2.default = GoTrueClient;
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/AuthAdminApi.js
var require_AuthAdminApi = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/AuthAdminApi.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueAdminApi_1 = tslib_1.__importDefault(require_GoTrueAdminApi());
    var AuthAdminApi = GoTrueAdminApi_1.default;
    exports2.default = AuthAdminApi;
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/AuthClient.js
var require_AuthClient = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/AuthClient.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueClient_1 = tslib_1.__importDefault(require_GoTrueClient());
    var AuthClient = GoTrueClient_1.default;
    exports2.default = AuthClient;
  }
});

// netlify/functions/node_modules/@supabase/auth-js/dist/main/index.js
var require_main3 = __commonJS({
  "netlify/functions/node_modules/@supabase/auth-js/dist/main/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.processLock = exports2.lockInternals = exports2.NavigatorLockAcquireTimeoutError = exports2.navigatorLock = exports2.AuthClient = exports2.AuthAdminApi = exports2.GoTrueClient = exports2.GoTrueAdminApi = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var GoTrueAdminApi_1 = tslib_1.__importDefault(require_GoTrueAdminApi());
    exports2.GoTrueAdminApi = GoTrueAdminApi_1.default;
    var GoTrueClient_1 = tslib_1.__importDefault(require_GoTrueClient());
    exports2.GoTrueClient = GoTrueClient_1.default;
    var AuthAdminApi_1 = tslib_1.__importDefault(require_AuthAdminApi());
    exports2.AuthAdminApi = AuthAdminApi_1.default;
    var AuthClient_1 = tslib_1.__importDefault(require_AuthClient());
    exports2.AuthClient = AuthClient_1.default;
    tslib_1.__exportStar(require_types2(), exports2);
    tslib_1.__exportStar(require_errors(), exports2);
    var locks_1 = require_locks();
    Object.defineProperty(exports2, "navigatorLock", { enumerable: true, get: function() {
      return locks_1.navigatorLock;
    } });
    Object.defineProperty(exports2, "NavigatorLockAcquireTimeoutError", { enumerable: true, get: function() {
      return locks_1.NavigatorLockAcquireTimeoutError;
    } });
    Object.defineProperty(exports2, "lockInternals", { enumerable: true, get: function() {
      return locks_1.internals;
    } });
    Object.defineProperty(exports2, "processLock", { enumerable: true, get: function() {
      return locks_1.processLock;
    } });
  }
});

// netlify/functions/node_modules/@supabase/supabase-js/dist/index.cjs
var require_dist4 = __commonJS({
  "netlify/functions/node_modules/@supabase/supabase-js/dist/index.cjs"(exports2) {
    var __supabase_functions_js = require_main();
    var __supabase_postgrest_js = require_dist();
    var __supabase_realtime_js = require_main2();
    var __supabase_storage_js = require_dist3();
    var __supabase_auth_js = require_main3();
    var version = "2.95.3";
    var JS_ENV = "";
    if (typeof Deno !== "undefined") JS_ENV = "deno";
    else if (typeof document !== "undefined") JS_ENV = "web";
    else if (typeof navigator !== "undefined" && navigator.product === "ReactNative") JS_ENV = "react-native";
    else JS_ENV = "node";
    var DEFAULT_HEADERS = { "X-Client-Info": `supabase-js-${JS_ENV}/${version}` };
    var DEFAULT_GLOBAL_OPTIONS = { headers: DEFAULT_HEADERS };
    var DEFAULT_DB_OPTIONS = { schema: "public" };
    var DEFAULT_AUTH_OPTIONS = {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "implicit"
    };
    var DEFAULT_REALTIME_OPTIONS = {};
    function _typeof(o) {
      "@babel/helpers - typeof";
      return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
        return typeof o$1;
      } : function(o$1) {
        return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
      }, _typeof(o);
    }
    function toPrimitive(t, r) {
      if ("object" != _typeof(t) || !t) return t;
      var e = t[Symbol.toPrimitive];
      if (void 0 !== e) {
        var i = e.call(t, r || "default");
        if ("object" != _typeof(i)) return i;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return ("string" === r ? String : Number)(t);
    }
    function toPropertyKey(t) {
      var i = toPrimitive(t, "string");
      return "symbol" == _typeof(i) ? i : i + "";
    }
    function _defineProperty(e, r, t) {
      return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
        value: t,
        enumerable: true,
        configurable: true,
        writable: true
      }) : e[r] = t, e;
    }
    function ownKeys2(e, r) {
      var t = Object.keys(e);
      if (Object.getOwnPropertySymbols) {
        var o = Object.getOwnPropertySymbols(e);
        r && (o = o.filter(function(r$1) {
          return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
        })), t.push.apply(t, o);
      }
      return t;
    }
    function _objectSpread2(e) {
      for (var r = 1; r < arguments.length; r++) {
        var t = null != arguments[r] ? arguments[r] : {};
        r % 2 ? ownKeys2(Object(t), true).forEach(function(r$1) {
          _defineProperty(e, r$1, t[r$1]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys2(Object(t)).forEach(function(r$1) {
          Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
        });
      }
      return e;
    }
    var resolveFetch = (customFetch) => {
      if (customFetch) return (...args) => customFetch(...args);
      return (...args) => fetch(...args);
    };
    var resolveHeadersConstructor = () => {
      return Headers;
    };
    var fetchWithAuth = (supabaseKey, getAccessToken, customFetch) => {
      const fetch$1 = resolveFetch(customFetch);
      const HeadersConstructor = resolveHeadersConstructor();
      return async (input, init) => {
        var _await$getAccessToken;
        const accessToken = (_await$getAccessToken = await getAccessToken()) !== null && _await$getAccessToken !== void 0 ? _await$getAccessToken : supabaseKey;
        let headers = new HeadersConstructor(init === null || init === void 0 ? void 0 : init.headers);
        if (!headers.has("apikey")) headers.set("apikey", supabaseKey);
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${accessToken}`);
        return fetch$1(input, _objectSpread2(_objectSpread2({}, init), {}, { headers }));
      };
    };
    function ensureTrailingSlash(url) {
      return url.endsWith("/") ? url : url + "/";
    }
    function applySettingDefaults(options, defaults) {
      var _DEFAULT_GLOBAL_OPTIO, _globalOptions$header;
      const { db: dbOptions, auth: authOptions, realtime: realtimeOptions, global: globalOptions } = options;
      const { db: DEFAULT_DB_OPTIONS$1, auth: DEFAULT_AUTH_OPTIONS$1, realtime: DEFAULT_REALTIME_OPTIONS$1, global: DEFAULT_GLOBAL_OPTIONS$1 } = defaults;
      const result = {
        db: _objectSpread2(_objectSpread2({}, DEFAULT_DB_OPTIONS$1), dbOptions),
        auth: _objectSpread2(_objectSpread2({}, DEFAULT_AUTH_OPTIONS$1), authOptions),
        realtime: _objectSpread2(_objectSpread2({}, DEFAULT_REALTIME_OPTIONS$1), realtimeOptions),
        storage: {},
        global: _objectSpread2(_objectSpread2(_objectSpread2({}, DEFAULT_GLOBAL_OPTIONS$1), globalOptions), {}, { headers: _objectSpread2(_objectSpread2({}, (_DEFAULT_GLOBAL_OPTIO = DEFAULT_GLOBAL_OPTIONS$1 === null || DEFAULT_GLOBAL_OPTIONS$1 === void 0 ? void 0 : DEFAULT_GLOBAL_OPTIONS$1.headers) !== null && _DEFAULT_GLOBAL_OPTIO !== void 0 ? _DEFAULT_GLOBAL_OPTIO : {}), (_globalOptions$header = globalOptions === null || globalOptions === void 0 ? void 0 : globalOptions.headers) !== null && _globalOptions$header !== void 0 ? _globalOptions$header : {}) }),
        accessToken: async () => ""
      };
      if (options.accessToken) result.accessToken = options.accessToken;
      else delete result.accessToken;
      return result;
    }
    function validateSupabaseUrl(supabaseUrl) {
      const trimmedUrl = supabaseUrl === null || supabaseUrl === void 0 ? void 0 : supabaseUrl.trim();
      if (!trimmedUrl) throw new Error("supabaseUrl is required.");
      if (!trimmedUrl.match(/^https?:\/\//i)) throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
      try {
        return new URL(ensureTrailingSlash(trimmedUrl));
      } catch (_unused) {
        throw Error("Invalid supabaseUrl: Provided URL is malformed.");
      }
    }
    var SupabaseAuthClient = class extends __supabase_auth_js.AuthClient {
      constructor(options) {
        super(options);
      }
    };
    var SupabaseClient = class {
      /**
      * Create a new client for use in the browser.
      * @param supabaseUrl The unique Supabase URL which is supplied when you create a new project in your project dashboard.
      * @param supabaseKey The unique Supabase Key which is supplied when you create a new project in your project dashboard.
      * @param options.db.schema You can switch in between schemas. The schema needs to be on the list of exposed schemas inside Supabase.
      * @param options.auth.autoRefreshToken Set to "true" if you want to automatically refresh the token before expiring.
      * @param options.auth.persistSession Set to "true" if you want to automatically save the user session into local storage.
      * @param options.auth.detectSessionInUrl Set to "true" if you want to automatically detects OAuth grants in the URL and signs in the user.
      * @param options.realtime Options passed along to realtime-js constructor.
      * @param options.storage Options passed along to the storage-js constructor.
      * @param options.global.fetch A custom fetch implementation.
      * @param options.global.headers Any additional headers to send with each network request.
      * @example
      * ```ts
      * import { createClient } from '@supabase/supabase-js'
      *
      * const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')
      * const { data } = await supabase.from('profiles').select('*')
      * ```
      */
      constructor(supabaseUrl, supabaseKey, options) {
        var _settings$auth$storag, _settings$global$head;
        this.supabaseUrl = supabaseUrl;
        this.supabaseKey = supabaseKey;
        const baseUrl = validateSupabaseUrl(supabaseUrl);
        if (!supabaseKey) throw new Error("supabaseKey is required.");
        this.realtimeUrl = new URL("realtime/v1", baseUrl);
        this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws");
        this.authUrl = new URL("auth/v1", baseUrl);
        this.storageUrl = new URL("storage/v1", baseUrl);
        this.functionsUrl = new URL("functions/v1", baseUrl);
        const defaultStorageKey = `sb-${baseUrl.hostname.split(".")[0]}-auth-token`;
        const DEFAULTS = {
          db: DEFAULT_DB_OPTIONS,
          realtime: DEFAULT_REALTIME_OPTIONS,
          auth: _objectSpread2(_objectSpread2({}, DEFAULT_AUTH_OPTIONS), {}, { storageKey: defaultStorageKey }),
          global: DEFAULT_GLOBAL_OPTIONS
        };
        const settings = applySettingDefaults(options !== null && options !== void 0 ? options : {}, DEFAULTS);
        this.storageKey = (_settings$auth$storag = settings.auth.storageKey) !== null && _settings$auth$storag !== void 0 ? _settings$auth$storag : "";
        this.headers = (_settings$global$head = settings.global.headers) !== null && _settings$global$head !== void 0 ? _settings$global$head : {};
        if (!settings.accessToken) {
          var _settings$auth;
          this.auth = this._initSupabaseAuthClient((_settings$auth = settings.auth) !== null && _settings$auth !== void 0 ? _settings$auth : {}, this.headers, settings.global.fetch);
        } else {
          this.accessToken = settings.accessToken;
          this.auth = new Proxy({}, { get: (_, prop) => {
            throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(prop)} is not possible`);
          } });
        }
        this.fetch = fetchWithAuth(supabaseKey, this._getAccessToken.bind(this), settings.global.fetch);
        this.realtime = this._initRealtimeClient(_objectSpread2({
          headers: this.headers,
          accessToken: this._getAccessToken.bind(this)
        }, settings.realtime));
        if (this.accessToken) Promise.resolve(this.accessToken()).then((token) => this.realtime.setAuth(token)).catch((e) => console.warn("Failed to set initial Realtime auth token:", e));
        this.rest = new __supabase_postgrest_js.PostgrestClient(new URL("rest/v1", baseUrl).href, {
          headers: this.headers,
          schema: settings.db.schema,
          fetch: this.fetch,
          timeout: settings.db.timeout,
          urlLengthLimit: settings.db.urlLengthLimit
        });
        this.storage = new __supabase_storage_js.StorageClient(this.storageUrl.href, this.headers, this.fetch, options === null || options === void 0 ? void 0 : options.storage);
        if (!settings.accessToken) this._listenForAuthEvents();
      }
      /**
      * Supabase Functions allows you to deploy and invoke edge functions.
      */
      get functions() {
        return new __supabase_functions_js.FunctionsClient(this.functionsUrl.href, {
          headers: this.headers,
          customFetch: this.fetch
        });
      }
      /**
      * Perform a query on a table or a view.
      *
      * @param relation - The table or view name to query
      */
      from(relation) {
        return this.rest.from(relation);
      }
      /**
      * Select a schema to query or perform an function (rpc) call.
      *
      * The schema needs to be on the list of exposed schemas inside Supabase.
      *
      * @param schema - The schema to query
      */
      schema(schema) {
        return this.rest.schema(schema);
      }
      /**
      * Perform a function call.
      *
      * @param fn - The function name to call
      * @param args - The arguments to pass to the function call
      * @param options - Named parameters
      * @param options.head - When set to `true`, `data` will not be returned.
      * Useful if you only need the count.
      * @param options.get - When set to `true`, the function will be called with
      * read-only access mode.
      * @param options.count - Count algorithm to use to count rows returned by the
      * function. Only applicable for [set-returning
      * functions](https://www.postgresql.org/docs/current/functions-srf.html).
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      */
      rpc(fn, args = {}, options = {
        head: false,
        get: false,
        count: void 0
      }) {
        return this.rest.rpc(fn, args, options);
      }
      /**
      * Creates a Realtime channel with Broadcast, Presence, and Postgres Changes.
      *
      * @param {string} name - The name of the Realtime channel.
      * @param {Object} opts - The options to pass to the Realtime channel.
      *
      */
      channel(name, opts = { config: {} }) {
        return this.realtime.channel(name, opts);
      }
      /**
      * Returns all Realtime channels.
      */
      getChannels() {
        return this.realtime.getChannels();
      }
      /**
      * Unsubscribes and removes Realtime channel from Realtime client.
      *
      * @param {RealtimeChannel} channel - The name of the Realtime channel.
      *
      */
      removeChannel(channel) {
        return this.realtime.removeChannel(channel);
      }
      /**
      * Unsubscribes and removes all Realtime channels from Realtime client.
      */
      removeAllChannels() {
        return this.realtime.removeAllChannels();
      }
      async _getAccessToken() {
        var _this = this;
        var _data$session$access_, _data$session;
        if (_this.accessToken) return await _this.accessToken();
        const { data } = await _this.auth.getSession();
        return (_data$session$access_ = (_data$session = data.session) === null || _data$session === void 0 ? void 0 : _data$session.access_token) !== null && _data$session$access_ !== void 0 ? _data$session$access_ : _this.supabaseKey;
      }
      _initSupabaseAuthClient({ autoRefreshToken, persistSession, detectSessionInUrl, storage, userStorage, storageKey, flowType, lock, debug, throwOnError }, headers, fetch$1) {
        const authHeaders = {
          Authorization: `Bearer ${this.supabaseKey}`,
          apikey: `${this.supabaseKey}`
        };
        return new SupabaseAuthClient({
          url: this.authUrl.href,
          headers: _objectSpread2(_objectSpread2({}, authHeaders), headers),
          storageKey,
          autoRefreshToken,
          persistSession,
          detectSessionInUrl,
          storage,
          userStorage,
          flowType,
          lock,
          debug,
          throwOnError,
          fetch: fetch$1,
          hasCustomAuthorizationHeader: Object.keys(this.headers).some((key) => key.toLowerCase() === "authorization")
        });
      }
      _initRealtimeClient(options) {
        return new __supabase_realtime_js.RealtimeClient(this.realtimeUrl.href, _objectSpread2(_objectSpread2({}, options), {}, { params: _objectSpread2(_objectSpread2({}, { apikey: this.supabaseKey }), options === null || options === void 0 ? void 0 : options.params) }));
      }
      _listenForAuthEvents() {
        return this.auth.onAuthStateChange((event, session) => {
          this._handleTokenChanged(event, "CLIENT", session === null || session === void 0 ? void 0 : session.access_token);
        });
      }
      _handleTokenChanged(event, source, token) {
        if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && this.changedAccessToken !== token) {
          this.changedAccessToken = token;
          this.realtime.setAuth(token);
        } else if (event === "SIGNED_OUT") {
          this.realtime.setAuth();
          if (source == "STORAGE") this.auth.signOut();
          this.changedAccessToken = void 0;
        }
      }
    };
    var createClient = (supabaseUrl, supabaseKey, options) => {
      return new SupabaseClient(supabaseUrl, supabaseKey, options);
    };
    function shouldShowDeprecationWarning() {
      if (typeof window !== "undefined") return false;
      const _process = globalThis["process"];
      if (!_process) return false;
      const processVersion = _process["version"];
      if (processVersion === void 0 || processVersion === null) return false;
      const versionMatch = processVersion.match(/^v(\d+)\./);
      if (!versionMatch) return false;
      return parseInt(versionMatch[1], 10) <= 18;
    }
    if (shouldShowDeprecationWarning()) console.warn("\u26A0\uFE0F  Node.js 18 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 20 or later. For more information, visit: https://github.com/orgs/supabase/discussions/37217");
    Object.defineProperty(exports2, "FunctionRegion", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionRegion;
      }
    });
    Object.defineProperty(exports2, "FunctionsError", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionsError;
      }
    });
    Object.defineProperty(exports2, "FunctionsFetchError", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionsFetchError;
      }
    });
    Object.defineProperty(exports2, "FunctionsHttpError", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionsHttpError;
      }
    });
    Object.defineProperty(exports2, "FunctionsRelayError", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionsRelayError;
      }
    });
    Object.defineProperty(exports2, "PostgrestError", {
      enumerable: true,
      get: function() {
        return __supabase_postgrest_js.PostgrestError;
      }
    });
    exports2.SupabaseClient = SupabaseClient;
    exports2.createClient = createClient;
    Object.keys(__supabase_auth_js).forEach(function(k) {
      if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports2, k)) Object.defineProperty(exports2, k, {
        enumerable: true,
        get: function() {
          return __supabase_auth_js[k];
        }
      });
    });
    Object.keys(__supabase_realtime_js).forEach(function(k) {
      if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports2, k)) Object.defineProperty(exports2, k, {
        enumerable: true,
        get: function() {
          return __supabase_realtime_js[k];
        }
      });
    });
  }
});

// netlify/functions/utils.js
var require_utils = __commonJS({
  "netlify/functions/utils.js"(exports2, module2) {
    var crypto2 = require("crypto");
    var headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json"
    };
    var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    function isValidUUID(str) {
      return UUID_REGEX.test(str);
    }
    var GUEST_TOKEN_SECRET = process.env.ADMIN_PASSWORD ? crypto2.createHash("sha256").update("mcc-guest-split-" + process.env.ADMIN_PASSWORD).digest("hex") : "mcc-guest-token-fallback-dev";
    function generateGuestToken(participantId) {
      return crypto2.createHmac("sha256", GUEST_TOKEN_SECRET).update(participantId).digest("hex").substring(0, 32);
    }
    function verifyGuestToken(participantId, token) {
      if (!token || token.length !== 32) return false;
      try {
        return crypto2.timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(generateGuestToken(participantId), "utf8"));
      } catch (e) {
        return false;
      }
    }
    function extractPathParam(eventPath) {
      var parts = eventPath.split("/");
      return parts[parts.length - 1];
    }
    function createSupabaseClient() {
      var createClient = require_dist4().createClient;
      var supabaseUrl = process.env.SUPABASE_URL;
      var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return null;
      }
      return createClient(supabaseUrl, serviceKey);
    }
    function errorResponse(statusCode, message) {
      return {
        statusCode,
        headers,
        body: JSON.stringify({ error: message })
      };
    }
    function successResponse(data) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }
    function optionsResponse() {
      return { statusCode: 200, headers, body: "" };
    }
    module2.exports = {
      headers,
      isValidUUID,
      generateGuestToken,
      verifyGuestToken,
      extractPathParam,
      createSupabaseClient,
      errorResponse,
      successResponse,
      optionsResponse
    };
  }
});

// netlify/functions/node_modules/stripe/cjs/crypto/CryptoProvider.js
var require_CryptoProvider = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/crypto/CryptoProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CryptoProviderOnlySupportsAsyncError = exports2.CryptoProvider = void 0;
    var CryptoProvider = class {
      /**
       * Computes a SHA-256 HMAC given a secret and a payload (encoded in UTF-8).
       * The output HMAC should be encoded in hexadecimal.
       *
       * Sample values for implementations:
       * - computeHMACSignature('', 'test_secret') => 'f7f9bd47fb987337b5796fdc1fdb9ba221d0d5396814bfcaf9521f43fd8927fd'
       * - computeHMACSignature('\ud83d\ude00', 'test_secret') => '837da296d05c4fe31f61d5d7ead035099d9585a5bcde87de952012a78f0b0c43
       */
      computeHMACSignature(payload, secret) {
        throw new Error("computeHMACSignature not implemented.");
      }
      /**
       * Asynchronous version of `computeHMACSignature`. Some implementations may
       * only allow support async signature computation.
       *
       * Computes a SHA-256 HMAC given a secret and a payload (encoded in UTF-8).
       * The output HMAC should be encoded in hexadecimal.
       *
       * Sample values for implementations:
       * - computeHMACSignature('', 'test_secret') => 'f7f9bd47fb987337b5796fdc1fdb9ba221d0d5396814bfcaf9521f43fd8927fd'
       * - computeHMACSignature('\ud83d\ude00', 'test_secret') => '837da296d05c4fe31f61d5d7ead035099d9585a5bcde87de952012a78f0b0c43
       */
      computeHMACSignatureAsync(payload, secret) {
        throw new Error("computeHMACSignatureAsync not implemented.");
      }
    };
    exports2.CryptoProvider = CryptoProvider;
    var CryptoProviderOnlySupportsAsyncError = class extends Error {
    };
    exports2.CryptoProviderOnlySupportsAsyncError = CryptoProviderOnlySupportsAsyncError;
  }
});

// netlify/functions/node_modules/stripe/cjs/crypto/NodeCryptoProvider.js
var require_NodeCryptoProvider = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/crypto/NodeCryptoProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NodeCryptoProvider = void 0;
    var crypto2 = require("crypto");
    var CryptoProvider_js_1 = require_CryptoProvider();
    var NodeCryptoProvider = class extends CryptoProvider_js_1.CryptoProvider {
      /** @override */
      computeHMACSignature(payload, secret) {
        return crypto2.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
      }
      /** @override */
      async computeHMACSignatureAsync(payload, secret) {
        const signature = await this.computeHMACSignature(payload, secret);
        return signature;
      }
    };
    exports2.NodeCryptoProvider = NodeCryptoProvider;
  }
});

// netlify/functions/node_modules/stripe/cjs/net/HttpClient.js
var require_HttpClient = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/net/HttpClient.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.HttpClientResponse = exports2.HttpClient = void 0;
    var HttpClient = class _HttpClient {
      /** The client name used for diagnostics. */
      getClientName() {
        throw new Error("getClientName not implemented.");
      }
      makeRequest(host, port, path, method, headers, requestData, protocol, timeout) {
        throw new Error("makeRequest not implemented.");
      }
      /** Helper to make a consistent timeout error across implementations. */
      static makeTimeoutError() {
        const timeoutErr = new TypeError(_HttpClient.TIMEOUT_ERROR_CODE);
        timeoutErr.code = _HttpClient.TIMEOUT_ERROR_CODE;
        return timeoutErr;
      }
    };
    exports2.HttpClient = HttpClient;
    HttpClient.CONNECTION_CLOSED_ERROR_CODES = ["ECONNRESET", "EPIPE"];
    HttpClient.TIMEOUT_ERROR_CODE = "ETIMEDOUT";
    var HttpClientResponse = class {
      constructor(statusCode, headers) {
        this._statusCode = statusCode;
        this._headers = headers;
      }
      getStatusCode() {
        return this._statusCode;
      }
      getHeaders() {
        return this._headers;
      }
      getRawResponse() {
        throw new Error("getRawResponse not implemented.");
      }
      toStream(streamCompleteCallback) {
        throw new Error("toStream not implemented.");
      }
      toJSON() {
        throw new Error("toJSON not implemented.");
      }
    };
    exports2.HttpClientResponse = HttpClientResponse;
  }
});

// netlify/functions/node_modules/stripe/cjs/net/NodeHttpClient.js
var require_NodeHttpClient = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/net/NodeHttpClient.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NodeHttpClientResponse = exports2.NodeHttpClient = void 0;
    var http_ = require("http");
    var https_ = require("https");
    var HttpClient_js_1 = require_HttpClient();
    var http = http_.default || http_;
    var https = https_.default || https_;
    var defaultHttpAgent = new http.Agent({ keepAlive: true });
    var defaultHttpsAgent = new https.Agent({ keepAlive: true });
    var NodeHttpClient = class extends HttpClient_js_1.HttpClient {
      constructor(agent) {
        super();
        this._agent = agent;
      }
      /** @override. */
      getClientName() {
        return "node";
      }
      makeRequest(host, port, path, method, headers, requestData, protocol, timeout) {
        const isInsecureConnection = protocol === "http";
        let agent = this._agent;
        if (!agent) {
          agent = isInsecureConnection ? defaultHttpAgent : defaultHttpsAgent;
        }
        const requestPromise = new Promise((resolve, reject) => {
          const req = (isInsecureConnection ? http : https).request({
            host,
            port,
            path,
            method,
            agent,
            headers,
            ciphers: "DEFAULT:!aNULL:!eNULL:!LOW:!EXPORT:!SSLv2:!MD5"
          });
          req.setTimeout(timeout, () => {
            req.destroy(HttpClient_js_1.HttpClient.makeTimeoutError());
          });
          req.on("response", (res) => {
            resolve(new NodeHttpClientResponse(res));
          });
          req.on("error", (error) => {
            reject(error);
          });
          req.once("socket", (socket) => {
            if (socket.connecting) {
              socket.once(isInsecureConnection ? "connect" : "secureConnect", () => {
                req.write(requestData);
                req.end();
              });
            } else {
              req.write(requestData);
              req.end();
            }
          });
        });
        return requestPromise;
      }
    };
    exports2.NodeHttpClient = NodeHttpClient;
    var NodeHttpClientResponse = class extends HttpClient_js_1.HttpClientResponse {
      constructor(res) {
        super(res.statusCode, res.headers || {});
        this._res = res;
      }
      getRawResponse() {
        return this._res;
      }
      toStream(streamCompleteCallback) {
        this._res.once("end", () => streamCompleteCallback());
        return this._res;
      }
      toJSON() {
        return new Promise((resolve, reject) => {
          let response = "";
          this._res.setEncoding("utf8");
          this._res.on("data", (chunk) => {
            response += chunk;
          });
          this._res.once("end", () => {
            try {
              resolve(JSON.parse(response));
            } catch (e) {
              reject(e);
            }
          });
        });
      }
    };
    exports2.NodeHttpClientResponse = NodeHttpClientResponse;
  }
});

// netlify/functions/node_modules/stripe/cjs/net/FetchHttpClient.js
var require_FetchHttpClient = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/net/FetchHttpClient.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FetchHttpClientResponse = exports2.FetchHttpClient = void 0;
    var HttpClient_js_1 = require_HttpClient();
    var FetchHttpClient = class _FetchHttpClient extends HttpClient_js_1.HttpClient {
      constructor(fetchFn) {
        super();
        if (!fetchFn) {
          if (!globalThis.fetch) {
            throw new Error("fetch() function not provided and is not defined in the global scope. You must provide a fetch implementation.");
          }
          fetchFn = globalThis.fetch;
        }
        if (globalThis.AbortController) {
          this._fetchFn = _FetchHttpClient.makeFetchWithAbortTimeout(fetchFn);
        } else {
          this._fetchFn = _FetchHttpClient.makeFetchWithRaceTimeout(fetchFn);
        }
      }
      static makeFetchWithRaceTimeout(fetchFn) {
        return (url, init, timeout) => {
          let pendingTimeoutId;
          const timeoutPromise = new Promise((_, reject) => {
            pendingTimeoutId = setTimeout(() => {
              pendingTimeoutId = null;
              reject(HttpClient_js_1.HttpClient.makeTimeoutError());
            }, timeout);
          });
          const fetchPromise = fetchFn(url, init);
          return Promise.race([fetchPromise, timeoutPromise]).finally(() => {
            if (pendingTimeoutId) {
              clearTimeout(pendingTimeoutId);
            }
          });
        };
      }
      static makeFetchWithAbortTimeout(fetchFn) {
        return async (url, init, timeout) => {
          const abort = new AbortController();
          let timeoutId = setTimeout(() => {
            timeoutId = null;
            abort.abort(HttpClient_js_1.HttpClient.makeTimeoutError());
          }, timeout);
          try {
            return await fetchFn(url, Object.assign(Object.assign({}, init), { signal: abort.signal }));
          } catch (err) {
            if (err.name === "AbortError") {
              throw HttpClient_js_1.HttpClient.makeTimeoutError();
            } else {
              throw err;
            }
          } finally {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
        };
      }
      /** @override. */
      getClientName() {
        return "fetch";
      }
      async makeRequest(host, port, path, method, headers, requestData, protocol, timeout) {
        const isInsecureConnection = protocol === "http";
        const url = new URL(path, `${isInsecureConnection ? "http" : "https"}://${host}`);
        url.port = port;
        const methodHasPayload = method == "POST" || method == "PUT" || method == "PATCH";
        const body = requestData || (methodHasPayload ? "" : void 0);
        const res = await this._fetchFn(url.toString(), {
          method,
          // @ts-ignore
          headers,
          // @ts-ignore
          body
        }, timeout);
        return new FetchHttpClientResponse(res);
      }
    };
    exports2.FetchHttpClient = FetchHttpClient;
    var FetchHttpClientResponse = class _FetchHttpClientResponse extends HttpClient_js_1.HttpClientResponse {
      constructor(res) {
        super(res.status, _FetchHttpClientResponse._transformHeadersToObject(res.headers));
        this._res = res;
      }
      getRawResponse() {
        return this._res;
      }
      toStream(streamCompleteCallback) {
        streamCompleteCallback();
        return this._res.body;
      }
      toJSON() {
        return this._res.json();
      }
      static _transformHeadersToObject(headers) {
        const headersObj = {};
        for (const entry of headers) {
          if (!Array.isArray(entry) || entry.length != 2) {
            throw new Error("Response objects produced by the fetch function given to FetchHttpClient do not have an iterable headers map. Response#headers should be an iterable object.");
          }
          headersObj[entry[0]] = entry[1];
        }
        return headersObj;
      }
    };
    exports2.FetchHttpClientResponse = FetchHttpClientResponse;
  }
});

// netlify/functions/node_modules/stripe/cjs/crypto/SubtleCryptoProvider.js
var require_SubtleCryptoProvider = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/crypto/SubtleCryptoProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SubtleCryptoProvider = void 0;
    var CryptoProvider_js_1 = require_CryptoProvider();
    var SubtleCryptoProvider = class extends CryptoProvider_js_1.CryptoProvider {
      constructor(subtleCrypto) {
        super();
        this.subtleCrypto = subtleCrypto || crypto.subtle;
      }
      /** @override */
      computeHMACSignature(payload, secret) {
        throw new CryptoProvider_js_1.CryptoProviderOnlySupportsAsyncError("SubtleCryptoProvider cannot be used in a synchronous context.");
      }
      /** @override */
      async computeHMACSignatureAsync(payload, secret) {
        const encoder = new TextEncoder();
        const key = await this.subtleCrypto.importKey("raw", encoder.encode(secret), {
          name: "HMAC",
          hash: { name: "SHA-256" }
        }, false, ["sign"]);
        const signatureBuffer = await this.subtleCrypto.sign("hmac", key, encoder.encode(payload));
        const signatureBytes = new Uint8Array(signatureBuffer);
        const signatureHexCodes = new Array(signatureBytes.length);
        for (let i = 0; i < signatureBytes.length; i++) {
          signatureHexCodes[i] = byteHexMapping[signatureBytes[i]];
        }
        return signatureHexCodes.join("");
      }
    };
    exports2.SubtleCryptoProvider = SubtleCryptoProvider;
    var byteHexMapping = new Array(256);
    for (let i = 0; i < byteHexMapping.length; i++) {
      byteHexMapping[i] = i.toString(16).padStart(2, "0");
    }
  }
});

// netlify/functions/node_modules/stripe/cjs/platform/PlatformFunctions.js
var require_PlatformFunctions = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/platform/PlatformFunctions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PlatformFunctions = void 0;
    var FetchHttpClient_js_1 = require_FetchHttpClient();
    var SubtleCryptoProvider_js_1 = require_SubtleCryptoProvider();
    var PlatformFunctions = class {
      constructor() {
        this._fetchFn = null;
        this._agent = null;
      }
      /**
       * Gets uname with Node's built-in `exec` function, if available.
       */
      getUname() {
        throw new Error("getUname not implemented.");
      }
      /**
       * Generates a v4 UUID. See https://stackoverflow.com/a/2117523
       */
      uuid4() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c === "x" ? r : r & 3 | 8;
          return v.toString(16);
        });
      }
      /**
       * Compares strings in constant time.
       */
      secureCompare(a, b) {
        if (a.length !== b.length) {
          return false;
        }
        const len = a.length;
        let result = 0;
        for (let i = 0; i < len; ++i) {
          result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
      }
      /**
       * Creates an event emitter.
       */
      createEmitter() {
        throw new Error("createEmitter not implemented.");
      }
      /**
       * Checks if the request data is a stream. If so, read the entire stream
       * to a buffer and return the buffer.
       */
      tryBufferData(data) {
        throw new Error("tryBufferData not implemented.");
      }
      /**
       * Creates an HTTP client which uses the Node `http` and `https` packages
       * to issue requests.
       */
      createNodeHttpClient(agent) {
        throw new Error("createNodeHttpClient not implemented.");
      }
      /**
       * Creates an HTTP client for issuing Stripe API requests which uses the Web
       * Fetch API.
       *
       * A fetch function can optionally be passed in as a parameter. If none is
       * passed, will default to the default `fetch` function in the global scope.
       */
      createFetchHttpClient(fetchFn) {
        return new FetchHttpClient_js_1.FetchHttpClient(fetchFn);
      }
      /**
       * Creates an HTTP client using runtime-specific APIs.
       */
      createDefaultHttpClient() {
        throw new Error("createDefaultHttpClient not implemented.");
      }
      /**
       * Creates a CryptoProvider which uses the Node `crypto` package for its computations.
       */
      createNodeCryptoProvider() {
        throw new Error("createNodeCryptoProvider not implemented.");
      }
      /**
       * Creates a CryptoProvider which uses the SubtleCrypto interface of the Web Crypto API.
       */
      createSubtleCryptoProvider(subtleCrypto) {
        return new SubtleCryptoProvider_js_1.SubtleCryptoProvider(subtleCrypto);
      }
      createDefaultCryptoProvider() {
        throw new Error("createDefaultCryptoProvider not implemented.");
      }
    };
    exports2.PlatformFunctions = PlatformFunctions;
  }
});

// netlify/functions/node_modules/stripe/cjs/Error.js
var require_Error = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/Error.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.StripeUnknownError = exports2.StripeInvalidGrantError = exports2.StripeIdempotencyError = exports2.StripeSignatureVerificationError = exports2.StripeConnectionError = exports2.StripeRateLimitError = exports2.StripePermissionError = exports2.StripeAuthenticationError = exports2.StripeAPIError = exports2.StripeInvalidRequestError = exports2.StripeCardError = exports2.StripeError = exports2.generate = void 0;
    var generate = (rawStripeError) => {
      switch (rawStripeError.type) {
        case "card_error":
          return new StripeCardError(rawStripeError);
        case "invalid_request_error":
          return new StripeInvalidRequestError(rawStripeError);
        case "api_error":
          return new StripeAPIError(rawStripeError);
        case "authentication_error":
          return new StripeAuthenticationError(rawStripeError);
        case "rate_limit_error":
          return new StripeRateLimitError(rawStripeError);
        case "idempotency_error":
          return new StripeIdempotencyError(rawStripeError);
        case "invalid_grant":
          return new StripeInvalidGrantError(rawStripeError);
        default:
          return new StripeUnknownError(rawStripeError);
      }
    };
    exports2.generate = generate;
    var StripeError = class extends Error {
      constructor(raw = {}, type = null) {
        super(raw.message);
        this.type = type || this.constructor.name;
        this.raw = raw;
        this.rawType = raw.type;
        this.code = raw.code;
        this.doc_url = raw.doc_url;
        this.param = raw.param;
        this.detail = raw.detail;
        this.headers = raw.headers;
        this.requestId = raw.requestId;
        this.statusCode = raw.statusCode;
        this.message = raw.message;
        this.charge = raw.charge;
        this.decline_code = raw.decline_code;
        this.payment_intent = raw.payment_intent;
        this.payment_method = raw.payment_method;
        this.payment_method_type = raw.payment_method_type;
        this.setup_intent = raw.setup_intent;
        this.source = raw.source;
      }
    };
    exports2.StripeError = StripeError;
    StripeError.generate = exports2.generate;
    var StripeCardError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripeCardError");
      }
    };
    exports2.StripeCardError = StripeCardError;
    var StripeInvalidRequestError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripeInvalidRequestError");
      }
    };
    exports2.StripeInvalidRequestError = StripeInvalidRequestError;
    var StripeAPIError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripeAPIError");
      }
    };
    exports2.StripeAPIError = StripeAPIError;
    var StripeAuthenticationError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripeAuthenticationError");
      }
    };
    exports2.StripeAuthenticationError = StripeAuthenticationError;
    var StripePermissionError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripePermissionError");
      }
    };
    exports2.StripePermissionError = StripePermissionError;
    var StripeRateLimitError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripeRateLimitError");
      }
    };
    exports2.StripeRateLimitError = StripeRateLimitError;
    var StripeConnectionError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripeConnectionError");
      }
    };
    exports2.StripeConnectionError = StripeConnectionError;
    var StripeSignatureVerificationError = class extends StripeError {
      constructor(header, payload, raw = {}) {
        super(raw, "StripeSignatureVerificationError");
        this.header = header;
        this.payload = payload;
      }
    };
    exports2.StripeSignatureVerificationError = StripeSignatureVerificationError;
    var StripeIdempotencyError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripeIdempotencyError");
      }
    };
    exports2.StripeIdempotencyError = StripeIdempotencyError;
    var StripeInvalidGrantError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripeInvalidGrantError");
      }
    };
    exports2.StripeInvalidGrantError = StripeInvalidGrantError;
    var StripeUnknownError = class extends StripeError {
      constructor(raw = {}) {
        super(raw, "StripeUnknownError");
      }
    };
    exports2.StripeUnknownError = StripeUnknownError;
  }
});

// netlify/functions/node_modules/es-errors/type.js
var require_type = __commonJS({
  "netlify/functions/node_modules/es-errors/type.js"(exports2, module2) {
    "use strict";
    module2.exports = TypeError;
  }
});

// netlify/functions/node_modules/object-inspect/util.inspect.js
var require_util_inspect = __commonJS({
  "netlify/functions/node_modules/object-inspect/util.inspect.js"(exports2, module2) {
    module2.exports = require("util").inspect;
  }
});

// netlify/functions/node_modules/object-inspect/index.js
var require_object_inspect = __commonJS({
  "netlify/functions/node_modules/object-inspect/index.js"(exports2, module2) {
    var hasMap = typeof Map === "function" && Map.prototype;
    var mapSizeDescriptor = Object.getOwnPropertyDescriptor && hasMap ? Object.getOwnPropertyDescriptor(Map.prototype, "size") : null;
    var mapSize = hasMap && mapSizeDescriptor && typeof mapSizeDescriptor.get === "function" ? mapSizeDescriptor.get : null;
    var mapForEach = hasMap && Map.prototype.forEach;
    var hasSet = typeof Set === "function" && Set.prototype;
    var setSizeDescriptor = Object.getOwnPropertyDescriptor && hasSet ? Object.getOwnPropertyDescriptor(Set.prototype, "size") : null;
    var setSize = hasSet && setSizeDescriptor && typeof setSizeDescriptor.get === "function" ? setSizeDescriptor.get : null;
    var setForEach = hasSet && Set.prototype.forEach;
    var hasWeakMap = typeof WeakMap === "function" && WeakMap.prototype;
    var weakMapHas = hasWeakMap ? WeakMap.prototype.has : null;
    var hasWeakSet = typeof WeakSet === "function" && WeakSet.prototype;
    var weakSetHas = hasWeakSet ? WeakSet.prototype.has : null;
    var hasWeakRef = typeof WeakRef === "function" && WeakRef.prototype;
    var weakRefDeref = hasWeakRef ? WeakRef.prototype.deref : null;
    var booleanValueOf = Boolean.prototype.valueOf;
    var objectToString = Object.prototype.toString;
    var functionToString = Function.prototype.toString;
    var $match = String.prototype.match;
    var $slice = String.prototype.slice;
    var $replace = String.prototype.replace;
    var $toUpperCase = String.prototype.toUpperCase;
    var $toLowerCase = String.prototype.toLowerCase;
    var $test = RegExp.prototype.test;
    var $concat = Array.prototype.concat;
    var $join = Array.prototype.join;
    var $arrSlice = Array.prototype.slice;
    var $floor = Math.floor;
    var bigIntValueOf = typeof BigInt === "function" ? BigInt.prototype.valueOf : null;
    var gOPS = Object.getOwnPropertySymbols;
    var symToString = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? Symbol.prototype.toString : null;
    var hasShammedSymbols = typeof Symbol === "function" && typeof Symbol.iterator === "object";
    var toStringTag = typeof Symbol === "function" && Symbol.toStringTag && (typeof Symbol.toStringTag === hasShammedSymbols ? "object" : "symbol") ? Symbol.toStringTag : null;
    var isEnumerable = Object.prototype.propertyIsEnumerable;
    var gPO = (typeof Reflect === "function" ? Reflect.getPrototypeOf : Object.getPrototypeOf) || ([].__proto__ === Array.prototype ? function(O) {
      return O.__proto__;
    } : null);
    function addNumericSeparator(num, str) {
      if (num === Infinity || num === -Infinity || num !== num || num && num > -1e3 && num < 1e3 || $test.call(/e/, str)) {
        return str;
      }
      var sepRegex = /[0-9](?=(?:[0-9]{3})+(?![0-9]))/g;
      if (typeof num === "number") {
        var int = num < 0 ? -$floor(-num) : $floor(num);
        if (int !== num) {
          var intStr = String(int);
          var dec = $slice.call(str, intStr.length + 1);
          return $replace.call(intStr, sepRegex, "$&_") + "." + $replace.call($replace.call(dec, /([0-9]{3})/g, "$&_"), /_$/, "");
        }
      }
      return $replace.call(str, sepRegex, "$&_");
    }
    var utilInspect = require_util_inspect();
    var inspectCustom = utilInspect.custom;
    var inspectSymbol = isSymbol(inspectCustom) ? inspectCustom : null;
    var quotes = {
      __proto__: null,
      "double": '"',
      single: "'"
    };
    var quoteREs = {
      __proto__: null,
      "double": /(["\\])/g,
      single: /(['\\])/g
    };
    module2.exports = function inspect_(obj, options, depth, seen) {
      var opts = options || {};
      if (has(opts, "quoteStyle") && !has(quotes, opts.quoteStyle)) {
        throw new TypeError('option "quoteStyle" must be "single" or "double"');
      }
      if (has(opts, "maxStringLength") && (typeof opts.maxStringLength === "number" ? opts.maxStringLength < 0 && opts.maxStringLength !== Infinity : opts.maxStringLength !== null)) {
        throw new TypeError('option "maxStringLength", if provided, must be a positive integer, Infinity, or `null`');
      }
      var customInspect = has(opts, "customInspect") ? opts.customInspect : true;
      if (typeof customInspect !== "boolean" && customInspect !== "symbol") {
        throw new TypeError("option \"customInspect\", if provided, must be `true`, `false`, or `'symbol'`");
      }
      if (has(opts, "indent") && opts.indent !== null && opts.indent !== "	" && !(parseInt(opts.indent, 10) === opts.indent && opts.indent > 0)) {
        throw new TypeError('option "indent" must be "\\t", an integer > 0, or `null`');
      }
      if (has(opts, "numericSeparator") && typeof opts.numericSeparator !== "boolean") {
        throw new TypeError('option "numericSeparator", if provided, must be `true` or `false`');
      }
      var numericSeparator = opts.numericSeparator;
      if (typeof obj === "undefined") {
        return "undefined";
      }
      if (obj === null) {
        return "null";
      }
      if (typeof obj === "boolean") {
        return obj ? "true" : "false";
      }
      if (typeof obj === "string") {
        return inspectString(obj, opts);
      }
      if (typeof obj === "number") {
        if (obj === 0) {
          return Infinity / obj > 0 ? "0" : "-0";
        }
        var str = String(obj);
        return numericSeparator ? addNumericSeparator(obj, str) : str;
      }
      if (typeof obj === "bigint") {
        var bigIntStr = String(obj) + "n";
        return numericSeparator ? addNumericSeparator(obj, bigIntStr) : bigIntStr;
      }
      var maxDepth = typeof opts.depth === "undefined" ? 5 : opts.depth;
      if (typeof depth === "undefined") {
        depth = 0;
      }
      if (depth >= maxDepth && maxDepth > 0 && typeof obj === "object") {
        return isArray(obj) ? "[Array]" : "[Object]";
      }
      var indent = getIndent(opts, depth);
      if (typeof seen === "undefined") {
        seen = [];
      } else if (indexOf(seen, obj) >= 0) {
        return "[Circular]";
      }
      function inspect(value, from, noIndent) {
        if (from) {
          seen = $arrSlice.call(seen);
          seen.push(from);
        }
        if (noIndent) {
          var newOpts = {
            depth: opts.depth
          };
          if (has(opts, "quoteStyle")) {
            newOpts.quoteStyle = opts.quoteStyle;
          }
          return inspect_(value, newOpts, depth + 1, seen);
        }
        return inspect_(value, opts, depth + 1, seen);
      }
      if (typeof obj === "function" && !isRegExp(obj)) {
        var name = nameOf(obj);
        var keys = arrObjKeys(obj, inspect);
        return "[Function" + (name ? ": " + name : " (anonymous)") + "]" + (keys.length > 0 ? " { " + $join.call(keys, ", ") + " }" : "");
      }
      if (isSymbol(obj)) {
        var symString = hasShammedSymbols ? $replace.call(String(obj), /^(Symbol\(.*\))_[^)]*$/, "$1") : symToString.call(obj);
        return typeof obj === "object" && !hasShammedSymbols ? markBoxed(symString) : symString;
      }
      if (isElement(obj)) {
        var s = "<" + $toLowerCase.call(String(obj.nodeName));
        var attrs = obj.attributes || [];
        for (var i = 0; i < attrs.length; i++) {
          s += " " + attrs[i].name + "=" + wrapQuotes(quote(attrs[i].value), "double", opts);
        }
        s += ">";
        if (obj.childNodes && obj.childNodes.length) {
          s += "...";
        }
        s += "</" + $toLowerCase.call(String(obj.nodeName)) + ">";
        return s;
      }
      if (isArray(obj)) {
        if (obj.length === 0) {
          return "[]";
        }
        var xs = arrObjKeys(obj, inspect);
        if (indent && !singleLineValues(xs)) {
          return "[" + indentedJoin(xs, indent) + "]";
        }
        return "[ " + $join.call(xs, ", ") + " ]";
      }
      if (isError(obj)) {
        var parts = arrObjKeys(obj, inspect);
        if (!("cause" in Error.prototype) && "cause" in obj && !isEnumerable.call(obj, "cause")) {
          return "{ [" + String(obj) + "] " + $join.call($concat.call("[cause]: " + inspect(obj.cause), parts), ", ") + " }";
        }
        if (parts.length === 0) {
          return "[" + String(obj) + "]";
        }
        return "{ [" + String(obj) + "] " + $join.call(parts, ", ") + " }";
      }
      if (typeof obj === "object" && customInspect) {
        if (inspectSymbol && typeof obj[inspectSymbol] === "function" && utilInspect) {
          return utilInspect(obj, { depth: maxDepth - depth });
        } else if (customInspect !== "symbol" && typeof obj.inspect === "function") {
          return obj.inspect();
        }
      }
      if (isMap(obj)) {
        var mapParts = [];
        if (mapForEach) {
          mapForEach.call(obj, function(value, key) {
            mapParts.push(inspect(key, obj, true) + " => " + inspect(value, obj));
          });
        }
        return collectionOf("Map", mapSize.call(obj), mapParts, indent);
      }
      if (isSet(obj)) {
        var setParts = [];
        if (setForEach) {
          setForEach.call(obj, function(value) {
            setParts.push(inspect(value, obj));
          });
        }
        return collectionOf("Set", setSize.call(obj), setParts, indent);
      }
      if (isWeakMap(obj)) {
        return weakCollectionOf("WeakMap");
      }
      if (isWeakSet(obj)) {
        return weakCollectionOf("WeakSet");
      }
      if (isWeakRef(obj)) {
        return weakCollectionOf("WeakRef");
      }
      if (isNumber(obj)) {
        return markBoxed(inspect(Number(obj)));
      }
      if (isBigInt(obj)) {
        return markBoxed(inspect(bigIntValueOf.call(obj)));
      }
      if (isBoolean(obj)) {
        return markBoxed(booleanValueOf.call(obj));
      }
      if (isString(obj)) {
        return markBoxed(inspect(String(obj)));
      }
      if (typeof window !== "undefined" && obj === window) {
        return "{ [object Window] }";
      }
      if (typeof globalThis !== "undefined" && obj === globalThis || typeof global !== "undefined" && obj === global) {
        return "{ [object globalThis] }";
      }
      if (!isDate(obj) && !isRegExp(obj)) {
        var ys = arrObjKeys(obj, inspect);
        var isPlainObject = gPO ? gPO(obj) === Object.prototype : obj instanceof Object || obj.constructor === Object;
        var protoTag = obj instanceof Object ? "" : "null prototype";
        var stringTag = !isPlainObject && toStringTag && Object(obj) === obj && toStringTag in obj ? $slice.call(toStr(obj), 8, -1) : protoTag ? "Object" : "";
        var constructorTag = isPlainObject || typeof obj.constructor !== "function" ? "" : obj.constructor.name ? obj.constructor.name + " " : "";
        var tag = constructorTag + (stringTag || protoTag ? "[" + $join.call($concat.call([], stringTag || [], protoTag || []), ": ") + "] " : "");
        if (ys.length === 0) {
          return tag + "{}";
        }
        if (indent) {
          return tag + "{" + indentedJoin(ys, indent) + "}";
        }
        return tag + "{ " + $join.call(ys, ", ") + " }";
      }
      return String(obj);
    };
    function wrapQuotes(s, defaultStyle, opts) {
      var style = opts.quoteStyle || defaultStyle;
      var quoteChar = quotes[style];
      return quoteChar + s + quoteChar;
    }
    function quote(s) {
      return $replace.call(String(s), /"/g, "&quot;");
    }
    function canTrustToString(obj) {
      return !toStringTag || !(typeof obj === "object" && (toStringTag in obj || typeof obj[toStringTag] !== "undefined"));
    }
    function isArray(obj) {
      return toStr(obj) === "[object Array]" && canTrustToString(obj);
    }
    function isDate(obj) {
      return toStr(obj) === "[object Date]" && canTrustToString(obj);
    }
    function isRegExp(obj) {
      return toStr(obj) === "[object RegExp]" && canTrustToString(obj);
    }
    function isError(obj) {
      return toStr(obj) === "[object Error]" && canTrustToString(obj);
    }
    function isString(obj) {
      return toStr(obj) === "[object String]" && canTrustToString(obj);
    }
    function isNumber(obj) {
      return toStr(obj) === "[object Number]" && canTrustToString(obj);
    }
    function isBoolean(obj) {
      return toStr(obj) === "[object Boolean]" && canTrustToString(obj);
    }
    function isSymbol(obj) {
      if (hasShammedSymbols) {
        return obj && typeof obj === "object" && obj instanceof Symbol;
      }
      if (typeof obj === "symbol") {
        return true;
      }
      if (!obj || typeof obj !== "object" || !symToString) {
        return false;
      }
      try {
        symToString.call(obj);
        return true;
      } catch (e) {
      }
      return false;
    }
    function isBigInt(obj) {
      if (!obj || typeof obj !== "object" || !bigIntValueOf) {
        return false;
      }
      try {
        bigIntValueOf.call(obj);
        return true;
      } catch (e) {
      }
      return false;
    }
    var hasOwn = Object.prototype.hasOwnProperty || function(key) {
      return key in this;
    };
    function has(obj, key) {
      return hasOwn.call(obj, key);
    }
    function toStr(obj) {
      return objectToString.call(obj);
    }
    function nameOf(f) {
      if (f.name) {
        return f.name;
      }
      var m = $match.call(functionToString.call(f), /^function\s*([\w$]+)/);
      if (m) {
        return m[1];
      }
      return null;
    }
    function indexOf(xs, x) {
      if (xs.indexOf) {
        return xs.indexOf(x);
      }
      for (var i = 0, l = xs.length; i < l; i++) {
        if (xs[i] === x) {
          return i;
        }
      }
      return -1;
    }
    function isMap(x) {
      if (!mapSize || !x || typeof x !== "object") {
        return false;
      }
      try {
        mapSize.call(x);
        try {
          setSize.call(x);
        } catch (s) {
          return true;
        }
        return x instanceof Map;
      } catch (e) {
      }
      return false;
    }
    function isWeakMap(x) {
      if (!weakMapHas || !x || typeof x !== "object") {
        return false;
      }
      try {
        weakMapHas.call(x, weakMapHas);
        try {
          weakSetHas.call(x, weakSetHas);
        } catch (s) {
          return true;
        }
        return x instanceof WeakMap;
      } catch (e) {
      }
      return false;
    }
    function isWeakRef(x) {
      if (!weakRefDeref || !x || typeof x !== "object") {
        return false;
      }
      try {
        weakRefDeref.call(x);
        return true;
      } catch (e) {
      }
      return false;
    }
    function isSet(x) {
      if (!setSize || !x || typeof x !== "object") {
        return false;
      }
      try {
        setSize.call(x);
        try {
          mapSize.call(x);
        } catch (m) {
          return true;
        }
        return x instanceof Set;
      } catch (e) {
      }
      return false;
    }
    function isWeakSet(x) {
      if (!weakSetHas || !x || typeof x !== "object") {
        return false;
      }
      try {
        weakSetHas.call(x, weakSetHas);
        try {
          weakMapHas.call(x, weakMapHas);
        } catch (s) {
          return true;
        }
        return x instanceof WeakSet;
      } catch (e) {
      }
      return false;
    }
    function isElement(x) {
      if (!x || typeof x !== "object") {
        return false;
      }
      if (typeof HTMLElement !== "undefined" && x instanceof HTMLElement) {
        return true;
      }
      return typeof x.nodeName === "string" && typeof x.getAttribute === "function";
    }
    function inspectString(str, opts) {
      if (str.length > opts.maxStringLength) {
        var remaining = str.length - opts.maxStringLength;
        var trailer = "... " + remaining + " more character" + (remaining > 1 ? "s" : "");
        return inspectString($slice.call(str, 0, opts.maxStringLength), opts) + trailer;
      }
      var quoteRE = quoteREs[opts.quoteStyle || "single"];
      quoteRE.lastIndex = 0;
      var s = $replace.call($replace.call(str, quoteRE, "\\$1"), /[\x00-\x1f]/g, lowbyte);
      return wrapQuotes(s, "single", opts);
    }
    function lowbyte(c) {
      var n = c.charCodeAt(0);
      var x = {
        8: "b",
        9: "t",
        10: "n",
        12: "f",
        13: "r"
      }[n];
      if (x) {
        return "\\" + x;
      }
      return "\\x" + (n < 16 ? "0" : "") + $toUpperCase.call(n.toString(16));
    }
    function markBoxed(str) {
      return "Object(" + str + ")";
    }
    function weakCollectionOf(type) {
      return type + " { ? }";
    }
    function collectionOf(type, size, entries, indent) {
      var joinedEntries = indent ? indentedJoin(entries, indent) : $join.call(entries, ", ");
      return type + " (" + size + ") {" + joinedEntries + "}";
    }
    function singleLineValues(xs) {
      for (var i = 0; i < xs.length; i++) {
        if (indexOf(xs[i], "\n") >= 0) {
          return false;
        }
      }
      return true;
    }
    function getIndent(opts, depth) {
      var baseIndent;
      if (opts.indent === "	") {
        baseIndent = "	";
      } else if (typeof opts.indent === "number" && opts.indent > 0) {
        baseIndent = $join.call(Array(opts.indent + 1), " ");
      } else {
        return null;
      }
      return {
        base: baseIndent,
        prev: $join.call(Array(depth + 1), baseIndent)
      };
    }
    function indentedJoin(xs, indent) {
      if (xs.length === 0) {
        return "";
      }
      var lineJoiner = "\n" + indent.prev + indent.base;
      return lineJoiner + $join.call(xs, "," + lineJoiner) + "\n" + indent.prev;
    }
    function arrObjKeys(obj, inspect) {
      var isArr = isArray(obj);
      var xs = [];
      if (isArr) {
        xs.length = obj.length;
        for (var i = 0; i < obj.length; i++) {
          xs[i] = has(obj, i) ? inspect(obj[i], obj) : "";
        }
      }
      var syms = typeof gOPS === "function" ? gOPS(obj) : [];
      var symMap;
      if (hasShammedSymbols) {
        symMap = {};
        for (var k = 0; k < syms.length; k++) {
          symMap["$" + syms[k]] = syms[k];
        }
      }
      for (var key in obj) {
        if (!has(obj, key)) {
          continue;
        }
        if (isArr && String(Number(key)) === key && key < obj.length) {
          continue;
        }
        if (hasShammedSymbols && symMap["$" + key] instanceof Symbol) {
          continue;
        } else if ($test.call(/[^\w$]/, key)) {
          xs.push(inspect(key, obj) + ": " + inspect(obj[key], obj));
        } else {
          xs.push(key + ": " + inspect(obj[key], obj));
        }
      }
      if (typeof gOPS === "function") {
        for (var j = 0; j < syms.length; j++) {
          if (isEnumerable.call(obj, syms[j])) {
            xs.push("[" + inspect(syms[j]) + "]: " + inspect(obj[syms[j]], obj));
          }
        }
      }
      return xs;
    }
  }
});

// netlify/functions/node_modules/side-channel-list/index.js
var require_side_channel_list = __commonJS({
  "netlify/functions/node_modules/side-channel-list/index.js"(exports2, module2) {
    "use strict";
    var inspect = require_object_inspect();
    var $TypeError = require_type();
    var listGetNode = function(list, key, isDelete) {
      var prev = list;
      var curr;
      for (; (curr = prev.next) != null; prev = curr) {
        if (curr.key === key) {
          prev.next = curr.next;
          if (!isDelete) {
            curr.next = /** @type {NonNullable<typeof list.next>} */
            list.next;
            list.next = curr;
          }
          return curr;
        }
      }
    };
    var listGet = function(objects, key) {
      if (!objects) {
        return void 0;
      }
      var node = listGetNode(objects, key);
      return node && node.value;
    };
    var listSet = function(objects, key, value) {
      var node = listGetNode(objects, key);
      if (node) {
        node.value = value;
      } else {
        objects.next = /** @type {import('./list.d.ts').ListNode<typeof value, typeof key>} */
        {
          // eslint-disable-line no-param-reassign, no-extra-parens
          key,
          next: objects.next,
          value
        };
      }
    };
    var listHas = function(objects, key) {
      if (!objects) {
        return false;
      }
      return !!listGetNode(objects, key);
    };
    var listDelete = function(objects, key) {
      if (objects) {
        return listGetNode(objects, key, true);
      }
    };
    module2.exports = function getSideChannelList() {
      var $o;
      var channel = {
        assert: function(key) {
          if (!channel.has(key)) {
            throw new $TypeError("Side channel does not contain " + inspect(key));
          }
        },
        "delete": function(key) {
          var root = $o && $o.next;
          var deletedNode = listDelete($o, key);
          if (deletedNode && root && root === deletedNode) {
            $o = void 0;
          }
          return !!deletedNode;
        },
        get: function(key) {
          return listGet($o, key);
        },
        has: function(key) {
          return listHas($o, key);
        },
        set: function(key, value) {
          if (!$o) {
            $o = {
              next: void 0
            };
          }
          listSet(
            /** @type {NonNullable<typeof $o>} */
            $o,
            key,
            value
          );
        }
      };
      return channel;
    };
  }
});

// netlify/functions/node_modules/es-object-atoms/index.js
var require_es_object_atoms = __commonJS({
  "netlify/functions/node_modules/es-object-atoms/index.js"(exports2, module2) {
    "use strict";
    module2.exports = Object;
  }
});

// netlify/functions/node_modules/es-errors/index.js
var require_es_errors = __commonJS({
  "netlify/functions/node_modules/es-errors/index.js"(exports2, module2) {
    "use strict";
    module2.exports = Error;
  }
});

// netlify/functions/node_modules/es-errors/eval.js
var require_eval = __commonJS({
  "netlify/functions/node_modules/es-errors/eval.js"(exports2, module2) {
    "use strict";
    module2.exports = EvalError;
  }
});

// netlify/functions/node_modules/es-errors/range.js
var require_range = __commonJS({
  "netlify/functions/node_modules/es-errors/range.js"(exports2, module2) {
    "use strict";
    module2.exports = RangeError;
  }
});

// netlify/functions/node_modules/es-errors/ref.js
var require_ref = __commonJS({
  "netlify/functions/node_modules/es-errors/ref.js"(exports2, module2) {
    "use strict";
    module2.exports = ReferenceError;
  }
});

// netlify/functions/node_modules/es-errors/syntax.js
var require_syntax = __commonJS({
  "netlify/functions/node_modules/es-errors/syntax.js"(exports2, module2) {
    "use strict";
    module2.exports = SyntaxError;
  }
});

// netlify/functions/node_modules/es-errors/uri.js
var require_uri = __commonJS({
  "netlify/functions/node_modules/es-errors/uri.js"(exports2, module2) {
    "use strict";
    module2.exports = URIError;
  }
});

// netlify/functions/node_modules/math-intrinsics/abs.js
var require_abs = __commonJS({
  "netlify/functions/node_modules/math-intrinsics/abs.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.abs;
  }
});

// netlify/functions/node_modules/math-intrinsics/floor.js
var require_floor = __commonJS({
  "netlify/functions/node_modules/math-intrinsics/floor.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.floor;
  }
});

// netlify/functions/node_modules/math-intrinsics/max.js
var require_max = __commonJS({
  "netlify/functions/node_modules/math-intrinsics/max.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.max;
  }
});

// netlify/functions/node_modules/math-intrinsics/min.js
var require_min = __commonJS({
  "netlify/functions/node_modules/math-intrinsics/min.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.min;
  }
});

// netlify/functions/node_modules/math-intrinsics/pow.js
var require_pow = __commonJS({
  "netlify/functions/node_modules/math-intrinsics/pow.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.pow;
  }
});

// netlify/functions/node_modules/math-intrinsics/round.js
var require_round = __commonJS({
  "netlify/functions/node_modules/math-intrinsics/round.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.round;
  }
});

// netlify/functions/node_modules/math-intrinsics/isNaN.js
var require_isNaN = __commonJS({
  "netlify/functions/node_modules/math-intrinsics/isNaN.js"(exports2, module2) {
    "use strict";
    module2.exports = Number.isNaN || function isNaN2(a) {
      return a !== a;
    };
  }
});

// netlify/functions/node_modules/math-intrinsics/sign.js
var require_sign = __commonJS({
  "netlify/functions/node_modules/math-intrinsics/sign.js"(exports2, module2) {
    "use strict";
    var $isNaN = require_isNaN();
    module2.exports = function sign(number) {
      if ($isNaN(number) || number === 0) {
        return number;
      }
      return number < 0 ? -1 : 1;
    };
  }
});

// netlify/functions/node_modules/gopd/gOPD.js
var require_gOPD = __commonJS({
  "netlify/functions/node_modules/gopd/gOPD.js"(exports2, module2) {
    "use strict";
    module2.exports = Object.getOwnPropertyDescriptor;
  }
});

// netlify/functions/node_modules/gopd/index.js
var require_gopd = __commonJS({
  "netlify/functions/node_modules/gopd/index.js"(exports2, module2) {
    "use strict";
    var $gOPD = require_gOPD();
    if ($gOPD) {
      try {
        $gOPD([], "length");
      } catch (e) {
        $gOPD = null;
      }
    }
    module2.exports = $gOPD;
  }
});

// netlify/functions/node_modules/es-define-property/index.js
var require_es_define_property = __commonJS({
  "netlify/functions/node_modules/es-define-property/index.js"(exports2, module2) {
    "use strict";
    var $defineProperty = Object.defineProperty || false;
    if ($defineProperty) {
      try {
        $defineProperty({}, "a", { value: 1 });
      } catch (e) {
        $defineProperty = false;
      }
    }
    module2.exports = $defineProperty;
  }
});

// netlify/functions/node_modules/has-symbols/shams.js
var require_shams = __commonJS({
  "netlify/functions/node_modules/has-symbols/shams.js"(exports2, module2) {
    "use strict";
    module2.exports = function hasSymbols() {
      if (typeof Symbol !== "function" || typeof Object.getOwnPropertySymbols !== "function") {
        return false;
      }
      if (typeof Symbol.iterator === "symbol") {
        return true;
      }
      var obj = {};
      var sym = /* @__PURE__ */ Symbol("test");
      var symObj = Object(sym);
      if (typeof sym === "string") {
        return false;
      }
      if (Object.prototype.toString.call(sym) !== "[object Symbol]") {
        return false;
      }
      if (Object.prototype.toString.call(symObj) !== "[object Symbol]") {
        return false;
      }
      var symVal = 42;
      obj[sym] = symVal;
      for (var _ in obj) {
        return false;
      }
      if (typeof Object.keys === "function" && Object.keys(obj).length !== 0) {
        return false;
      }
      if (typeof Object.getOwnPropertyNames === "function" && Object.getOwnPropertyNames(obj).length !== 0) {
        return false;
      }
      var syms = Object.getOwnPropertySymbols(obj);
      if (syms.length !== 1 || syms[0] !== sym) {
        return false;
      }
      if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) {
        return false;
      }
      if (typeof Object.getOwnPropertyDescriptor === "function") {
        var descriptor = (
          /** @type {PropertyDescriptor} */
          Object.getOwnPropertyDescriptor(obj, sym)
        );
        if (descriptor.value !== symVal || descriptor.enumerable !== true) {
          return false;
        }
      }
      return true;
    };
  }
});

// netlify/functions/node_modules/has-symbols/index.js
var require_has_symbols = __commonJS({
  "netlify/functions/node_modules/has-symbols/index.js"(exports2, module2) {
    "use strict";
    var origSymbol = typeof Symbol !== "undefined" && Symbol;
    var hasSymbolSham = require_shams();
    module2.exports = function hasNativeSymbols() {
      if (typeof origSymbol !== "function") {
        return false;
      }
      if (typeof Symbol !== "function") {
        return false;
      }
      if (typeof origSymbol("foo") !== "symbol") {
        return false;
      }
      if (typeof /* @__PURE__ */ Symbol("bar") !== "symbol") {
        return false;
      }
      return hasSymbolSham();
    };
  }
});

// netlify/functions/node_modules/get-proto/Reflect.getPrototypeOf.js
var require_Reflect_getPrototypeOf = __commonJS({
  "netlify/functions/node_modules/get-proto/Reflect.getPrototypeOf.js"(exports2, module2) {
    "use strict";
    module2.exports = typeof Reflect !== "undefined" && Reflect.getPrototypeOf || null;
  }
});

// netlify/functions/node_modules/get-proto/Object.getPrototypeOf.js
var require_Object_getPrototypeOf = __commonJS({
  "netlify/functions/node_modules/get-proto/Object.getPrototypeOf.js"(exports2, module2) {
    "use strict";
    var $Object = require_es_object_atoms();
    module2.exports = $Object.getPrototypeOf || null;
  }
});

// netlify/functions/node_modules/function-bind/implementation.js
var require_implementation = __commonJS({
  "netlify/functions/node_modules/function-bind/implementation.js"(exports2, module2) {
    "use strict";
    var ERROR_MESSAGE = "Function.prototype.bind called on incompatible ";
    var toStr = Object.prototype.toString;
    var max = Math.max;
    var funcType = "[object Function]";
    var concatty = function concatty2(a, b) {
      var arr = [];
      for (var i = 0; i < a.length; i += 1) {
        arr[i] = a[i];
      }
      for (var j = 0; j < b.length; j += 1) {
        arr[j + a.length] = b[j];
      }
      return arr;
    };
    var slicy = function slicy2(arrLike, offset) {
      var arr = [];
      for (var i = offset || 0, j = 0; i < arrLike.length; i += 1, j += 1) {
        arr[j] = arrLike[i];
      }
      return arr;
    };
    var joiny = function(arr, joiner) {
      var str = "";
      for (var i = 0; i < arr.length; i += 1) {
        str += arr[i];
        if (i + 1 < arr.length) {
          str += joiner;
        }
      }
      return str;
    };
    module2.exports = function bind(that) {
      var target = this;
      if (typeof target !== "function" || toStr.apply(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
      }
      var args = slicy(arguments, 1);
      var bound;
      var binder = function() {
        if (this instanceof bound) {
          var result = target.apply(
            this,
            concatty(args, arguments)
          );
          if (Object(result) === result) {
            return result;
          }
          return this;
        }
        return target.apply(
          that,
          concatty(args, arguments)
        );
      };
      var boundLength = max(0, target.length - args.length);
      var boundArgs = [];
      for (var i = 0; i < boundLength; i++) {
        boundArgs[i] = "$" + i;
      }
      bound = Function("binder", "return function (" + joiny(boundArgs, ",") + "){ return binder.apply(this,arguments); }")(binder);
      if (target.prototype) {
        var Empty = function Empty2() {
        };
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
      }
      return bound;
    };
  }
});

// netlify/functions/node_modules/function-bind/index.js
var require_function_bind = __commonJS({
  "netlify/functions/node_modules/function-bind/index.js"(exports2, module2) {
    "use strict";
    var implementation = require_implementation();
    module2.exports = Function.prototype.bind || implementation;
  }
});

// netlify/functions/node_modules/call-bind-apply-helpers/functionCall.js
var require_functionCall = __commonJS({
  "netlify/functions/node_modules/call-bind-apply-helpers/functionCall.js"(exports2, module2) {
    "use strict";
    module2.exports = Function.prototype.call;
  }
});

// netlify/functions/node_modules/call-bind-apply-helpers/functionApply.js
var require_functionApply = __commonJS({
  "netlify/functions/node_modules/call-bind-apply-helpers/functionApply.js"(exports2, module2) {
    "use strict";
    module2.exports = Function.prototype.apply;
  }
});

// netlify/functions/node_modules/call-bind-apply-helpers/reflectApply.js
var require_reflectApply = __commonJS({
  "netlify/functions/node_modules/call-bind-apply-helpers/reflectApply.js"(exports2, module2) {
    "use strict";
    module2.exports = typeof Reflect !== "undefined" && Reflect && Reflect.apply;
  }
});

// netlify/functions/node_modules/call-bind-apply-helpers/actualApply.js
var require_actualApply = __commonJS({
  "netlify/functions/node_modules/call-bind-apply-helpers/actualApply.js"(exports2, module2) {
    "use strict";
    var bind = require_function_bind();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var $reflectApply = require_reflectApply();
    module2.exports = $reflectApply || bind.call($call, $apply);
  }
});

// netlify/functions/node_modules/call-bind-apply-helpers/index.js
var require_call_bind_apply_helpers = __commonJS({
  "netlify/functions/node_modules/call-bind-apply-helpers/index.js"(exports2, module2) {
    "use strict";
    var bind = require_function_bind();
    var $TypeError = require_type();
    var $call = require_functionCall();
    var $actualApply = require_actualApply();
    module2.exports = function callBindBasic(args) {
      if (args.length < 1 || typeof args[0] !== "function") {
        throw new $TypeError("a function is required");
      }
      return $actualApply(bind, $call, args);
    };
  }
});

// netlify/functions/node_modules/dunder-proto/get.js
var require_get = __commonJS({
  "netlify/functions/node_modules/dunder-proto/get.js"(exports2, module2) {
    "use strict";
    var callBind = require_call_bind_apply_helpers();
    var gOPD = require_gopd();
    var hasProtoAccessor;
    try {
      hasProtoAccessor = /** @type {{ __proto__?: typeof Array.prototype }} */
      [].__proto__ === Array.prototype;
    } catch (e) {
      if (!e || typeof e !== "object" || !("code" in e) || e.code !== "ERR_PROTO_ACCESS") {
        throw e;
      }
    }
    var desc = !!hasProtoAccessor && gOPD && gOPD(
      Object.prototype,
      /** @type {keyof typeof Object.prototype} */
      "__proto__"
    );
    var $Object = Object;
    var $getPrototypeOf = $Object.getPrototypeOf;
    module2.exports = desc && typeof desc.get === "function" ? callBind([desc.get]) : typeof $getPrototypeOf === "function" ? (
      /** @type {import('./get')} */
      function getDunder(value) {
        return $getPrototypeOf(value == null ? value : $Object(value));
      }
    ) : false;
  }
});

// netlify/functions/node_modules/get-proto/index.js
var require_get_proto = __commonJS({
  "netlify/functions/node_modules/get-proto/index.js"(exports2, module2) {
    "use strict";
    var reflectGetProto = require_Reflect_getPrototypeOf();
    var originalGetProto = require_Object_getPrototypeOf();
    var getDunderProto = require_get();
    module2.exports = reflectGetProto ? function getProto(O) {
      return reflectGetProto(O);
    } : originalGetProto ? function getProto(O) {
      if (!O || typeof O !== "object" && typeof O !== "function") {
        throw new TypeError("getProto: not an object");
      }
      return originalGetProto(O);
    } : getDunderProto ? function getProto(O) {
      return getDunderProto(O);
    } : null;
  }
});

// netlify/functions/node_modules/hasown/index.js
var require_hasown = __commonJS({
  "netlify/functions/node_modules/hasown/index.js"(exports2, module2) {
    "use strict";
    var call = Function.prototype.call;
    var $hasOwn = Object.prototype.hasOwnProperty;
    var bind = require_function_bind();
    module2.exports = bind.call(call, $hasOwn);
  }
});

// netlify/functions/node_modules/get-intrinsic/index.js
var require_get_intrinsic = __commonJS({
  "netlify/functions/node_modules/get-intrinsic/index.js"(exports2, module2) {
    "use strict";
    var undefined2;
    var $Object = require_es_object_atoms();
    var $Error = require_es_errors();
    var $EvalError = require_eval();
    var $RangeError = require_range();
    var $ReferenceError = require_ref();
    var $SyntaxError = require_syntax();
    var $TypeError = require_type();
    var $URIError = require_uri();
    var abs = require_abs();
    var floor = require_floor();
    var max = require_max();
    var min = require_min();
    var pow = require_pow();
    var round = require_round();
    var sign = require_sign();
    var $Function = Function;
    var getEvalledConstructor = function(expressionSyntax) {
      try {
        return $Function('"use strict"; return (' + expressionSyntax + ").constructor;")();
      } catch (e) {
      }
    };
    var $gOPD = require_gopd();
    var $defineProperty = require_es_define_property();
    var throwTypeError = function() {
      throw new $TypeError();
    };
    var ThrowTypeError = $gOPD ? (function() {
      try {
        arguments.callee;
        return throwTypeError;
      } catch (calleeThrows) {
        try {
          return $gOPD(arguments, "callee").get;
        } catch (gOPDthrows) {
          return throwTypeError;
        }
      }
    })() : throwTypeError;
    var hasSymbols = require_has_symbols()();
    var getProto = require_get_proto();
    var $ObjectGPO = require_Object_getPrototypeOf();
    var $ReflectGPO = require_Reflect_getPrototypeOf();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var needsEval = {};
    var TypedArray = typeof Uint8Array === "undefined" || !getProto ? undefined2 : getProto(Uint8Array);
    var INTRINSICS = {
      __proto__: null,
      "%AggregateError%": typeof AggregateError === "undefined" ? undefined2 : AggregateError,
      "%Array%": Array,
      "%ArrayBuffer%": typeof ArrayBuffer === "undefined" ? undefined2 : ArrayBuffer,
      "%ArrayIteratorPrototype%": hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined2,
      "%AsyncFromSyncIteratorPrototype%": undefined2,
      "%AsyncFunction%": needsEval,
      "%AsyncGenerator%": needsEval,
      "%AsyncGeneratorFunction%": needsEval,
      "%AsyncIteratorPrototype%": needsEval,
      "%Atomics%": typeof Atomics === "undefined" ? undefined2 : Atomics,
      "%BigInt%": typeof BigInt === "undefined" ? undefined2 : BigInt,
      "%BigInt64Array%": typeof BigInt64Array === "undefined" ? undefined2 : BigInt64Array,
      "%BigUint64Array%": typeof BigUint64Array === "undefined" ? undefined2 : BigUint64Array,
      "%Boolean%": Boolean,
      "%DataView%": typeof DataView === "undefined" ? undefined2 : DataView,
      "%Date%": Date,
      "%decodeURI%": decodeURI,
      "%decodeURIComponent%": decodeURIComponent,
      "%encodeURI%": encodeURI,
      "%encodeURIComponent%": encodeURIComponent,
      "%Error%": $Error,
      "%eval%": eval,
      // eslint-disable-line no-eval
      "%EvalError%": $EvalError,
      "%Float16Array%": typeof Float16Array === "undefined" ? undefined2 : Float16Array,
      "%Float32Array%": typeof Float32Array === "undefined" ? undefined2 : Float32Array,
      "%Float64Array%": typeof Float64Array === "undefined" ? undefined2 : Float64Array,
      "%FinalizationRegistry%": typeof FinalizationRegistry === "undefined" ? undefined2 : FinalizationRegistry,
      "%Function%": $Function,
      "%GeneratorFunction%": needsEval,
      "%Int8Array%": typeof Int8Array === "undefined" ? undefined2 : Int8Array,
      "%Int16Array%": typeof Int16Array === "undefined" ? undefined2 : Int16Array,
      "%Int32Array%": typeof Int32Array === "undefined" ? undefined2 : Int32Array,
      "%isFinite%": isFinite,
      "%isNaN%": isNaN,
      "%IteratorPrototype%": hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined2,
      "%JSON%": typeof JSON === "object" ? JSON : undefined2,
      "%Map%": typeof Map === "undefined" ? undefined2 : Map,
      "%MapIteratorPrototype%": typeof Map === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Map())[Symbol.iterator]()),
      "%Math%": Math,
      "%Number%": Number,
      "%Object%": $Object,
      "%Object.getOwnPropertyDescriptor%": $gOPD,
      "%parseFloat%": parseFloat,
      "%parseInt%": parseInt,
      "%Promise%": typeof Promise === "undefined" ? undefined2 : Promise,
      "%Proxy%": typeof Proxy === "undefined" ? undefined2 : Proxy,
      "%RangeError%": $RangeError,
      "%ReferenceError%": $ReferenceError,
      "%Reflect%": typeof Reflect === "undefined" ? undefined2 : Reflect,
      "%RegExp%": RegExp,
      "%Set%": typeof Set === "undefined" ? undefined2 : Set,
      "%SetIteratorPrototype%": typeof Set === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Set())[Symbol.iterator]()),
      "%SharedArrayBuffer%": typeof SharedArrayBuffer === "undefined" ? undefined2 : SharedArrayBuffer,
      "%String%": String,
      "%StringIteratorPrototype%": hasSymbols && getProto ? getProto(""[Symbol.iterator]()) : undefined2,
      "%Symbol%": hasSymbols ? Symbol : undefined2,
      "%SyntaxError%": $SyntaxError,
      "%ThrowTypeError%": ThrowTypeError,
      "%TypedArray%": TypedArray,
      "%TypeError%": $TypeError,
      "%Uint8Array%": typeof Uint8Array === "undefined" ? undefined2 : Uint8Array,
      "%Uint8ClampedArray%": typeof Uint8ClampedArray === "undefined" ? undefined2 : Uint8ClampedArray,
      "%Uint16Array%": typeof Uint16Array === "undefined" ? undefined2 : Uint16Array,
      "%Uint32Array%": typeof Uint32Array === "undefined" ? undefined2 : Uint32Array,
      "%URIError%": $URIError,
      "%WeakMap%": typeof WeakMap === "undefined" ? undefined2 : WeakMap,
      "%WeakRef%": typeof WeakRef === "undefined" ? undefined2 : WeakRef,
      "%WeakSet%": typeof WeakSet === "undefined" ? undefined2 : WeakSet,
      "%Function.prototype.call%": $call,
      "%Function.prototype.apply%": $apply,
      "%Object.defineProperty%": $defineProperty,
      "%Object.getPrototypeOf%": $ObjectGPO,
      "%Math.abs%": abs,
      "%Math.floor%": floor,
      "%Math.max%": max,
      "%Math.min%": min,
      "%Math.pow%": pow,
      "%Math.round%": round,
      "%Math.sign%": sign,
      "%Reflect.getPrototypeOf%": $ReflectGPO
    };
    if (getProto) {
      try {
        null.error;
      } catch (e) {
        errorProto = getProto(getProto(e));
        INTRINSICS["%Error.prototype%"] = errorProto;
      }
    }
    var errorProto;
    var doEval = function doEval2(name) {
      var value;
      if (name === "%AsyncFunction%") {
        value = getEvalledConstructor("async function () {}");
      } else if (name === "%GeneratorFunction%") {
        value = getEvalledConstructor("function* () {}");
      } else if (name === "%AsyncGeneratorFunction%") {
        value = getEvalledConstructor("async function* () {}");
      } else if (name === "%AsyncGenerator%") {
        var fn = doEval2("%AsyncGeneratorFunction%");
        if (fn) {
          value = fn.prototype;
        }
      } else if (name === "%AsyncIteratorPrototype%") {
        var gen = doEval2("%AsyncGenerator%");
        if (gen && getProto) {
          value = getProto(gen.prototype);
        }
      }
      INTRINSICS[name] = value;
      return value;
    };
    var LEGACY_ALIASES = {
      __proto__: null,
      "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
      "%ArrayPrototype%": ["Array", "prototype"],
      "%ArrayProto_entries%": ["Array", "prototype", "entries"],
      "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
      "%ArrayProto_keys%": ["Array", "prototype", "keys"],
      "%ArrayProto_values%": ["Array", "prototype", "values"],
      "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
      "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
      "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
      "%BooleanPrototype%": ["Boolean", "prototype"],
      "%DataViewPrototype%": ["DataView", "prototype"],
      "%DatePrototype%": ["Date", "prototype"],
      "%ErrorPrototype%": ["Error", "prototype"],
      "%EvalErrorPrototype%": ["EvalError", "prototype"],
      "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
      "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
      "%FunctionPrototype%": ["Function", "prototype"],
      "%Generator%": ["GeneratorFunction", "prototype"],
      "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
      "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
      "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
      "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
      "%JSONParse%": ["JSON", "parse"],
      "%JSONStringify%": ["JSON", "stringify"],
      "%MapPrototype%": ["Map", "prototype"],
      "%NumberPrototype%": ["Number", "prototype"],
      "%ObjectPrototype%": ["Object", "prototype"],
      "%ObjProto_toString%": ["Object", "prototype", "toString"],
      "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
      "%PromisePrototype%": ["Promise", "prototype"],
      "%PromiseProto_then%": ["Promise", "prototype", "then"],
      "%Promise_all%": ["Promise", "all"],
      "%Promise_reject%": ["Promise", "reject"],
      "%Promise_resolve%": ["Promise", "resolve"],
      "%RangeErrorPrototype%": ["RangeError", "prototype"],
      "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
      "%RegExpPrototype%": ["RegExp", "prototype"],
      "%SetPrototype%": ["Set", "prototype"],
      "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
      "%StringPrototype%": ["String", "prototype"],
      "%SymbolPrototype%": ["Symbol", "prototype"],
      "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
      "%TypedArrayPrototype%": ["TypedArray", "prototype"],
      "%TypeErrorPrototype%": ["TypeError", "prototype"],
      "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
      "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
      "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
      "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
      "%URIErrorPrototype%": ["URIError", "prototype"],
      "%WeakMapPrototype%": ["WeakMap", "prototype"],
      "%WeakSetPrototype%": ["WeakSet", "prototype"]
    };
    var bind = require_function_bind();
    var hasOwn = require_hasown();
    var $concat = bind.call($call, Array.prototype.concat);
    var $spliceApply = bind.call($apply, Array.prototype.splice);
    var $replace = bind.call($call, String.prototype.replace);
    var $strSlice = bind.call($call, String.prototype.slice);
    var $exec = bind.call($call, RegExp.prototype.exec);
    var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
    var reEscapeChar = /\\(\\)?/g;
    var stringToPath = function stringToPath2(string) {
      var first = $strSlice(string, 0, 1);
      var last = $strSlice(string, -1);
      if (first === "%" && last !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected closing `%`");
      } else if (last === "%" && first !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected opening `%`");
      }
      var result = [];
      $replace(string, rePropName, function(match, number, quote, subString) {
        result[result.length] = quote ? $replace(subString, reEscapeChar, "$1") : number || match;
      });
      return result;
    };
    var getBaseIntrinsic = function getBaseIntrinsic2(name, allowMissing) {
      var intrinsicName = name;
      var alias;
      if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
        alias = LEGACY_ALIASES[intrinsicName];
        intrinsicName = "%" + alias[0] + "%";
      }
      if (hasOwn(INTRINSICS, intrinsicName)) {
        var value = INTRINSICS[intrinsicName];
        if (value === needsEval) {
          value = doEval(intrinsicName);
        }
        if (typeof value === "undefined" && !allowMissing) {
          throw new $TypeError("intrinsic " + name + " exists, but is not available. Please file an issue!");
        }
        return {
          alias,
          name: intrinsicName,
          value
        };
      }
      throw new $SyntaxError("intrinsic " + name + " does not exist!");
    };
    module2.exports = function GetIntrinsic(name, allowMissing) {
      if (typeof name !== "string" || name.length === 0) {
        throw new $TypeError("intrinsic name must be a non-empty string");
      }
      if (arguments.length > 1 && typeof allowMissing !== "boolean") {
        throw new $TypeError('"allowMissing" argument must be a boolean');
      }
      if ($exec(/^%?[^%]*%?$/, name) === null) {
        throw new $SyntaxError("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
      }
      var parts = stringToPath(name);
      var intrinsicBaseName = parts.length > 0 ? parts[0] : "";
      var intrinsic = getBaseIntrinsic("%" + intrinsicBaseName + "%", allowMissing);
      var intrinsicRealName = intrinsic.name;
      var value = intrinsic.value;
      var skipFurtherCaching = false;
      var alias = intrinsic.alias;
      if (alias) {
        intrinsicBaseName = alias[0];
        $spliceApply(parts, $concat([0, 1], alias));
      }
      for (var i = 1, isOwn = true; i < parts.length; i += 1) {
        var part = parts[i];
        var first = $strSlice(part, 0, 1);
        var last = $strSlice(part, -1);
        if ((first === '"' || first === "'" || first === "`" || (last === '"' || last === "'" || last === "`")) && first !== last) {
          throw new $SyntaxError("property names with quotes must have matching quotes");
        }
        if (part === "constructor" || !isOwn) {
          skipFurtherCaching = true;
        }
        intrinsicBaseName += "." + part;
        intrinsicRealName = "%" + intrinsicBaseName + "%";
        if (hasOwn(INTRINSICS, intrinsicRealName)) {
          value = INTRINSICS[intrinsicRealName];
        } else if (value != null) {
          if (!(part in value)) {
            if (!allowMissing) {
              throw new $TypeError("base intrinsic for " + name + " exists, but the property is not available.");
            }
            return void undefined2;
          }
          if ($gOPD && i + 1 >= parts.length) {
            var desc = $gOPD(value, part);
            isOwn = !!desc;
            if (isOwn && "get" in desc && !("originalValue" in desc.get)) {
              value = desc.get;
            } else {
              value = value[part];
            }
          } else {
            isOwn = hasOwn(value, part);
            value = value[part];
          }
          if (isOwn && !skipFurtherCaching) {
            INTRINSICS[intrinsicRealName] = value;
          }
        }
      }
      return value;
    };
  }
});

// netlify/functions/node_modules/call-bound/index.js
var require_call_bound = __commonJS({
  "netlify/functions/node_modules/call-bound/index.js"(exports2, module2) {
    "use strict";
    var GetIntrinsic = require_get_intrinsic();
    var callBindBasic = require_call_bind_apply_helpers();
    var $indexOf = callBindBasic([GetIntrinsic("%String.prototype.indexOf%")]);
    module2.exports = function callBoundIntrinsic(name, allowMissing) {
      var intrinsic = (
        /** @type {(this: unknown, ...args: unknown[]) => unknown} */
        GetIntrinsic(name, !!allowMissing)
      );
      if (typeof intrinsic === "function" && $indexOf(name, ".prototype.") > -1) {
        return callBindBasic(
          /** @type {const} */
          [intrinsic]
        );
      }
      return intrinsic;
    };
  }
});

// netlify/functions/node_modules/side-channel-map/index.js
var require_side_channel_map = __commonJS({
  "netlify/functions/node_modules/side-channel-map/index.js"(exports2, module2) {
    "use strict";
    var GetIntrinsic = require_get_intrinsic();
    var callBound = require_call_bound();
    var inspect = require_object_inspect();
    var $TypeError = require_type();
    var $Map = GetIntrinsic("%Map%", true);
    var $mapGet = callBound("Map.prototype.get", true);
    var $mapSet = callBound("Map.prototype.set", true);
    var $mapHas = callBound("Map.prototype.has", true);
    var $mapDelete = callBound("Map.prototype.delete", true);
    var $mapSize = callBound("Map.prototype.size", true);
    module2.exports = !!$Map && /** @type {Exclude<import('.'), false>} */
    function getSideChannelMap() {
      var $m;
      var channel = {
        assert: function(key) {
          if (!channel.has(key)) {
            throw new $TypeError("Side channel does not contain " + inspect(key));
          }
        },
        "delete": function(key) {
          if ($m) {
            var result = $mapDelete($m, key);
            if ($mapSize($m) === 0) {
              $m = void 0;
            }
            return result;
          }
          return false;
        },
        get: function(key) {
          if ($m) {
            return $mapGet($m, key);
          }
        },
        has: function(key) {
          if ($m) {
            return $mapHas($m, key);
          }
          return false;
        },
        set: function(key, value) {
          if (!$m) {
            $m = new $Map();
          }
          $mapSet($m, key, value);
        }
      };
      return channel;
    };
  }
});

// netlify/functions/node_modules/side-channel-weakmap/index.js
var require_side_channel_weakmap = __commonJS({
  "netlify/functions/node_modules/side-channel-weakmap/index.js"(exports2, module2) {
    "use strict";
    var GetIntrinsic = require_get_intrinsic();
    var callBound = require_call_bound();
    var inspect = require_object_inspect();
    var getSideChannelMap = require_side_channel_map();
    var $TypeError = require_type();
    var $WeakMap = GetIntrinsic("%WeakMap%", true);
    var $weakMapGet = callBound("WeakMap.prototype.get", true);
    var $weakMapSet = callBound("WeakMap.prototype.set", true);
    var $weakMapHas = callBound("WeakMap.prototype.has", true);
    var $weakMapDelete = callBound("WeakMap.prototype.delete", true);
    module2.exports = $WeakMap ? (
      /** @type {Exclude<import('.'), false>} */
      function getSideChannelWeakMap() {
        var $wm;
        var $m;
        var channel = {
          assert: function(key) {
            if (!channel.has(key)) {
              throw new $TypeError("Side channel does not contain " + inspect(key));
            }
          },
          "delete": function(key) {
            if ($WeakMap && key && (typeof key === "object" || typeof key === "function")) {
              if ($wm) {
                return $weakMapDelete($wm, key);
              }
            } else if (getSideChannelMap) {
              if ($m) {
                return $m["delete"](key);
              }
            }
            return false;
          },
          get: function(key) {
            if ($WeakMap && key && (typeof key === "object" || typeof key === "function")) {
              if ($wm) {
                return $weakMapGet($wm, key);
              }
            }
            return $m && $m.get(key);
          },
          has: function(key) {
            if ($WeakMap && key && (typeof key === "object" || typeof key === "function")) {
              if ($wm) {
                return $weakMapHas($wm, key);
              }
            }
            return !!$m && $m.has(key);
          },
          set: function(key, value) {
            if ($WeakMap && key && (typeof key === "object" || typeof key === "function")) {
              if (!$wm) {
                $wm = new $WeakMap();
              }
              $weakMapSet($wm, key, value);
            } else if (getSideChannelMap) {
              if (!$m) {
                $m = getSideChannelMap();
              }
              $m.set(key, value);
            }
          }
        };
        return channel;
      }
    ) : getSideChannelMap;
  }
});

// netlify/functions/node_modules/side-channel/index.js
var require_side_channel = __commonJS({
  "netlify/functions/node_modules/side-channel/index.js"(exports2, module2) {
    "use strict";
    var $TypeError = require_type();
    var inspect = require_object_inspect();
    var getSideChannelList = require_side_channel_list();
    var getSideChannelMap = require_side_channel_map();
    var getSideChannelWeakMap = require_side_channel_weakmap();
    var makeChannel = getSideChannelWeakMap || getSideChannelMap || getSideChannelList;
    module2.exports = function getSideChannel() {
      var $channelData;
      var channel = {
        assert: function(key) {
          if (!channel.has(key)) {
            throw new $TypeError("Side channel does not contain " + inspect(key));
          }
        },
        "delete": function(key) {
          return !!$channelData && $channelData["delete"](key);
        },
        get: function(key) {
          return $channelData && $channelData.get(key);
        },
        has: function(key) {
          return !!$channelData && $channelData.has(key);
        },
        set: function(key, value) {
          if (!$channelData) {
            $channelData = makeChannel();
          }
          $channelData.set(key, value);
        }
      };
      return channel;
    };
  }
});

// netlify/functions/node_modules/qs/lib/formats.js
var require_formats = __commonJS({
  "netlify/functions/node_modules/qs/lib/formats.js"(exports2, module2) {
    "use strict";
    var replace = String.prototype.replace;
    var percentTwenties = /%20/g;
    var Format = {
      RFC1738: "RFC1738",
      RFC3986: "RFC3986"
    };
    module2.exports = {
      "default": Format.RFC3986,
      formatters: {
        RFC1738: function(value) {
          return replace.call(value, percentTwenties, "+");
        },
        RFC3986: function(value) {
          return String(value);
        }
      },
      RFC1738: Format.RFC1738,
      RFC3986: Format.RFC3986
    };
  }
});

// netlify/functions/node_modules/qs/lib/utils.js
var require_utils2 = __commonJS({
  "netlify/functions/node_modules/qs/lib/utils.js"(exports2, module2) {
    "use strict";
    var formats = require_formats();
    var getSideChannel = require_side_channel();
    var has = Object.prototype.hasOwnProperty;
    var isArray = Array.isArray;
    var overflowChannel = getSideChannel();
    var markOverflow = function markOverflow2(obj, maxIndex) {
      overflowChannel.set(obj, maxIndex);
      return obj;
    };
    var isOverflow = function isOverflow2(obj) {
      return overflowChannel.has(obj);
    };
    var getMaxIndex = function getMaxIndex2(obj) {
      return overflowChannel.get(obj);
    };
    var setMaxIndex = function setMaxIndex2(obj, maxIndex) {
      overflowChannel.set(obj, maxIndex);
    };
    var hexTable = (function() {
      var array = [];
      for (var i = 0; i < 256; ++i) {
        array.push("%" + ((i < 16 ? "0" : "") + i.toString(16)).toUpperCase());
      }
      return array;
    })();
    var compactQueue = function compactQueue2(queue) {
      while (queue.length > 1) {
        var item = queue.pop();
        var obj = item.obj[item.prop];
        if (isArray(obj)) {
          var compacted = [];
          for (var j = 0; j < obj.length; ++j) {
            if (typeof obj[j] !== "undefined") {
              compacted.push(obj[j]);
            }
          }
          item.obj[item.prop] = compacted;
        }
      }
    };
    var arrayToObject = function arrayToObject2(source, options) {
      var obj = options && options.plainObjects ? { __proto__: null } : {};
      for (var i = 0; i < source.length; ++i) {
        if (typeof source[i] !== "undefined") {
          obj[i] = source[i];
        }
      }
      return obj;
    };
    var merge = function merge2(target, source, options) {
      if (!source) {
        return target;
      }
      if (typeof source !== "object" && typeof source !== "function") {
        if (isArray(target)) {
          target.push(source);
        } else if (target && typeof target === "object") {
          if (isOverflow(target)) {
            var newIndex = getMaxIndex(target) + 1;
            target[newIndex] = source;
            setMaxIndex(target, newIndex);
          } else if (options && (options.plainObjects || options.allowPrototypes) || !has.call(Object.prototype, source)) {
            target[source] = true;
          }
        } else {
          return [target, source];
        }
        return target;
      }
      if (!target || typeof target !== "object") {
        if (isOverflow(source)) {
          var sourceKeys = Object.keys(source);
          var result = options && options.plainObjects ? { __proto__: null, 0: target } : { 0: target };
          for (var m = 0; m < sourceKeys.length; m++) {
            var oldKey = parseInt(sourceKeys[m], 10);
            result[oldKey + 1] = source[sourceKeys[m]];
          }
          return markOverflow(result, getMaxIndex(source) + 1);
        }
        return [target].concat(source);
      }
      var mergeTarget = target;
      if (isArray(target) && !isArray(source)) {
        mergeTarget = arrayToObject(target, options);
      }
      if (isArray(target) && isArray(source)) {
        source.forEach(function(item, i) {
          if (has.call(target, i)) {
            var targetItem = target[i];
            if (targetItem && typeof targetItem === "object" && item && typeof item === "object") {
              target[i] = merge2(targetItem, item, options);
            } else {
              target.push(item);
            }
          } else {
            target[i] = item;
          }
        });
        return target;
      }
      return Object.keys(source).reduce(function(acc, key) {
        var value = source[key];
        if (has.call(acc, key)) {
          acc[key] = merge2(acc[key], value, options);
        } else {
          acc[key] = value;
        }
        return acc;
      }, mergeTarget);
    };
    var assign = function assignSingleSource(target, source) {
      return Object.keys(source).reduce(function(acc, key) {
        acc[key] = source[key];
        return acc;
      }, target);
    };
    var decode = function(str, defaultDecoder, charset) {
      var strWithoutPlus = str.replace(/\+/g, " ");
      if (charset === "iso-8859-1") {
        return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape);
      }
      try {
        return decodeURIComponent(strWithoutPlus);
      } catch (e) {
        return strWithoutPlus;
      }
    };
    var limit = 1024;
    var encode = function encode2(str, defaultEncoder, charset, kind, format) {
      if (str.length === 0) {
        return str;
      }
      var string = str;
      if (typeof str === "symbol") {
        string = Symbol.prototype.toString.call(str);
      } else if (typeof str !== "string") {
        string = String(str);
      }
      if (charset === "iso-8859-1") {
        return escape(string).replace(/%u[0-9a-f]{4}/gi, function($0) {
          return "%26%23" + parseInt($0.slice(2), 16) + "%3B";
        });
      }
      var out = "";
      for (var j = 0; j < string.length; j += limit) {
        var segment = string.length >= limit ? string.slice(j, j + limit) : string;
        var arr = [];
        for (var i = 0; i < segment.length; ++i) {
          var c = segment.charCodeAt(i);
          if (c === 45 || c === 46 || c === 95 || c === 126 || c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122 || format === formats.RFC1738 && (c === 40 || c === 41)) {
            arr[arr.length] = segment.charAt(i);
            continue;
          }
          if (c < 128) {
            arr[arr.length] = hexTable[c];
            continue;
          }
          if (c < 2048) {
            arr[arr.length] = hexTable[192 | c >> 6] + hexTable[128 | c & 63];
            continue;
          }
          if (c < 55296 || c >= 57344) {
            arr[arr.length] = hexTable[224 | c >> 12] + hexTable[128 | c >> 6 & 63] + hexTable[128 | c & 63];
            continue;
          }
          i += 1;
          c = 65536 + ((c & 1023) << 10 | segment.charCodeAt(i) & 1023);
          arr[arr.length] = hexTable[240 | c >> 18] + hexTable[128 | c >> 12 & 63] + hexTable[128 | c >> 6 & 63] + hexTable[128 | c & 63];
        }
        out += arr.join("");
      }
      return out;
    };
    var compact = function compact2(value) {
      var queue = [{ obj: { o: value }, prop: "o" }];
      var refs = [];
      for (var i = 0; i < queue.length; ++i) {
        var item = queue[i];
        var obj = item.obj[item.prop];
        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; ++j) {
          var key = keys[j];
          var val = obj[key];
          if (typeof val === "object" && val !== null && refs.indexOf(val) === -1) {
            queue.push({ obj, prop: key });
            refs.push(val);
          }
        }
      }
      compactQueue(queue);
      return value;
    };
    var isRegExp = function isRegExp2(obj) {
      return Object.prototype.toString.call(obj) === "[object RegExp]";
    };
    var isBuffer = function isBuffer2(obj) {
      if (!obj || typeof obj !== "object") {
        return false;
      }
      return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
    };
    var combine = function combine2(a, b, arrayLimit, plainObjects) {
      if (isOverflow(a)) {
        var newIndex = getMaxIndex(a) + 1;
        a[newIndex] = b;
        setMaxIndex(a, newIndex);
        return a;
      }
      var result = [].concat(a, b);
      if (result.length > arrayLimit) {
        return markOverflow(arrayToObject(result, { plainObjects }), result.length - 1);
      }
      return result;
    };
    var maybeMap = function maybeMap2(val, fn) {
      if (isArray(val)) {
        var mapped = [];
        for (var i = 0; i < val.length; i += 1) {
          mapped.push(fn(val[i]));
        }
        return mapped;
      }
      return fn(val);
    };
    module2.exports = {
      arrayToObject,
      assign,
      combine,
      compact,
      decode,
      encode,
      isBuffer,
      isOverflow,
      isRegExp,
      maybeMap,
      merge
    };
  }
});

// netlify/functions/node_modules/qs/lib/stringify.js
var require_stringify = __commonJS({
  "netlify/functions/node_modules/qs/lib/stringify.js"(exports2, module2) {
    "use strict";
    var getSideChannel = require_side_channel();
    var utils2 = require_utils2();
    var formats = require_formats();
    var has = Object.prototype.hasOwnProperty;
    var arrayPrefixGenerators = {
      brackets: function brackets(prefix) {
        return prefix + "[]";
      },
      comma: "comma",
      indices: function indices(prefix, key) {
        return prefix + "[" + key + "]";
      },
      repeat: function repeat(prefix) {
        return prefix;
      }
    };
    var isArray = Array.isArray;
    var push = Array.prototype.push;
    var pushToArray = function(arr, valueOrArray) {
      push.apply(arr, isArray(valueOrArray) ? valueOrArray : [valueOrArray]);
    };
    var toISO = Date.prototype.toISOString;
    var defaultFormat = formats["default"];
    var defaults = {
      addQueryPrefix: false,
      allowDots: false,
      allowEmptyArrays: false,
      arrayFormat: "indices",
      charset: "utf-8",
      charsetSentinel: false,
      commaRoundTrip: false,
      delimiter: "&",
      encode: true,
      encodeDotInKeys: false,
      encoder: utils2.encode,
      encodeValuesOnly: false,
      filter: void 0,
      format: defaultFormat,
      formatter: formats.formatters[defaultFormat],
      // deprecated
      indices: false,
      serializeDate: function serializeDate(date) {
        return toISO.call(date);
      },
      skipNulls: false,
      strictNullHandling: false
    };
    var isNonNullishPrimitive = function isNonNullishPrimitive2(v) {
      return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || typeof v === "symbol" || typeof v === "bigint";
    };
    var sentinel = {};
    var stringify = function stringify2(object, prefix, generateArrayPrefix, commaRoundTrip, allowEmptyArrays, strictNullHandling, skipNulls, encodeDotInKeys, encoder, filter, sort, allowDots, serializeDate, format, formatter, encodeValuesOnly, charset, sideChannel) {
      var obj = object;
      var tmpSc = sideChannel;
      var step = 0;
      var findFlag = false;
      while ((tmpSc = tmpSc.get(sentinel)) !== void 0 && !findFlag) {
        var pos = tmpSc.get(object);
        step += 1;
        if (typeof pos !== "undefined") {
          if (pos === step) {
            throw new RangeError("Cyclic object value");
          } else {
            findFlag = true;
          }
        }
        if (typeof tmpSc.get(sentinel) === "undefined") {
          step = 0;
        }
      }
      if (typeof filter === "function") {
        obj = filter(prefix, obj);
      } else if (obj instanceof Date) {
        obj = serializeDate(obj);
      } else if (generateArrayPrefix === "comma" && isArray(obj)) {
        obj = utils2.maybeMap(obj, function(value2) {
          if (value2 instanceof Date) {
            return serializeDate(value2);
          }
          return value2;
        });
      }
      if (obj === null) {
        if (strictNullHandling) {
          return encoder && !encodeValuesOnly ? encoder(prefix, defaults.encoder, charset, "key", format) : prefix;
        }
        obj = "";
      }
      if (isNonNullishPrimitive(obj) || utils2.isBuffer(obj)) {
        if (encoder) {
          var keyValue = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, "key", format);
          return [formatter(keyValue) + "=" + formatter(encoder(obj, defaults.encoder, charset, "value", format))];
        }
        return [formatter(prefix) + "=" + formatter(String(obj))];
      }
      var values = [];
      if (typeof obj === "undefined") {
        return values;
      }
      var objKeys;
      if (generateArrayPrefix === "comma" && isArray(obj)) {
        if (encodeValuesOnly && encoder) {
          obj = utils2.maybeMap(obj, encoder);
        }
        objKeys = [{ value: obj.length > 0 ? obj.join(",") || null : void 0 }];
      } else if (isArray(filter)) {
        objKeys = filter;
      } else {
        var keys = Object.keys(obj);
        objKeys = sort ? keys.sort(sort) : keys;
      }
      var encodedPrefix = encodeDotInKeys ? String(prefix).replace(/\./g, "%2E") : String(prefix);
      var adjustedPrefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? encodedPrefix + "[]" : encodedPrefix;
      if (allowEmptyArrays && isArray(obj) && obj.length === 0) {
        return adjustedPrefix + "[]";
      }
      for (var j = 0; j < objKeys.length; ++j) {
        var key = objKeys[j];
        var value = typeof key === "object" && key && typeof key.value !== "undefined" ? key.value : obj[key];
        if (skipNulls && value === null) {
          continue;
        }
        var encodedKey = allowDots && encodeDotInKeys ? String(key).replace(/\./g, "%2E") : String(key);
        var keyPrefix = isArray(obj) ? typeof generateArrayPrefix === "function" ? generateArrayPrefix(adjustedPrefix, encodedKey) : adjustedPrefix : adjustedPrefix + (allowDots ? "." + encodedKey : "[" + encodedKey + "]");
        sideChannel.set(object, step);
        var valueSideChannel = getSideChannel();
        valueSideChannel.set(sentinel, sideChannel);
        pushToArray(values, stringify2(
          value,
          keyPrefix,
          generateArrayPrefix,
          commaRoundTrip,
          allowEmptyArrays,
          strictNullHandling,
          skipNulls,
          encodeDotInKeys,
          generateArrayPrefix === "comma" && encodeValuesOnly && isArray(obj) ? null : encoder,
          filter,
          sort,
          allowDots,
          serializeDate,
          format,
          formatter,
          encodeValuesOnly,
          charset,
          valueSideChannel
        ));
      }
      return values;
    };
    var normalizeStringifyOptions = function normalizeStringifyOptions2(opts) {
      if (!opts) {
        return defaults;
      }
      if (typeof opts.allowEmptyArrays !== "undefined" && typeof opts.allowEmptyArrays !== "boolean") {
        throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
      }
      if (typeof opts.encodeDotInKeys !== "undefined" && typeof opts.encodeDotInKeys !== "boolean") {
        throw new TypeError("`encodeDotInKeys` option can only be `true` or `false`, when provided");
      }
      if (opts.encoder !== null && typeof opts.encoder !== "undefined" && typeof opts.encoder !== "function") {
        throw new TypeError("Encoder has to be a function.");
      }
      var charset = opts.charset || defaults.charset;
      if (typeof opts.charset !== "undefined" && opts.charset !== "utf-8" && opts.charset !== "iso-8859-1") {
        throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
      }
      var format = formats["default"];
      if (typeof opts.format !== "undefined") {
        if (!has.call(formats.formatters, opts.format)) {
          throw new TypeError("Unknown format option provided.");
        }
        format = opts.format;
      }
      var formatter = formats.formatters[format];
      var filter = defaults.filter;
      if (typeof opts.filter === "function" || isArray(opts.filter)) {
        filter = opts.filter;
      }
      var arrayFormat;
      if (opts.arrayFormat in arrayPrefixGenerators) {
        arrayFormat = opts.arrayFormat;
      } else if ("indices" in opts) {
        arrayFormat = opts.indices ? "indices" : "repeat";
      } else {
        arrayFormat = defaults.arrayFormat;
      }
      if ("commaRoundTrip" in opts && typeof opts.commaRoundTrip !== "boolean") {
        throw new TypeError("`commaRoundTrip` must be a boolean, or absent");
      }
      var allowDots = typeof opts.allowDots === "undefined" ? opts.encodeDotInKeys === true ? true : defaults.allowDots : !!opts.allowDots;
      return {
        addQueryPrefix: typeof opts.addQueryPrefix === "boolean" ? opts.addQueryPrefix : defaults.addQueryPrefix,
        allowDots,
        allowEmptyArrays: typeof opts.allowEmptyArrays === "boolean" ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
        arrayFormat,
        charset,
        charsetSentinel: typeof opts.charsetSentinel === "boolean" ? opts.charsetSentinel : defaults.charsetSentinel,
        commaRoundTrip: !!opts.commaRoundTrip,
        delimiter: typeof opts.delimiter === "undefined" ? defaults.delimiter : opts.delimiter,
        encode: typeof opts.encode === "boolean" ? opts.encode : defaults.encode,
        encodeDotInKeys: typeof opts.encodeDotInKeys === "boolean" ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
        encoder: typeof opts.encoder === "function" ? opts.encoder : defaults.encoder,
        encodeValuesOnly: typeof opts.encodeValuesOnly === "boolean" ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
        filter,
        format,
        formatter,
        serializeDate: typeof opts.serializeDate === "function" ? opts.serializeDate : defaults.serializeDate,
        skipNulls: typeof opts.skipNulls === "boolean" ? opts.skipNulls : defaults.skipNulls,
        sort: typeof opts.sort === "function" ? opts.sort : null,
        strictNullHandling: typeof opts.strictNullHandling === "boolean" ? opts.strictNullHandling : defaults.strictNullHandling
      };
    };
    module2.exports = function(object, opts) {
      var obj = object;
      var options = normalizeStringifyOptions(opts);
      var objKeys;
      var filter;
      if (typeof options.filter === "function") {
        filter = options.filter;
        obj = filter("", obj);
      } else if (isArray(options.filter)) {
        filter = options.filter;
        objKeys = filter;
      }
      var keys = [];
      if (typeof obj !== "object" || obj === null) {
        return "";
      }
      var generateArrayPrefix = arrayPrefixGenerators[options.arrayFormat];
      var commaRoundTrip = generateArrayPrefix === "comma" && options.commaRoundTrip;
      if (!objKeys) {
        objKeys = Object.keys(obj);
      }
      if (options.sort) {
        objKeys.sort(options.sort);
      }
      var sideChannel = getSideChannel();
      for (var i = 0; i < objKeys.length; ++i) {
        var key = objKeys[i];
        var value = obj[key];
        if (options.skipNulls && value === null) {
          continue;
        }
        pushToArray(keys, stringify(
          value,
          key,
          generateArrayPrefix,
          commaRoundTrip,
          options.allowEmptyArrays,
          options.strictNullHandling,
          options.skipNulls,
          options.encodeDotInKeys,
          options.encode ? options.encoder : null,
          options.filter,
          options.sort,
          options.allowDots,
          options.serializeDate,
          options.format,
          options.formatter,
          options.encodeValuesOnly,
          options.charset,
          sideChannel
        ));
      }
      var joined = keys.join(options.delimiter);
      var prefix = options.addQueryPrefix === true ? "?" : "";
      if (options.charsetSentinel) {
        if (options.charset === "iso-8859-1") {
          prefix += "utf8=%26%2310003%3B&";
        } else {
          prefix += "utf8=%E2%9C%93&";
        }
      }
      return joined.length > 0 ? prefix + joined : "";
    };
  }
});

// netlify/functions/node_modules/qs/lib/parse.js
var require_parse = __commonJS({
  "netlify/functions/node_modules/qs/lib/parse.js"(exports2, module2) {
    "use strict";
    var utils2 = require_utils2();
    var has = Object.prototype.hasOwnProperty;
    var isArray = Array.isArray;
    var defaults = {
      allowDots: false,
      allowEmptyArrays: false,
      allowPrototypes: false,
      allowSparse: false,
      arrayLimit: 20,
      charset: "utf-8",
      charsetSentinel: false,
      comma: false,
      decodeDotInKeys: false,
      decoder: utils2.decode,
      delimiter: "&",
      depth: 5,
      duplicates: "combine",
      ignoreQueryPrefix: false,
      interpretNumericEntities: false,
      parameterLimit: 1e3,
      parseArrays: true,
      plainObjects: false,
      strictDepth: false,
      strictNullHandling: false,
      throwOnLimitExceeded: false
    };
    var interpretNumericEntities = function(str) {
      return str.replace(/&#(\d+);/g, function($0, numberStr) {
        return String.fromCharCode(parseInt(numberStr, 10));
      });
    };
    var parseArrayValue = function(val, options, currentArrayLength) {
      if (val && typeof val === "string" && options.comma && val.indexOf(",") > -1) {
        return val.split(",");
      }
      if (options.throwOnLimitExceeded && currentArrayLength >= options.arrayLimit) {
        throw new RangeError("Array limit exceeded. Only " + options.arrayLimit + " element" + (options.arrayLimit === 1 ? "" : "s") + " allowed in an array.");
      }
      return val;
    };
    var isoSentinel = "utf8=%26%2310003%3B";
    var charsetSentinel = "utf8=%E2%9C%93";
    var parseValues = function parseQueryStringValues(str, options) {
      var obj = { __proto__: null };
      var cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, "") : str;
      cleanStr = cleanStr.replace(/%5B/gi, "[").replace(/%5D/gi, "]");
      var limit = options.parameterLimit === Infinity ? void 0 : options.parameterLimit;
      var parts = cleanStr.split(
        options.delimiter,
        options.throwOnLimitExceeded ? limit + 1 : limit
      );
      if (options.throwOnLimitExceeded && parts.length > limit) {
        throw new RangeError("Parameter limit exceeded. Only " + limit + " parameter" + (limit === 1 ? "" : "s") + " allowed.");
      }
      var skipIndex = -1;
      var i;
      var charset = options.charset;
      if (options.charsetSentinel) {
        for (i = 0; i < parts.length; ++i) {
          if (parts[i].indexOf("utf8=") === 0) {
            if (parts[i] === charsetSentinel) {
              charset = "utf-8";
            } else if (parts[i] === isoSentinel) {
              charset = "iso-8859-1";
            }
            skipIndex = i;
            i = parts.length;
          }
        }
      }
      for (i = 0; i < parts.length; ++i) {
        if (i === skipIndex) {
          continue;
        }
        var part = parts[i];
        var bracketEqualsPos = part.indexOf("]=");
        var pos = bracketEqualsPos === -1 ? part.indexOf("=") : bracketEqualsPos + 1;
        var key;
        var val;
        if (pos === -1) {
          key = options.decoder(part, defaults.decoder, charset, "key");
          val = options.strictNullHandling ? null : "";
        } else {
          key = options.decoder(part.slice(0, pos), defaults.decoder, charset, "key");
          if (key !== null) {
            val = utils2.maybeMap(
              parseArrayValue(
                part.slice(pos + 1),
                options,
                isArray(obj[key]) ? obj[key].length : 0
              ),
              function(encodedVal) {
                return options.decoder(encodedVal, defaults.decoder, charset, "value");
              }
            );
          }
        }
        if (val && options.interpretNumericEntities && charset === "iso-8859-1") {
          val = interpretNumericEntities(String(val));
        }
        if (part.indexOf("[]=") > -1) {
          val = isArray(val) ? [val] : val;
        }
        if (key !== null) {
          var existing = has.call(obj, key);
          if (existing && options.duplicates === "combine") {
            obj[key] = utils2.combine(
              obj[key],
              val,
              options.arrayLimit,
              options.plainObjects
            );
          } else if (!existing || options.duplicates === "last") {
            obj[key] = val;
          }
        }
      }
      return obj;
    };
    var parseObject = function(chain, val, options, valuesParsed) {
      var currentArrayLength = 0;
      if (chain.length > 0 && chain[chain.length - 1] === "[]") {
        var parentKey = chain.slice(0, -1).join("");
        currentArrayLength = Array.isArray(val) && val[parentKey] ? val[parentKey].length : 0;
      }
      var leaf = valuesParsed ? val : parseArrayValue(val, options, currentArrayLength);
      for (var i = chain.length - 1; i >= 0; --i) {
        var obj;
        var root = chain[i];
        if (root === "[]" && options.parseArrays) {
          if (utils2.isOverflow(leaf)) {
            obj = leaf;
          } else {
            obj = options.allowEmptyArrays && (leaf === "" || options.strictNullHandling && leaf === null) ? [] : utils2.combine(
              [],
              leaf,
              options.arrayLimit,
              options.plainObjects
            );
          }
        } else {
          obj = options.plainObjects ? { __proto__: null } : {};
          var cleanRoot = root.charAt(0) === "[" && root.charAt(root.length - 1) === "]" ? root.slice(1, -1) : root;
          var decodedRoot = options.decodeDotInKeys ? cleanRoot.replace(/%2E/g, ".") : cleanRoot;
          var index = parseInt(decodedRoot, 10);
          if (!options.parseArrays && decodedRoot === "") {
            obj = { 0: leaf };
          } else if (!isNaN(index) && root !== decodedRoot && String(index) === decodedRoot && index >= 0 && (options.parseArrays && index <= options.arrayLimit)) {
            obj = [];
            obj[index] = leaf;
          } else if (decodedRoot !== "__proto__") {
            obj[decodedRoot] = leaf;
          }
        }
        leaf = obj;
      }
      return leaf;
    };
    var splitKeyIntoSegments = function splitKeyIntoSegments2(givenKey, options) {
      var key = options.allowDots ? givenKey.replace(/\.([^.[]+)/g, "[$1]") : givenKey;
      if (options.depth <= 0) {
        if (!options.plainObjects && has.call(Object.prototype, key)) {
          if (!options.allowPrototypes) {
            return;
          }
        }
        return [key];
      }
      var brackets = /(\[[^[\]]*])/;
      var child = /(\[[^[\]]*])/g;
      var segment = brackets.exec(key);
      var parent = segment ? key.slice(0, segment.index) : key;
      var keys = [];
      if (parent) {
        if (!options.plainObjects && has.call(Object.prototype, parent)) {
          if (!options.allowPrototypes) {
            return;
          }
        }
        keys.push(parent);
      }
      var i = 0;
      while ((segment = child.exec(key)) !== null && i < options.depth) {
        i += 1;
        var segmentContent = segment[1].slice(1, -1);
        if (!options.plainObjects && has.call(Object.prototype, segmentContent)) {
          if (!options.allowPrototypes) {
            return;
          }
        }
        keys.push(segment[1]);
      }
      if (segment) {
        if (options.strictDepth === true) {
          throw new RangeError("Input depth exceeded depth option of " + options.depth + " and strictDepth is true");
        }
        keys.push("[" + key.slice(segment.index) + "]");
      }
      return keys;
    };
    var parseKeys = function parseQueryStringKeys(givenKey, val, options, valuesParsed) {
      if (!givenKey) {
        return;
      }
      var keys = splitKeyIntoSegments(givenKey, options);
      if (!keys) {
        return;
      }
      return parseObject(keys, val, options, valuesParsed);
    };
    var normalizeParseOptions = function normalizeParseOptions2(opts) {
      if (!opts) {
        return defaults;
      }
      if (typeof opts.allowEmptyArrays !== "undefined" && typeof opts.allowEmptyArrays !== "boolean") {
        throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
      }
      if (typeof opts.decodeDotInKeys !== "undefined" && typeof opts.decodeDotInKeys !== "boolean") {
        throw new TypeError("`decodeDotInKeys` option can only be `true` or `false`, when provided");
      }
      if (opts.decoder !== null && typeof opts.decoder !== "undefined" && typeof opts.decoder !== "function") {
        throw new TypeError("Decoder has to be a function.");
      }
      if (typeof opts.charset !== "undefined" && opts.charset !== "utf-8" && opts.charset !== "iso-8859-1") {
        throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
      }
      if (typeof opts.throwOnLimitExceeded !== "undefined" && typeof opts.throwOnLimitExceeded !== "boolean") {
        throw new TypeError("`throwOnLimitExceeded` option must be a boolean");
      }
      var charset = typeof opts.charset === "undefined" ? defaults.charset : opts.charset;
      var duplicates = typeof opts.duplicates === "undefined" ? defaults.duplicates : opts.duplicates;
      if (duplicates !== "combine" && duplicates !== "first" && duplicates !== "last") {
        throw new TypeError("The duplicates option must be either combine, first, or last");
      }
      var allowDots = typeof opts.allowDots === "undefined" ? opts.decodeDotInKeys === true ? true : defaults.allowDots : !!opts.allowDots;
      return {
        allowDots,
        allowEmptyArrays: typeof opts.allowEmptyArrays === "boolean" ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
        allowPrototypes: typeof opts.allowPrototypes === "boolean" ? opts.allowPrototypes : defaults.allowPrototypes,
        allowSparse: typeof opts.allowSparse === "boolean" ? opts.allowSparse : defaults.allowSparse,
        arrayLimit: typeof opts.arrayLimit === "number" ? opts.arrayLimit : defaults.arrayLimit,
        charset,
        charsetSentinel: typeof opts.charsetSentinel === "boolean" ? opts.charsetSentinel : defaults.charsetSentinel,
        comma: typeof opts.comma === "boolean" ? opts.comma : defaults.comma,
        decodeDotInKeys: typeof opts.decodeDotInKeys === "boolean" ? opts.decodeDotInKeys : defaults.decodeDotInKeys,
        decoder: typeof opts.decoder === "function" ? opts.decoder : defaults.decoder,
        delimiter: typeof opts.delimiter === "string" || utils2.isRegExp(opts.delimiter) ? opts.delimiter : defaults.delimiter,
        // eslint-disable-next-line no-implicit-coercion, no-extra-parens
        depth: typeof opts.depth === "number" || opts.depth === false ? +opts.depth : defaults.depth,
        duplicates,
        ignoreQueryPrefix: opts.ignoreQueryPrefix === true,
        interpretNumericEntities: typeof opts.interpretNumericEntities === "boolean" ? opts.interpretNumericEntities : defaults.interpretNumericEntities,
        parameterLimit: typeof opts.parameterLimit === "number" ? opts.parameterLimit : defaults.parameterLimit,
        parseArrays: opts.parseArrays !== false,
        plainObjects: typeof opts.plainObjects === "boolean" ? opts.plainObjects : defaults.plainObjects,
        strictDepth: typeof opts.strictDepth === "boolean" ? !!opts.strictDepth : defaults.strictDepth,
        strictNullHandling: typeof opts.strictNullHandling === "boolean" ? opts.strictNullHandling : defaults.strictNullHandling,
        throwOnLimitExceeded: typeof opts.throwOnLimitExceeded === "boolean" ? opts.throwOnLimitExceeded : false
      };
    };
    module2.exports = function(str, opts) {
      var options = normalizeParseOptions(opts);
      if (str === "" || str === null || typeof str === "undefined") {
        return options.plainObjects ? { __proto__: null } : {};
      }
      var tempObj = typeof str === "string" ? parseValues(str, options) : str;
      var obj = options.plainObjects ? { __proto__: null } : {};
      var keys = Object.keys(tempObj);
      for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var newObj = parseKeys(key, tempObj[key], options, typeof str === "string");
        obj = utils2.merge(obj, newObj, options);
      }
      if (options.allowSparse === true) {
        return obj;
      }
      return utils2.compact(obj);
    };
  }
});

// netlify/functions/node_modules/qs/lib/index.js
var require_lib = __commonJS({
  "netlify/functions/node_modules/qs/lib/index.js"(exports2, module2) {
    "use strict";
    var stringify = require_stringify();
    var parse = require_parse();
    var formats = require_formats();
    module2.exports = {
      formats,
      parse,
      stringify
    };
  }
});

// netlify/functions/node_modules/stripe/cjs/utils.js
var require_utils3 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/utils.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.concat = exports2.determineProcessUserAgentProperties = exports2.validateInteger = exports2.flattenAndStringify = exports2.isObject = exports2.emitWarning = exports2.pascalToCamelCase = exports2.callbackifyPromiseWithTimeout = exports2.normalizeHeader = exports2.normalizeHeaders = exports2.removeNullish = exports2.protoExtend = exports2.getOptionsFromArgs = exports2.getDataFromArgs = exports2.extractUrlParams = exports2.makeURLInterpolator = exports2.stringifyRequestData = exports2.isOptionsHash = void 0;
    var qs = require_lib();
    var OPTIONS_KEYS = [
      "apiKey",
      "idempotencyKey",
      "stripeAccount",
      "apiVersion",
      "maxNetworkRetries",
      "timeout",
      "host"
    ];
    function isOptionsHash(o) {
      return o && typeof o === "object" && OPTIONS_KEYS.some((prop) => Object.prototype.hasOwnProperty.call(o, prop));
    }
    exports2.isOptionsHash = isOptionsHash;
    function stringifyRequestData(data) {
      return qs.stringify(data, {
        serializeDate: (d) => Math.floor(d.getTime() / 1e3).toString()
      }).replace(/%5B/g, "[").replace(/%5D/g, "]");
    }
    exports2.stringifyRequestData = stringifyRequestData;
    exports2.makeURLInterpolator = /* @__PURE__ */ (() => {
      const rc = {
        "\n": "\\n",
        '"': '\\"',
        "\u2028": "\\u2028",
        "\u2029": "\\u2029"
      };
      return (str) => {
        const cleanString = str.replace(/["\n\r\u2028\u2029]/g, ($0) => rc[$0]);
        return (outputs) => {
          return cleanString.replace(/\{([\s\S]+?)\}/g, ($0, $1) => (
            // @ts-ignore
            encodeURIComponent(outputs[$1] || "")
          ));
        };
      };
    })();
    function extractUrlParams(path) {
      const params = path.match(/\{\w+\}/g);
      if (!params) {
        return [];
      }
      return params.map((param) => param.replace(/[{}]/g, ""));
    }
    exports2.extractUrlParams = extractUrlParams;
    function getDataFromArgs(args) {
      if (!Array.isArray(args) || !args[0] || typeof args[0] !== "object") {
        return {};
      }
      if (!isOptionsHash(args[0])) {
        return args.shift();
      }
      const argKeys = Object.keys(args[0]);
      const optionKeysInArgs = argKeys.filter((key) => OPTIONS_KEYS.includes(key));
      if (optionKeysInArgs.length > 0 && optionKeysInArgs.length !== argKeys.length) {
        emitWarning(`Options found in arguments (${optionKeysInArgs.join(", ")}). Did you mean to pass an options object? See https://github.com/stripe/stripe-node/wiki/Passing-Options.`);
      }
      return {};
    }
    exports2.getDataFromArgs = getDataFromArgs;
    function getOptionsFromArgs(args) {
      const opts = {
        auth: null,
        host: null,
        headers: {},
        settings: {}
      };
      if (args.length > 0) {
        const arg = args[args.length - 1];
        if (typeof arg === "string") {
          opts.auth = args.pop();
        } else if (isOptionsHash(arg)) {
          const params = Object.assign({}, args.pop());
          const extraKeys = Object.keys(params).filter((key) => !OPTIONS_KEYS.includes(key));
          if (extraKeys.length) {
            emitWarning(`Invalid options found (${extraKeys.join(", ")}); ignoring.`);
          }
          if (params.apiKey) {
            opts.auth = params.apiKey;
          }
          if (params.idempotencyKey) {
            opts.headers["Idempotency-Key"] = params.idempotencyKey;
          }
          if (params.stripeAccount) {
            opts.headers["Stripe-Account"] = params.stripeAccount;
          }
          if (params.apiVersion) {
            opts.headers["Stripe-Version"] = params.apiVersion;
          }
          if (Number.isInteger(params.maxNetworkRetries)) {
            opts.settings.maxNetworkRetries = params.maxNetworkRetries;
          }
          if (Number.isInteger(params.timeout)) {
            opts.settings.timeout = params.timeout;
          }
          if (params.host) {
            opts.host = params.host;
          }
        }
      }
      return opts;
    }
    exports2.getOptionsFromArgs = getOptionsFromArgs;
    function protoExtend(sub) {
      const Super = this;
      const Constructor = Object.prototype.hasOwnProperty.call(sub, "constructor") ? sub.constructor : function(...args) {
        Super.apply(this, args);
      };
      Object.assign(Constructor, Super);
      Constructor.prototype = Object.create(Super.prototype);
      Object.assign(Constructor.prototype, sub);
      return Constructor;
    }
    exports2.protoExtend = protoExtend;
    function removeNullish(obj) {
      if (typeof obj !== "object") {
        throw new Error("Argument must be an object");
      }
      return Object.keys(obj).reduce((result, key) => {
        if (obj[key] != null) {
          result[key] = obj[key];
        }
        return result;
      }, {});
    }
    exports2.removeNullish = removeNullish;
    function normalizeHeaders(obj) {
      if (!(obj && typeof obj === "object")) {
        return obj;
      }
      return Object.keys(obj).reduce((result, header) => {
        result[normalizeHeader(header)] = obj[header];
        return result;
      }, {});
    }
    exports2.normalizeHeaders = normalizeHeaders;
    function normalizeHeader(header) {
      return header.split("-").map((text) => text.charAt(0).toUpperCase() + text.substr(1).toLowerCase()).join("-");
    }
    exports2.normalizeHeader = normalizeHeader;
    function callbackifyPromiseWithTimeout(promise, callback) {
      if (callback) {
        return promise.then((res) => {
          setTimeout(() => {
            callback(null, res);
          }, 0);
        }, (err) => {
          setTimeout(() => {
            callback(err, null);
          }, 0);
        });
      }
      return promise;
    }
    exports2.callbackifyPromiseWithTimeout = callbackifyPromiseWithTimeout;
    function pascalToCamelCase(name) {
      if (name === "OAuth") {
        return "oauth";
      } else {
        return name[0].toLowerCase() + name.substring(1);
      }
    }
    exports2.pascalToCamelCase = pascalToCamelCase;
    function emitWarning(warning) {
      if (typeof process.emitWarning !== "function") {
        return console.warn(`Stripe: ${warning}`);
      }
      return process.emitWarning(warning, "Stripe");
    }
    exports2.emitWarning = emitWarning;
    function isObject(obj) {
      const type = typeof obj;
      return (type === "function" || type === "object") && !!obj;
    }
    exports2.isObject = isObject;
    function flattenAndStringify(data) {
      const result = {};
      const step = (obj, prevKey) => {
        Object.keys(obj).forEach((key) => {
          const value = obj[key];
          const newKey = prevKey ? `${prevKey}[${key}]` : key;
          if (isObject(value)) {
            if (!(value instanceof Uint8Array) && !Object.prototype.hasOwnProperty.call(value, "data")) {
              return step(value, newKey);
            } else {
              result[newKey] = value;
            }
          } else {
            result[newKey] = String(value);
          }
        });
      };
      step(data, null);
      return result;
    }
    exports2.flattenAndStringify = flattenAndStringify;
    function validateInteger(name, n, defaultVal) {
      if (!Number.isInteger(n)) {
        if (defaultVal !== void 0) {
          return defaultVal;
        } else {
          throw new Error(`${name} must be an integer`);
        }
      }
      return n;
    }
    exports2.validateInteger = validateInteger;
    function determineProcessUserAgentProperties() {
      return typeof process === "undefined" ? {} : {
        lang_version: process.version,
        platform: process.platform
      };
    }
    exports2.determineProcessUserAgentProperties = determineProcessUserAgentProperties;
    function concat(arrays) {
      const totalLength = arrays.reduce((len, array) => len + array.length, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      arrays.forEach((array) => {
        merged.set(array, offset);
        offset += array.length;
      });
      return merged;
    }
    exports2.concat = concat;
  }
});

// netlify/functions/node_modules/stripe/cjs/platform/NodePlatformFunctions.js
var require_NodePlatformFunctions = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/platform/NodePlatformFunctions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NodePlatformFunctions = void 0;
    var crypto2 = require("crypto");
    var events_1 = require("events");
    var NodeCryptoProvider_js_1 = require_NodeCryptoProvider();
    var NodeHttpClient_js_1 = require_NodeHttpClient();
    var PlatformFunctions_js_1 = require_PlatformFunctions();
    var Error_js_1 = require_Error();
    var utils_js_1 = require_utils3();
    var child_process_1 = require("child_process");
    var StreamProcessingError = class extends Error_js_1.StripeError {
    };
    var NodePlatformFunctions = class extends PlatformFunctions_js_1.PlatformFunctions {
      constructor() {
        super();
        this._exec = child_process_1.exec;
        this._UNAME_CACHE = null;
      }
      /** @override */
      uuid4() {
        if (crypto2.randomUUID) {
          return crypto2.randomUUID();
        }
        return super.uuid4();
      }
      /**
       * @override
       * Node's built in `exec` function sometimes throws outright,
       * and sometimes has a callback with an error,
       * depending on the type of error.
       *
       * This unifies that interface by resolving with a null uname
       * if an error is encountered.
       */
      getUname() {
        if (!this._UNAME_CACHE) {
          this._UNAME_CACHE = new Promise((resolve, reject) => {
            try {
              this._exec("uname -a", (err, uname) => {
                if (err) {
                  return resolve(null);
                }
                resolve(uname);
              });
            } catch (e) {
              resolve(null);
            }
          });
        }
        return this._UNAME_CACHE;
      }
      /**
       * @override
       * Secure compare, from https://github.com/freewil/scmp
       */
      secureCompare(a, b) {
        if (!a || !b) {
          throw new Error("secureCompare must receive two arguments");
        }
        if (a.length !== b.length) {
          return false;
        }
        if (crypto2.timingSafeEqual) {
          const textEncoder = new TextEncoder();
          const aEncoded = textEncoder.encode(a);
          const bEncoded = textEncoder.encode(b);
          return crypto2.timingSafeEqual(aEncoded, bEncoded);
        }
        return super.secureCompare(a, b);
      }
      createEmitter() {
        return new events_1.EventEmitter();
      }
      /** @override */
      tryBufferData(data) {
        if (!(data.file.data instanceof events_1.EventEmitter)) {
          return Promise.resolve(data);
        }
        const bufferArray = [];
        return new Promise((resolve, reject) => {
          data.file.data.on("data", (line) => {
            bufferArray.push(line);
          }).once("end", () => {
            const bufferData = Object.assign({}, data);
            bufferData.file.data = (0, utils_js_1.concat)(bufferArray);
            resolve(bufferData);
          }).on("error", (err) => {
            reject(new StreamProcessingError({
              message: "An error occurred while attempting to process the file for upload.",
              detail: err
            }));
          });
        });
      }
      /** @override */
      createNodeHttpClient(agent) {
        return new NodeHttpClient_js_1.NodeHttpClient(agent);
      }
      /** @override */
      createDefaultHttpClient() {
        return new NodeHttpClient_js_1.NodeHttpClient();
      }
      /** @override */
      createNodeCryptoProvider() {
        return new NodeCryptoProvider_js_1.NodeCryptoProvider();
      }
      /** @override */
      createDefaultCryptoProvider() {
        return this.createNodeCryptoProvider();
      }
    };
    exports2.NodePlatformFunctions = NodePlatformFunctions;
  }
});

// netlify/functions/node_modules/stripe/cjs/apiVersion.js
var require_apiVersion = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/apiVersion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ApiVersion = void 0;
    exports2.ApiVersion = "2023-10-16";
  }
});

// netlify/functions/node_modules/stripe/cjs/ResourceNamespace.js
var require_ResourceNamespace = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/ResourceNamespace.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resourceNamespace = void 0;
    function ResourceNamespace(stripe, resources) {
      for (const name in resources) {
        const camelCaseName = name[0].toLowerCase() + name.substring(1);
        const resource = new resources[name](stripe);
        this[camelCaseName] = resource;
      }
    }
    function resourceNamespace(namespace, resources) {
      return function(stripe) {
        return new ResourceNamespace(stripe, resources);
      };
    }
    exports2.resourceNamespace = resourceNamespace;
  }
});

// netlify/functions/node_modules/stripe/cjs/autoPagination.js
var require_autoPagination = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/autoPagination.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.makeAutoPaginationMethods = void 0;
    var utils_js_1 = require_utils3();
    var StripeIterator = class {
      constructor(firstPagePromise, requestArgs, spec, stripeResource) {
        this.index = 0;
        this.pagePromise = firstPagePromise;
        this.promiseCache = { currentPromise: null };
        this.requestArgs = requestArgs;
        this.spec = spec;
        this.stripeResource = stripeResource;
      }
      async iterate(pageResult) {
        if (!(pageResult && pageResult.data && typeof pageResult.data.length === "number")) {
          throw Error("Unexpected: Stripe API response does not have a well-formed `data` array.");
        }
        const reverseIteration = isReverseIteration(this.requestArgs);
        if (this.index < pageResult.data.length) {
          const idx = reverseIteration ? pageResult.data.length - 1 - this.index : this.index;
          const value = pageResult.data[idx];
          this.index += 1;
          return { value, done: false };
        } else if (pageResult.has_more) {
          this.index = 0;
          this.pagePromise = this.getNextPage(pageResult);
          const nextPageResult = await this.pagePromise;
          return this.iterate(nextPageResult);
        }
        return { done: true, value: void 0 };
      }
      /** @abstract */
      getNextPage(_pageResult) {
        throw new Error("Unimplemented");
      }
      async _next() {
        return this.iterate(await this.pagePromise);
      }
      next() {
        if (this.promiseCache.currentPromise) {
          return this.promiseCache.currentPromise;
        }
        const nextPromise = (async () => {
          const ret = await this._next();
          this.promiseCache.currentPromise = null;
          return ret;
        })();
        this.promiseCache.currentPromise = nextPromise;
        return nextPromise;
      }
    };
    var ListIterator = class extends StripeIterator {
      getNextPage(pageResult) {
        const reverseIteration = isReverseIteration(this.requestArgs);
        const lastId = getLastId(pageResult, reverseIteration);
        return this.stripeResource._makeRequest(this.requestArgs, this.spec, {
          [reverseIteration ? "ending_before" : "starting_after"]: lastId
        });
      }
    };
    var SearchIterator = class extends StripeIterator {
      getNextPage(pageResult) {
        if (!pageResult.next_page) {
          throw Error("Unexpected: Stripe API response does not have a well-formed `next_page` field, but `has_more` was true.");
        }
        return this.stripeResource._makeRequest(this.requestArgs, this.spec, {
          page: pageResult.next_page
        });
      }
    };
    var makeAutoPaginationMethods = (stripeResource, requestArgs, spec, firstPagePromise) => {
      if (spec.methodType === "search") {
        return makeAutoPaginationMethodsFromIterator(new SearchIterator(firstPagePromise, requestArgs, spec, stripeResource));
      }
      if (spec.methodType === "list") {
        return makeAutoPaginationMethodsFromIterator(new ListIterator(firstPagePromise, requestArgs, spec, stripeResource));
      }
      return null;
    };
    exports2.makeAutoPaginationMethods = makeAutoPaginationMethods;
    var makeAutoPaginationMethodsFromIterator = (iterator) => {
      const autoPagingEach = makeAutoPagingEach((...args) => iterator.next(...args));
      const autoPagingToArray = makeAutoPagingToArray(autoPagingEach);
      const autoPaginationMethods = {
        autoPagingEach,
        autoPagingToArray,
        // Async iterator functions:
        next: () => iterator.next(),
        return: () => {
          return {};
        },
        [getAsyncIteratorSymbol()]: () => {
          return autoPaginationMethods;
        }
      };
      return autoPaginationMethods;
    };
    function getAsyncIteratorSymbol() {
      if (typeof Symbol !== "undefined" && Symbol.asyncIterator) {
        return Symbol.asyncIterator;
      }
      return "@@asyncIterator";
    }
    function getDoneCallback(args) {
      if (args.length < 2) {
        return null;
      }
      const onDone = args[1];
      if (typeof onDone !== "function") {
        throw Error(`The second argument to autoPagingEach, if present, must be a callback function; received ${typeof onDone}`);
      }
      return onDone;
    }
    function getItemCallback(args) {
      if (args.length === 0) {
        return void 0;
      }
      const onItem = args[0];
      if (typeof onItem !== "function") {
        throw Error(`The first argument to autoPagingEach, if present, must be a callback function; received ${typeof onItem}`);
      }
      if (onItem.length === 2) {
        return onItem;
      }
      if (onItem.length > 2) {
        throw Error(`The \`onItem\` callback function passed to autoPagingEach must accept at most two arguments; got ${onItem}`);
      }
      return function _onItem(item, next) {
        const shouldContinue = onItem(item);
        next(shouldContinue);
      };
    }
    function getLastId(listResult, reverseIteration) {
      const lastIdx = reverseIteration ? 0 : listResult.data.length - 1;
      const lastItem = listResult.data[lastIdx];
      const lastId = lastItem && lastItem.id;
      if (!lastId) {
        throw Error("Unexpected: No `id` found on the last item while auto-paging a list.");
      }
      return lastId;
    }
    function makeAutoPagingEach(asyncIteratorNext) {
      return function autoPagingEach() {
        const args = [].slice.call(arguments);
        const onItem = getItemCallback(args);
        const onDone = getDoneCallback(args);
        if (args.length > 2) {
          throw Error(`autoPagingEach takes up to two arguments; received ${args}`);
        }
        const autoPagePromise = wrapAsyncIteratorWithCallback(
          asyncIteratorNext,
          // @ts-ignore we might need a null check
          onItem
        );
        return (0, utils_js_1.callbackifyPromiseWithTimeout)(autoPagePromise, onDone);
      };
    }
    function makeAutoPagingToArray(autoPagingEach) {
      return function autoPagingToArray(opts, onDone) {
        const limit = opts && opts.limit;
        if (!limit) {
          throw Error("You must pass a `limit` option to autoPagingToArray, e.g., `autoPagingToArray({limit: 1000});`.");
        }
        if (limit > 1e4) {
          throw Error("You cannot specify a limit of more than 10,000 items to fetch in `autoPagingToArray`; use `autoPagingEach` to iterate through longer lists.");
        }
        const promise = new Promise((resolve, reject) => {
          const items = [];
          autoPagingEach((item) => {
            items.push(item);
            if (items.length >= limit) {
              return false;
            }
          }).then(() => {
            resolve(items);
          }).catch(reject);
        });
        return (0, utils_js_1.callbackifyPromiseWithTimeout)(promise, onDone);
      };
    }
    function wrapAsyncIteratorWithCallback(asyncIteratorNext, onItem) {
      return new Promise((resolve, reject) => {
        function handleIteration(iterResult) {
          if (iterResult.done) {
            resolve();
            return;
          }
          const item = iterResult.value;
          return new Promise((next) => {
            onItem(item, next);
          }).then((shouldContinue) => {
            if (shouldContinue === false) {
              return handleIteration({ done: true, value: void 0 });
            } else {
              return asyncIteratorNext().then(handleIteration);
            }
          });
        }
        asyncIteratorNext().then(handleIteration).catch(reject);
      });
    }
    function isReverseIteration(requestArgs) {
      const args = [].slice.call(requestArgs);
      const dataFromArgs = (0, utils_js_1.getDataFromArgs)(args);
      return !!dataFromArgs.ending_before;
    }
  }
});

// netlify/functions/node_modules/stripe/cjs/StripeMethod.js
var require_StripeMethod = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/StripeMethod.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.stripeMethod = void 0;
    var utils_js_1 = require_utils3();
    var autoPagination_js_1 = require_autoPagination();
    function stripeMethod(spec) {
      if (spec.path !== void 0 && spec.fullPath !== void 0) {
        throw new Error(`Method spec specified both a 'path' (${spec.path}) and a 'fullPath' (${spec.fullPath}).`);
      }
      return function(...args) {
        const callback = typeof args[args.length - 1] == "function" && args.pop();
        spec.urlParams = (0, utils_js_1.extractUrlParams)(spec.fullPath || this.createResourcePathWithSymbols(spec.path || ""));
        const requestPromise = (0, utils_js_1.callbackifyPromiseWithTimeout)(this._makeRequest(args, spec, {}), callback);
        Object.assign(requestPromise, (0, autoPagination_js_1.makeAutoPaginationMethods)(this, args, spec, requestPromise));
        return requestPromise;
      };
    }
    exports2.stripeMethod = stripeMethod;
  }
});

// netlify/functions/node_modules/stripe/cjs/StripeResource.js
var require_StripeResource = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/StripeResource.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.StripeResource = void 0;
    var utils_js_1 = require_utils3();
    var StripeMethod_js_1 = require_StripeMethod();
    StripeResource.extend = utils_js_1.protoExtend;
    StripeResource.method = StripeMethod_js_1.stripeMethod;
    StripeResource.MAX_BUFFERED_REQUEST_METRICS = 100;
    function StripeResource(stripe, deprecatedUrlData) {
      this._stripe = stripe;
      if (deprecatedUrlData) {
        throw new Error("Support for curried url params was dropped in stripe-node v7.0.0. Instead, pass two ids.");
      }
      this.basePath = (0, utils_js_1.makeURLInterpolator)(
        // @ts-ignore changing type of basePath
        this.basePath || stripe.getApiField("basePath")
      );
      this.resourcePath = this.path;
      this.path = (0, utils_js_1.makeURLInterpolator)(this.path);
      this.initialize(...arguments);
    }
    exports2.StripeResource = StripeResource;
    StripeResource.prototype = {
      _stripe: null,
      // @ts-ignore the type of path changes in ctor
      path: "",
      resourcePath: "",
      // Methods that don't use the API's default '/v1' path can override it with this setting.
      basePath: null,
      initialize() {
      },
      // Function to override the default data processor. This allows full control
      // over how a StripeResource's request data will get converted into an HTTP
      // body. This is useful for non-standard HTTP requests. The function should
      // take method name, data, and headers as arguments.
      requestDataProcessor: null,
      // Function to add a validation checks before sending the request, errors should
      // be thrown, and they will be passed to the callback/promise.
      validateRequest: null,
      createFullPath(commandPath, urlData) {
        const urlParts = [this.basePath(urlData), this.path(urlData)];
        if (typeof commandPath === "function") {
          const computedCommandPath = commandPath(urlData);
          if (computedCommandPath) {
            urlParts.push(computedCommandPath);
          }
        } else {
          urlParts.push(commandPath);
        }
        return this._joinUrlParts(urlParts);
      },
      // Creates a relative resource path with symbols left in (unlike
      // createFullPath which takes some data to replace them with). For example it
      // might produce: /invoices/{id}
      createResourcePathWithSymbols(pathWithSymbols) {
        if (pathWithSymbols) {
          return `/${this._joinUrlParts([this.resourcePath, pathWithSymbols])}`;
        } else {
          return `/${this.resourcePath}`;
        }
      },
      _joinUrlParts(parts) {
        return parts.join("/").replace(/\/{2,}/g, "/");
      },
      _getRequestOpts(requestArgs, spec, overrideData) {
        const requestMethod = (spec.method || "GET").toUpperCase();
        const usage = spec.usage || [];
        const urlParams = spec.urlParams || [];
        const encode = spec.encode || ((data2) => data2);
        const isUsingFullPath = !!spec.fullPath;
        const commandPath = (0, utils_js_1.makeURLInterpolator)(isUsingFullPath ? spec.fullPath : spec.path || "");
        const path = isUsingFullPath ? spec.fullPath : this.createResourcePathWithSymbols(spec.path);
        const args = [].slice.call(requestArgs);
        const urlData = urlParams.reduce((urlData2, param) => {
          const arg = args.shift();
          if (typeof arg !== "string") {
            throw new Error(`Stripe: Argument "${param}" must be a string, but got: ${arg} (on API request to \`${requestMethod} ${path}\`)`);
          }
          urlData2[param] = arg;
          return urlData2;
        }, {});
        const dataFromArgs = (0, utils_js_1.getDataFromArgs)(args);
        const data = encode(Object.assign({}, dataFromArgs, overrideData));
        const options = (0, utils_js_1.getOptionsFromArgs)(args);
        const host = options.host || spec.host;
        const streaming = !!spec.streaming;
        if (args.filter((x) => x != null).length) {
          throw new Error(`Stripe: Unknown arguments (${args}). Did you mean to pass an options object? See https://github.com/stripe/stripe-node/wiki/Passing-Options. (on API request to ${requestMethod} \`${path}\`)`);
        }
        const requestPath = isUsingFullPath ? commandPath(urlData) : this.createFullPath(commandPath, urlData);
        const headers = Object.assign(options.headers, spec.headers);
        if (spec.validator) {
          spec.validator(data, { headers });
        }
        const dataInQuery = spec.method === "GET" || spec.method === "DELETE";
        const bodyData = dataInQuery ? {} : data;
        const queryData = dataInQuery ? data : {};
        return {
          requestMethod,
          requestPath,
          bodyData,
          queryData,
          auth: options.auth,
          headers,
          host: host !== null && host !== void 0 ? host : null,
          streaming,
          settings: options.settings,
          usage
        };
      },
      _makeRequest(requestArgs, spec, overrideData) {
        return new Promise((resolve, reject) => {
          var _a;
          let opts;
          try {
            opts = this._getRequestOpts(requestArgs, spec, overrideData);
          } catch (err) {
            reject(err);
            return;
          }
          function requestCallback(err, response) {
            if (err) {
              reject(err);
            } else {
              resolve(spec.transformResponseData ? spec.transformResponseData(response) : response);
            }
          }
          const emptyQuery = Object.keys(opts.queryData).length === 0;
          const path = [
            opts.requestPath,
            emptyQuery ? "" : "?",
            (0, utils_js_1.stringifyRequestData)(opts.queryData)
          ].join("");
          const { headers, settings } = opts;
          this._stripe._requestSender._request(opts.requestMethod, opts.host, path, opts.bodyData, opts.auth, { headers, settings, streaming: opts.streaming }, opts.usage, requestCallback, (_a = this.requestDataProcessor) === null || _a === void 0 ? void 0 : _a.bind(this));
        });
      }
    };
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/FinancialConnections/Accounts.js
var require_Accounts = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/FinancialConnections/Accounts.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Accounts = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Accounts = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/financial_connections/accounts/{account}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/financial_connections/accounts",
        methodType: "list"
      }),
      disconnect: stripeMethod({
        method: "POST",
        fullPath: "/v1/financial_connections/accounts/{account}/disconnect"
      }),
      listOwners: stripeMethod({
        method: "GET",
        fullPath: "/v1/financial_connections/accounts/{account}/owners",
        methodType: "list"
      }),
      refresh: stripeMethod({
        method: "POST",
        fullPath: "/v1/financial_connections/accounts/{account}/refresh"
      }),
      subscribe: stripeMethod({
        method: "POST",
        fullPath: "/v1/financial_connections/accounts/{account}/subscribe"
      }),
      unsubscribe: stripeMethod({
        method: "POST",
        fullPath: "/v1/financial_connections/accounts/{account}/unsubscribe"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Entitlements/ActiveEntitlements.js
var require_ActiveEntitlements = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Entitlements/ActiveEntitlements.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ActiveEntitlements = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ActiveEntitlements = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/entitlements/active_entitlements/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/entitlements/active_entitlements",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Issuing/Authorizations.js
var require_Authorizations = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Issuing/Authorizations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Authorizations = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Authorizations = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/authorizations"
      }),
      capture: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/authorizations/{authorization}/capture"
      }),
      expire: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/authorizations/{authorization}/expire"
      }),
      increment: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/authorizations/{authorization}/increment"
      }),
      reverse: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/authorizations/{authorization}/reverse"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Issuing/Authorizations.js
var require_Authorizations2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Issuing/Authorizations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Authorizations = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Authorizations = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/authorizations/{authorization}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/authorizations/{authorization}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/authorizations",
        methodType: "list"
      }),
      approve: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/authorizations/{authorization}/approve"
      }),
      decline: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/authorizations/{authorization}/decline"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Tax/Calculations.js
var require_Calculations = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Tax/Calculations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Calculations = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Calculations = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/tax/calculations" }),
      listLineItems: stripeMethod({
        method: "GET",
        fullPath: "/v1/tax/calculations/{calculation}/line_items",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Issuing/Cardholders.js
var require_Cardholders = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Issuing/Cardholders.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Cardholders = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Cardholders = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/issuing/cardholders" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/cardholders/{cardholder}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/cardholders/{cardholder}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/cardholders",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Issuing/Cards.js
var require_Cards = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Issuing/Cards.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Cards = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Cards = StripeResource_js_1.StripeResource.extend({
      deliverCard: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/cards/{card}/shipping/deliver"
      }),
      failCard: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/cards/{card}/shipping/fail"
      }),
      returnCard: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/cards/{card}/shipping/return"
      }),
      shipCard: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/cards/{card}/shipping/ship"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Issuing/Cards.js
var require_Cards2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Issuing/Cards.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Cards = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Cards = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/issuing/cards" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/issuing/cards/{card}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/issuing/cards/{card}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/cards",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/BillingPortal/Configurations.js
var require_Configurations = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/BillingPortal/Configurations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Configurations = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Configurations = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/billing_portal/configurations"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/billing_portal/configurations/{configuration}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/billing_portal/configurations/{configuration}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/billing_portal/configurations",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Terminal/Configurations.js
var require_Configurations2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Terminal/Configurations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Configurations = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Configurations = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/configurations"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/terminal/configurations/{configuration}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/configurations/{configuration}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/terminal/configurations",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/terminal/configurations/{configuration}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/ConfirmationTokens.js
var require_ConfirmationTokens = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/ConfirmationTokens.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ConfirmationTokens = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ConfirmationTokens = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/confirmation_tokens"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Terminal/ConnectionTokens.js
var require_ConnectionTokens = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Terminal/ConnectionTokens.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ConnectionTokens = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ConnectionTokens = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/connection_tokens"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/CreditReversals.js
var require_CreditReversals = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/CreditReversals.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CreditReversals = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.CreditReversals = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/credit_reversals"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/credit_reversals/{credit_reversal}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/credit_reversals",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Customers.js
var require_Customers = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Customers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Customers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Customers = StripeResource_js_1.StripeResource.extend({
      fundCashBalance: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/customers/{customer}/fund_cash_balance"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/DebitReversals.js
var require_DebitReversals = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/DebitReversals.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DebitReversals = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.DebitReversals = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/debit_reversals"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/debit_reversals/{debit_reversal}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/debit_reversals",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Issuing/Disputes.js
var require_Disputes = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Issuing/Disputes.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Disputes = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Disputes = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/issuing/disputes" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/disputes/{dispute}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/disputes/{dispute}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/disputes",
        methodType: "list"
      }),
      submit: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/disputes/{dispute}/submit"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Radar/EarlyFraudWarnings.js
var require_EarlyFraudWarnings = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Radar/EarlyFraudWarnings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EarlyFraudWarnings = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.EarlyFraudWarnings = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/radar/early_fraud_warnings/{early_fraud_warning}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/radar/early_fraud_warnings",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Entitlements/Features.js
var require_Features = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Entitlements/Features.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Features = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Features = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/entitlements/features" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/entitlements/features/{id}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/entitlements/features/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/entitlements/features",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/FinancialAccounts.js
var require_FinancialAccounts = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/FinancialAccounts.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FinancialAccounts = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.FinancialAccounts = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/financial_accounts"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/financial_accounts/{financial_account}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/financial_accounts/{financial_account}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/financial_accounts",
        methodType: "list"
      }),
      retrieveFeatures: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/financial_accounts/{financial_account}/features"
      }),
      updateFeatures: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/financial_accounts/{financial_account}/features"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/InboundTransfers.js
var require_InboundTransfers = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/InboundTransfers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InboundTransfers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.InboundTransfers = StripeResource_js_1.StripeResource.extend({
      fail: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/inbound_transfers/{id}/fail"
      }),
      returnInboundTransfer: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/inbound_transfers/{id}/return"
      }),
      succeed: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/inbound_transfers/{id}/succeed"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/InboundTransfers.js
var require_InboundTransfers2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/InboundTransfers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InboundTransfers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.InboundTransfers = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/inbound_transfers"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/inbound_transfers/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/inbound_transfers",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/inbound_transfers/{inbound_transfer}/cancel"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Terminal/Locations.js
var require_Locations = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Terminal/Locations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Locations = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Locations = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/terminal/locations" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/terminal/locations/{location}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/locations/{location}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/terminal/locations",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/terminal/locations/{location}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Billing/MeterEventAdjustments.js
var require_MeterEventAdjustments = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Billing/MeterEventAdjustments.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MeterEventAdjustments = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.MeterEventAdjustments = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/billing/meter_event_adjustments"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Billing/MeterEvents.js
var require_MeterEvents = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Billing/MeterEvents.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MeterEvents = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.MeterEvents = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/billing/meter_events" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Billing/Meters.js
var require_Meters = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Billing/Meters.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Meters = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Meters = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/billing/meters" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/billing/meters/{id}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/billing/meters/{id}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/billing/meters",
        methodType: "list"
      }),
      deactivate: stripeMethod({
        method: "POST",
        fullPath: "/v1/billing/meters/{id}/deactivate"
      }),
      listEventSummaries: stripeMethod({
        method: "GET",
        fullPath: "/v1/billing/meters/{id}/event_summaries",
        methodType: "list"
      }),
      reactivate: stripeMethod({
        method: "POST",
        fullPath: "/v1/billing/meters/{id}/reactivate"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Climate/Orders.js
var require_Orders = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Climate/Orders.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Orders = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Orders = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/climate/orders" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/climate/orders/{order}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/climate/orders/{order}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/climate/orders",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/climate/orders/{order}/cancel"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/OutboundPayments.js
var require_OutboundPayments = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/OutboundPayments.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.OutboundPayments = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.OutboundPayments = StripeResource_js_1.StripeResource.extend({
      fail: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/outbound_payments/{id}/fail"
      }),
      post: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/outbound_payments/{id}/post"
      }),
      returnOutboundPayment: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/outbound_payments/{id}/return"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/OutboundPayments.js
var require_OutboundPayments2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/OutboundPayments.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.OutboundPayments = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.OutboundPayments = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/outbound_payments"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/outbound_payments/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/outbound_payments",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/outbound_payments/{id}/cancel"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/OutboundTransfers.js
var require_OutboundTransfers = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/OutboundTransfers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.OutboundTransfers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.OutboundTransfers = StripeResource_js_1.StripeResource.extend({
      fail: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/outbound_transfers/{outbound_transfer}/fail"
      }),
      post: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/outbound_transfers/{outbound_transfer}/post"
      }),
      returnOutboundTransfer: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/outbound_transfers/{outbound_transfer}/return"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/OutboundTransfers.js
var require_OutboundTransfers2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/OutboundTransfers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.OutboundTransfers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.OutboundTransfers = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/outbound_transfers"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/outbound_transfers/{outbound_transfer}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/outbound_transfers",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/treasury/outbound_transfers/{outbound_transfer}/cancel"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Issuing/PersonalizationDesigns.js
var require_PersonalizationDesigns = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Issuing/PersonalizationDesigns.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PersonalizationDesigns = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.PersonalizationDesigns = StripeResource_js_1.StripeResource.extend({
      activate: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/personalization_designs/{personalization_design}/activate"
      }),
      deactivate: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/personalization_designs/{personalization_design}/deactivate"
      }),
      reject: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/personalization_designs/{personalization_design}/reject"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Issuing/PersonalizationDesigns.js
var require_PersonalizationDesigns2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Issuing/PersonalizationDesigns.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PersonalizationDesigns = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.PersonalizationDesigns = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/personalization_designs"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/personalization_designs/{personalization_design}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/personalization_designs/{personalization_design}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/personalization_designs",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Issuing/PhysicalBundles.js
var require_PhysicalBundles = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Issuing/PhysicalBundles.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PhysicalBundles = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.PhysicalBundles = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/physical_bundles/{physical_bundle}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/physical_bundles",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Climate/Products.js
var require_Products = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Climate/Products.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Products = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Products = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/climate/products/{product}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/climate/products",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Terminal/Readers.js
var require_Readers = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Terminal/Readers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Readers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Readers = StripeResource_js_1.StripeResource.extend({
      presentPaymentMethod: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/terminal/readers/{reader}/present_payment_method"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Terminal/Readers.js
var require_Readers2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Terminal/Readers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Readers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Readers = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/terminal/readers" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/terminal/readers/{reader}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/readers/{reader}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/terminal/readers",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/terminal/readers/{reader}"
      }),
      cancelAction: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/readers/{reader}/cancel_action"
      }),
      processPaymentIntent: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/readers/{reader}/process_payment_intent"
      }),
      processSetupIntent: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/readers/{reader}/process_setup_intent"
      }),
      refundPayment: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/readers/{reader}/refund_payment"
      }),
      setReaderDisplay: stripeMethod({
        method: "POST",
        fullPath: "/v1/terminal/readers/{reader}/set_reader_display"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/ReceivedCredits.js
var require_ReceivedCredits = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/ReceivedCredits.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ReceivedCredits = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ReceivedCredits = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/received_credits"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/ReceivedCredits.js
var require_ReceivedCredits2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/ReceivedCredits.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ReceivedCredits = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ReceivedCredits = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/received_credits/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/received_credits",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/ReceivedDebits.js
var require_ReceivedDebits = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Treasury/ReceivedDebits.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ReceivedDebits = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ReceivedDebits = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/treasury/received_debits"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/ReceivedDebits.js
var require_ReceivedDebits2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/ReceivedDebits.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ReceivedDebits = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ReceivedDebits = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/received_debits/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/received_debits",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Refunds.js
var require_Refunds = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Refunds.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Refunds = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Refunds = StripeResource_js_1.StripeResource.extend({
      expire: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/refunds/{refund}/expire"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Tax/Registrations.js
var require_Registrations = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Tax/Registrations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Registrations = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Registrations = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/tax/registrations" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/tax/registrations/{id}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/tax/registrations/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/tax/registrations",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Reporting/ReportRuns.js
var require_ReportRuns = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Reporting/ReportRuns.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ReportRuns = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ReportRuns = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/reporting/report_runs" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/reporting/report_runs/{report_run}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/reporting/report_runs",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Reporting/ReportTypes.js
var require_ReportTypes = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Reporting/ReportTypes.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ReportTypes = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ReportTypes = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/reporting/report_types/{report_type}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/reporting/report_types",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Forwarding/Requests.js
var require_Requests = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Forwarding/Requests.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Requests = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Requests = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/forwarding/requests" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/forwarding/requests/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/forwarding/requests",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Sigma/ScheduledQueryRuns.js
var require_ScheduledQueryRuns = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Sigma/ScheduledQueryRuns.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ScheduledQueryRuns = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ScheduledQueryRuns = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/sigma/scheduled_query_runs/{scheduled_query_run}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/sigma/scheduled_query_runs",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Apps/Secrets.js
var require_Secrets = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Apps/Secrets.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Secrets = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Secrets = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/apps/secrets" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/apps/secrets",
        methodType: "list"
      }),
      deleteWhere: stripeMethod({
        method: "POST",
        fullPath: "/v1/apps/secrets/delete"
      }),
      find: stripeMethod({ method: "GET", fullPath: "/v1/apps/secrets/find" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/BillingPortal/Sessions.js
var require_Sessions = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/BillingPortal/Sessions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Sessions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Sessions = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/billing_portal/sessions"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Checkout/Sessions.js
var require_Sessions2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Checkout/Sessions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Sessions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Sessions = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/checkout/sessions" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/checkout/sessions/{session}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/checkout/sessions",
        methodType: "list"
      }),
      expire: stripeMethod({
        method: "POST",
        fullPath: "/v1/checkout/sessions/{session}/expire"
      }),
      listLineItems: stripeMethod({
        method: "GET",
        fullPath: "/v1/checkout/sessions/{session}/line_items",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/FinancialConnections/Sessions.js
var require_Sessions3 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/FinancialConnections/Sessions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Sessions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Sessions = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/financial_connections/sessions"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/financial_connections/sessions/{session}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Tax/Settings.js
var require_Settings = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Tax/Settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Settings = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Settings = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/tax/settings" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/tax/settings" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Climate/Suppliers.js
var require_Suppliers = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Climate/Suppliers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Suppliers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Suppliers = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/climate/suppliers/{supplier}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/climate/suppliers",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/TestClocks.js
var require_TestClocks = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/TestClocks.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TestClocks = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.TestClocks = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/test_clocks"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/test_helpers/test_clocks/{test_clock}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/test_helpers/test_clocks",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/test_helpers/test_clocks/{test_clock}"
      }),
      advance: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/test_clocks/{test_clock}/advance"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Issuing/Tokens.js
var require_Tokens = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Issuing/Tokens.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Tokens = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Tokens = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/tokens/{token}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/tokens/{token}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/tokens",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/TransactionEntries.js
var require_TransactionEntries = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/TransactionEntries.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TransactionEntries = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.TransactionEntries = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/transaction_entries/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/transaction_entries",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Issuing/Transactions.js
var require_Transactions = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TestHelpers/Issuing/Transactions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Transactions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Transactions = StripeResource_js_1.StripeResource.extend({
      createForceCapture: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/transactions/create_force_capture"
      }),
      createUnlinkedRefund: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/transactions/create_unlinked_refund"
      }),
      refund: stripeMethod({
        method: "POST",
        fullPath: "/v1/test_helpers/issuing/transactions/{transaction}/refund"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/FinancialConnections/Transactions.js
var require_Transactions2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/FinancialConnections/Transactions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Transactions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Transactions = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/financial_connections/transactions/{transaction}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/financial_connections/transactions",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Issuing/Transactions.js
var require_Transactions3 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Issuing/Transactions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Transactions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Transactions = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/transactions/{transaction}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/issuing/transactions/{transaction}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/issuing/transactions",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Tax/Transactions.js
var require_Transactions4 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Tax/Transactions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Transactions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Transactions = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/tax/transactions/{transaction}"
      }),
      createFromCalculation: stripeMethod({
        method: "POST",
        fullPath: "/v1/tax/transactions/create_from_calculation"
      }),
      createReversal: stripeMethod({
        method: "POST",
        fullPath: "/v1/tax/transactions/create_reversal"
      }),
      listLineItems: stripeMethod({
        method: "GET",
        fullPath: "/v1/tax/transactions/{transaction}/line_items",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Treasury/Transactions.js
var require_Transactions5 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Treasury/Transactions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Transactions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Transactions = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/transactions/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/treasury/transactions",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Radar/ValueListItems.js
var require_ValueListItems = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Radar/ValueListItems.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ValueListItems = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ValueListItems = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/radar/value_list_items"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/radar/value_list_items/{item}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/radar/value_list_items",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/radar/value_list_items/{item}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Radar/ValueLists.js
var require_ValueLists = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Radar/ValueLists.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ValueLists = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ValueLists = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/radar/value_lists" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/radar/value_lists/{value_list}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/radar/value_lists/{value_list}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/radar/value_lists",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/radar/value_lists/{value_list}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Identity/VerificationReports.js
var require_VerificationReports = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Identity/VerificationReports.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.VerificationReports = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.VerificationReports = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/identity/verification_reports/{report}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/identity/verification_reports",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Identity/VerificationSessions.js
var require_VerificationSessions = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Identity/VerificationSessions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.VerificationSessions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.VerificationSessions = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/identity/verification_sessions"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/identity/verification_sessions/{session}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/identity/verification_sessions/{session}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/identity/verification_sessions",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/identity/verification_sessions/{session}/cancel"
      }),
      redact: stripeMethod({
        method: "POST",
        fullPath: "/v1/identity/verification_sessions/{session}/redact"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Accounts.js
var require_Accounts2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Accounts.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Accounts = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Accounts = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/accounts" }),
      retrieve(id, ...args) {
        if (typeof id === "string") {
          return stripeMethod({
            method: "GET",
            fullPath: "/v1/accounts/{id}"
          }).apply(this, [id, ...args]);
        } else {
          if (id === null || id === void 0) {
            [].shift.apply([id, ...args]);
          }
          return stripeMethod({
            method: "GET",
            fullPath: "/v1/account"
          }).apply(this, [id, ...args]);
        }
      },
      update: stripeMethod({ method: "POST", fullPath: "/v1/accounts/{account}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/accounts",
        methodType: "list"
      }),
      del: stripeMethod({ method: "DELETE", fullPath: "/v1/accounts/{account}" }),
      createExternalAccount: stripeMethod({
        method: "POST",
        fullPath: "/v1/accounts/{account}/external_accounts"
      }),
      createLoginLink: stripeMethod({
        method: "POST",
        fullPath: "/v1/accounts/{account}/login_links"
      }),
      createPerson: stripeMethod({
        method: "POST",
        fullPath: "/v1/accounts/{account}/persons"
      }),
      deleteExternalAccount: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/accounts/{account}/external_accounts/{id}"
      }),
      deletePerson: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/accounts/{account}/persons/{person}"
      }),
      listCapabilities: stripeMethod({
        method: "GET",
        fullPath: "/v1/accounts/{account}/capabilities",
        methodType: "list"
      }),
      listExternalAccounts: stripeMethod({
        method: "GET",
        fullPath: "/v1/accounts/{account}/external_accounts",
        methodType: "list"
      }),
      listPersons: stripeMethod({
        method: "GET",
        fullPath: "/v1/accounts/{account}/persons",
        methodType: "list"
      }),
      reject: stripeMethod({
        method: "POST",
        fullPath: "/v1/accounts/{account}/reject"
      }),
      retrieveCurrent: stripeMethod({ method: "GET", fullPath: "/v1/account" }),
      retrieveCapability: stripeMethod({
        method: "GET",
        fullPath: "/v1/accounts/{account}/capabilities/{capability}"
      }),
      retrieveExternalAccount: stripeMethod({
        method: "GET",
        fullPath: "/v1/accounts/{account}/external_accounts/{id}"
      }),
      retrievePerson: stripeMethod({
        method: "GET",
        fullPath: "/v1/accounts/{account}/persons/{person}"
      }),
      updateCapability: stripeMethod({
        method: "POST",
        fullPath: "/v1/accounts/{account}/capabilities/{capability}"
      }),
      updateExternalAccount: stripeMethod({
        method: "POST",
        fullPath: "/v1/accounts/{account}/external_accounts/{id}"
      }),
      updatePerson: stripeMethod({
        method: "POST",
        fullPath: "/v1/accounts/{account}/persons/{person}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/AccountLinks.js
var require_AccountLinks = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/AccountLinks.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.AccountLinks = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.AccountLinks = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/account_links" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/AccountSessions.js
var require_AccountSessions = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/AccountSessions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.AccountSessions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.AccountSessions = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/account_sessions" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/ApplePayDomains.js
var require_ApplePayDomains = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/ApplePayDomains.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ApplePayDomains = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ApplePayDomains = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/apple_pay/domains" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/apple_pay/domains/{domain}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/apple_pay/domains",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/apple_pay/domains/{domain}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/ApplicationFees.js
var require_ApplicationFees = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/ApplicationFees.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ApplicationFees = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ApplicationFees = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/application_fees/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/application_fees",
        methodType: "list"
      }),
      createRefund: stripeMethod({
        method: "POST",
        fullPath: "/v1/application_fees/{id}/refunds"
      }),
      listRefunds: stripeMethod({
        method: "GET",
        fullPath: "/v1/application_fees/{id}/refunds",
        methodType: "list"
      }),
      retrieveRefund: stripeMethod({
        method: "GET",
        fullPath: "/v1/application_fees/{fee}/refunds/{id}"
      }),
      updateRefund: stripeMethod({
        method: "POST",
        fullPath: "/v1/application_fees/{fee}/refunds/{id}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Balance.js
var require_Balance = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Balance.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Balance = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Balance = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/balance" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/BalanceTransactions.js
var require_BalanceTransactions = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/BalanceTransactions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.BalanceTransactions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.BalanceTransactions = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/balance_transactions/{id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/balance_transactions",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Charges.js
var require_Charges = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Charges.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Charges = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Charges = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/charges" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/charges/{charge}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/charges/{charge}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/charges",
        methodType: "list"
      }),
      capture: stripeMethod({
        method: "POST",
        fullPath: "/v1/charges/{charge}/capture"
      }),
      search: stripeMethod({
        method: "GET",
        fullPath: "/v1/charges/search",
        methodType: "search"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/ConfirmationTokens.js
var require_ConfirmationTokens2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/ConfirmationTokens.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ConfirmationTokens = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ConfirmationTokens = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/confirmation_tokens/{confirmation_token}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/CountrySpecs.js
var require_CountrySpecs = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/CountrySpecs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CountrySpecs = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.CountrySpecs = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/country_specs/{country}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/country_specs",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Coupons.js
var require_Coupons = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Coupons.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Coupons = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Coupons = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/coupons" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/coupons/{coupon}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/coupons/{coupon}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/coupons",
        methodType: "list"
      }),
      del: stripeMethod({ method: "DELETE", fullPath: "/v1/coupons/{coupon}" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/CreditNotes.js
var require_CreditNotes = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/CreditNotes.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CreditNotes = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.CreditNotes = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/credit_notes" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/credit_notes/{id}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/credit_notes/{id}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/credit_notes",
        methodType: "list"
      }),
      listLineItems: stripeMethod({
        method: "GET",
        fullPath: "/v1/credit_notes/{credit_note}/lines",
        methodType: "list"
      }),
      listPreviewLineItems: stripeMethod({
        method: "GET",
        fullPath: "/v1/credit_notes/preview/lines",
        methodType: "list"
      }),
      preview: stripeMethod({ method: "GET", fullPath: "/v1/credit_notes/preview" }),
      voidCreditNote: stripeMethod({
        method: "POST",
        fullPath: "/v1/credit_notes/{id}/void"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/CustomerSessions.js
var require_CustomerSessions = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/CustomerSessions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CustomerSessions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.CustomerSessions = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/customer_sessions" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Customers.js
var require_Customers2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Customers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Customers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Customers = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/customers" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/customers/{customer}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/customers/{customer}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers",
        methodType: "list"
      }),
      del: stripeMethod({ method: "DELETE", fullPath: "/v1/customers/{customer}" }),
      createBalanceTransaction: stripeMethod({
        method: "POST",
        fullPath: "/v1/customers/{customer}/balance_transactions"
      }),
      createFundingInstructions: stripeMethod({
        method: "POST",
        fullPath: "/v1/customers/{customer}/funding_instructions"
      }),
      createSource: stripeMethod({
        method: "POST",
        fullPath: "/v1/customers/{customer}/sources"
      }),
      createTaxId: stripeMethod({
        method: "POST",
        fullPath: "/v1/customers/{customer}/tax_ids"
      }),
      deleteDiscount: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/customers/{customer}/discount"
      }),
      deleteSource: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/customers/{customer}/sources/{id}"
      }),
      deleteTaxId: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/customers/{customer}/tax_ids/{id}"
      }),
      listBalanceTransactions: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/balance_transactions",
        methodType: "list"
      }),
      listCashBalanceTransactions: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/cash_balance_transactions",
        methodType: "list"
      }),
      listPaymentMethods: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/payment_methods",
        methodType: "list"
      }),
      listSources: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/sources",
        methodType: "list"
      }),
      listTaxIds: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/tax_ids",
        methodType: "list"
      }),
      retrieveBalanceTransaction: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/balance_transactions/{transaction}"
      }),
      retrieveCashBalance: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/cash_balance"
      }),
      retrieveCashBalanceTransaction: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/cash_balance_transactions/{transaction}"
      }),
      retrievePaymentMethod: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/payment_methods/{payment_method}"
      }),
      retrieveSource: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/sources/{id}"
      }),
      retrieveTaxId: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/{customer}/tax_ids/{id}"
      }),
      search: stripeMethod({
        method: "GET",
        fullPath: "/v1/customers/search",
        methodType: "search"
      }),
      updateBalanceTransaction: stripeMethod({
        method: "POST",
        fullPath: "/v1/customers/{customer}/balance_transactions/{transaction}"
      }),
      updateCashBalance: stripeMethod({
        method: "POST",
        fullPath: "/v1/customers/{customer}/cash_balance"
      }),
      updateSource: stripeMethod({
        method: "POST",
        fullPath: "/v1/customers/{customer}/sources/{id}"
      }),
      verifySource: stripeMethod({
        method: "POST",
        fullPath: "/v1/customers/{customer}/sources/{id}/verify"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Disputes.js
var require_Disputes2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Disputes.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Disputes = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Disputes = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/disputes/{dispute}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/disputes/{dispute}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/disputes",
        methodType: "list"
      }),
      close: stripeMethod({
        method: "POST",
        fullPath: "/v1/disputes/{dispute}/close"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/EphemeralKeys.js
var require_EphemeralKeys = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/EphemeralKeys.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EphemeralKeys = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.EphemeralKeys = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/ephemeral_keys",
        validator: (data, options) => {
          if (!options.headers || !options.headers["Stripe-Version"]) {
            throw new Error("Passing apiVersion in a separate options hash is required to create an ephemeral key. See https://stripe.com/docs/api/versioning?lang=node");
          }
        }
      }),
      del: stripeMethod({ method: "DELETE", fullPath: "/v1/ephemeral_keys/{key}" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Events.js
var require_Events = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Events.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Events = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Events = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/events/{id}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/events",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/ExchangeRates.js
var require_ExchangeRates = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/ExchangeRates.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ExchangeRates = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ExchangeRates = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/exchange_rates/{rate_id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/exchange_rates",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/FileLinks.js
var require_FileLinks = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/FileLinks.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FileLinks = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.FileLinks = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/file_links" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/file_links/{link}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/file_links/{link}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/file_links",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/multipart.js
var require_multipart = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/multipart.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.multipartRequestDataProcessor = void 0;
    var utils_js_1 = require_utils3();
    var multipartDataGenerator = (method, data, headers) => {
      const segno = (Math.round(Math.random() * 1e16) + Math.round(Math.random() * 1e16)).toString();
      headers["Content-Type"] = `multipart/form-data; boundary=${segno}`;
      const textEncoder = new TextEncoder();
      let buffer = new Uint8Array(0);
      const endBuffer = textEncoder.encode("\r\n");
      function push(l) {
        const prevBuffer = buffer;
        const newBuffer = l instanceof Uint8Array ? l : new Uint8Array(textEncoder.encode(l));
        buffer = new Uint8Array(prevBuffer.length + newBuffer.length + 2);
        buffer.set(prevBuffer);
        buffer.set(newBuffer, prevBuffer.length);
        buffer.set(endBuffer, buffer.length - 2);
      }
      function q(s) {
        return `"${s.replace(/"|"/g, "%22").replace(/\r\n|\r|\n/g, " ")}"`;
      }
      const flattenedData = (0, utils_js_1.flattenAndStringify)(data);
      for (const k in flattenedData) {
        const v = flattenedData[k];
        push(`--${segno}`);
        if (Object.prototype.hasOwnProperty.call(v, "data")) {
          const typedEntry = v;
          push(`Content-Disposition: form-data; name=${q(k)}; filename=${q(typedEntry.name || "blob")}`);
          push(`Content-Type: ${typedEntry.type || "application/octet-stream"}`);
          push("");
          push(typedEntry.data);
        } else {
          push(`Content-Disposition: form-data; name=${q(k)}`);
          push("");
          push(v);
        }
      }
      push(`--${segno}--`);
      return buffer;
    };
    function multipartRequestDataProcessor(method, data, headers, callback) {
      data = data || {};
      if (method !== "POST") {
        return callback(null, (0, utils_js_1.stringifyRequestData)(data));
      }
      this._stripe._platformFunctions.tryBufferData(data).then((bufferedData) => {
        const buffer = multipartDataGenerator(method, bufferedData, headers);
        return callback(null, buffer);
      }).catch((err) => callback(err, null));
    }
    exports2.multipartRequestDataProcessor = multipartRequestDataProcessor;
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Files.js
var require_Files = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Files.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Files = void 0;
    var multipart_js_1 = require_multipart();
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Files = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/files",
        headers: {
          "Content-Type": "multipart/form-data"
        },
        host: "files.stripe.com"
      }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/files/{file}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/files",
        methodType: "list"
      }),
      requestDataProcessor: multipart_js_1.multipartRequestDataProcessor
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/InvoiceItems.js
var require_InvoiceItems = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/InvoiceItems.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InvoiceItems = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.InvoiceItems = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/invoiceitems" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/invoiceitems/{invoiceitem}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/invoiceitems/{invoiceitem}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/invoiceitems",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/invoiceitems/{invoiceitem}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Invoices.js
var require_Invoices = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Invoices.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Invoices = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Invoices = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/invoices" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/invoices/{invoice}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/invoices/{invoice}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/invoices",
        methodType: "list"
      }),
      del: stripeMethod({ method: "DELETE", fullPath: "/v1/invoices/{invoice}" }),
      finalizeInvoice: stripeMethod({
        method: "POST",
        fullPath: "/v1/invoices/{invoice}/finalize"
      }),
      listLineItems: stripeMethod({
        method: "GET",
        fullPath: "/v1/invoices/{invoice}/lines",
        methodType: "list"
      }),
      listUpcomingLines: stripeMethod({
        method: "GET",
        fullPath: "/v1/invoices/upcoming/lines",
        methodType: "list"
      }),
      markUncollectible: stripeMethod({
        method: "POST",
        fullPath: "/v1/invoices/{invoice}/mark_uncollectible"
      }),
      pay: stripeMethod({ method: "POST", fullPath: "/v1/invoices/{invoice}/pay" }),
      retrieveUpcoming: stripeMethod({
        method: "GET",
        fullPath: "/v1/invoices/upcoming"
      }),
      search: stripeMethod({
        method: "GET",
        fullPath: "/v1/invoices/search",
        methodType: "search"
      }),
      sendInvoice: stripeMethod({
        method: "POST",
        fullPath: "/v1/invoices/{invoice}/send"
      }),
      updateLineItem: stripeMethod({
        method: "POST",
        fullPath: "/v1/invoices/{invoice}/lines/{line_item_id}"
      }),
      voidInvoice: stripeMethod({
        method: "POST",
        fullPath: "/v1/invoices/{invoice}/void"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Mandates.js
var require_Mandates = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Mandates.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Mandates = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Mandates = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/mandates/{mandate}" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/OAuth.js
var require_OAuth = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/OAuth.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.OAuth = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var utils_js_1 = require_utils3();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    var oAuthHost = "connect.stripe.com";
    exports2.OAuth = StripeResource_js_1.StripeResource.extend({
      basePath: "/",
      authorizeUrl(params, options) {
        params = params || {};
        options = options || {};
        let path = "oauth/authorize";
        if (options.express) {
          path = `express/${path}`;
        }
        if (!params.response_type) {
          params.response_type = "code";
        }
        if (!params.client_id) {
          params.client_id = this._stripe.getClientId();
        }
        if (!params.scope) {
          params.scope = "read_write";
        }
        return `https://${oAuthHost}/${path}?${(0, utils_js_1.stringifyRequestData)(params)}`;
      },
      token: stripeMethod({
        method: "POST",
        path: "oauth/token",
        host: oAuthHost
      }),
      deauthorize(spec, ...args) {
        if (!spec.client_id) {
          spec.client_id = this._stripe.getClientId();
        }
        return stripeMethod({
          method: "POST",
          path: "oauth/deauthorize",
          host: oAuthHost
        }).apply(this, [spec, ...args]);
      }
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/PaymentIntents.js
var require_PaymentIntents = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/PaymentIntents.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PaymentIntents = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.PaymentIntents = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/payment_intents" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_intents/{intent}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_intents/{intent}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_intents",
        methodType: "list"
      }),
      applyCustomerBalance: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_intents/{intent}/apply_customer_balance"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_intents/{intent}/cancel"
      }),
      capture: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_intents/{intent}/capture"
      }),
      confirm: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_intents/{intent}/confirm"
      }),
      incrementAuthorization: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_intents/{intent}/increment_authorization"
      }),
      search: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_intents/search",
        methodType: "search"
      }),
      verifyMicrodeposits: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_intents/{intent}/verify_microdeposits"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/PaymentLinks.js
var require_PaymentLinks = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/PaymentLinks.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PaymentLinks = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.PaymentLinks = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/payment_links" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_links/{payment_link}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_links/{payment_link}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_links",
        methodType: "list"
      }),
      listLineItems: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_links/{payment_link}/line_items",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/PaymentMethodConfigurations.js
var require_PaymentMethodConfigurations = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/PaymentMethodConfigurations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PaymentMethodConfigurations = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.PaymentMethodConfigurations = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_method_configurations"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_method_configurations/{configuration}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_method_configurations/{configuration}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_method_configurations",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/PaymentMethodDomains.js
var require_PaymentMethodDomains = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/PaymentMethodDomains.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PaymentMethodDomains = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.PaymentMethodDomains = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_method_domains"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_method_domains/{payment_method_domain}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_method_domains/{payment_method_domain}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_method_domains",
        methodType: "list"
      }),
      validate: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_method_domains/{payment_method_domain}/validate"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/PaymentMethods.js
var require_PaymentMethods = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/PaymentMethods.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PaymentMethods = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.PaymentMethods = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/payment_methods" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_methods/{payment_method}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_methods/{payment_method}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/payment_methods",
        methodType: "list"
      }),
      attach: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_methods/{payment_method}/attach"
      }),
      detach: stripeMethod({
        method: "POST",
        fullPath: "/v1/payment_methods/{payment_method}/detach"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Payouts.js
var require_Payouts = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Payouts.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Payouts = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Payouts = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/payouts" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/payouts/{payout}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/payouts/{payout}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/payouts",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/payouts/{payout}/cancel"
      }),
      reverse: stripeMethod({
        method: "POST",
        fullPath: "/v1/payouts/{payout}/reverse"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Plans.js
var require_Plans = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Plans.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Plans = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Plans = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/plans" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/plans/{plan}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/plans/{plan}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/plans",
        methodType: "list"
      }),
      del: stripeMethod({ method: "DELETE", fullPath: "/v1/plans/{plan}" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Prices.js
var require_Prices = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Prices.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Prices = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Prices = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/prices" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/prices/{price}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/prices/{price}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/prices",
        methodType: "list"
      }),
      search: stripeMethod({
        method: "GET",
        fullPath: "/v1/prices/search",
        methodType: "search"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Products.js
var require_Products2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Products.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Products = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Products = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/products" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/products/{id}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/products/{id}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/products",
        methodType: "list"
      }),
      del: stripeMethod({ method: "DELETE", fullPath: "/v1/products/{id}" }),
      createFeature: stripeMethod({
        method: "POST",
        fullPath: "/v1/products/{product}/features"
      }),
      deleteFeature: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/products/{product}/features/{id}"
      }),
      listFeatures: stripeMethod({
        method: "GET",
        fullPath: "/v1/products/{product}/features",
        methodType: "list"
      }),
      retrieveFeature: stripeMethod({
        method: "GET",
        fullPath: "/v1/products/{product}/features/{id}"
      }),
      search: stripeMethod({
        method: "GET",
        fullPath: "/v1/products/search",
        methodType: "search"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/PromotionCodes.js
var require_PromotionCodes = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/PromotionCodes.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PromotionCodes = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.PromotionCodes = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/promotion_codes" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/promotion_codes/{promotion_code}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/promotion_codes/{promotion_code}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/promotion_codes",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Quotes.js
var require_Quotes = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Quotes.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Quotes = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Quotes = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/quotes" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/quotes/{quote}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/quotes/{quote}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/quotes",
        methodType: "list"
      }),
      accept: stripeMethod({ method: "POST", fullPath: "/v1/quotes/{quote}/accept" }),
      cancel: stripeMethod({ method: "POST", fullPath: "/v1/quotes/{quote}/cancel" }),
      finalizeQuote: stripeMethod({
        method: "POST",
        fullPath: "/v1/quotes/{quote}/finalize"
      }),
      listComputedUpfrontLineItems: stripeMethod({
        method: "GET",
        fullPath: "/v1/quotes/{quote}/computed_upfront_line_items",
        methodType: "list"
      }),
      listLineItems: stripeMethod({
        method: "GET",
        fullPath: "/v1/quotes/{quote}/line_items",
        methodType: "list"
      }),
      pdf: stripeMethod({
        method: "GET",
        fullPath: "/v1/quotes/{quote}/pdf",
        host: "files.stripe.com",
        streaming: true
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Refunds.js
var require_Refunds2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Refunds.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Refunds = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Refunds = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/refunds" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/refunds/{refund}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/refunds/{refund}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/refunds",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/refunds/{refund}/cancel"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Reviews.js
var require_Reviews = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Reviews.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Reviews = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Reviews = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/reviews/{review}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/reviews",
        methodType: "list"
      }),
      approve: stripeMethod({
        method: "POST",
        fullPath: "/v1/reviews/{review}/approve"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/SetupAttempts.js
var require_SetupAttempts = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/SetupAttempts.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SetupAttempts = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.SetupAttempts = StripeResource_js_1.StripeResource.extend({
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/setup_attempts",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/SetupIntents.js
var require_SetupIntents = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/SetupIntents.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SetupIntents = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.SetupIntents = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/setup_intents" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/setup_intents/{intent}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/setup_intents/{intent}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/setup_intents",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/setup_intents/{intent}/cancel"
      }),
      confirm: stripeMethod({
        method: "POST",
        fullPath: "/v1/setup_intents/{intent}/confirm"
      }),
      verifyMicrodeposits: stripeMethod({
        method: "POST",
        fullPath: "/v1/setup_intents/{intent}/verify_microdeposits"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/ShippingRates.js
var require_ShippingRates = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/ShippingRates.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ShippingRates = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.ShippingRates = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/shipping_rates" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/shipping_rates/{shipping_rate_token}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/shipping_rates/{shipping_rate_token}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/shipping_rates",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Sources.js
var require_Sources = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Sources.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Sources = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Sources = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/sources" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/sources/{source}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/sources/{source}" }),
      listSourceTransactions: stripeMethod({
        method: "GET",
        fullPath: "/v1/sources/{source}/source_transactions",
        methodType: "list"
      }),
      verify: stripeMethod({
        method: "POST",
        fullPath: "/v1/sources/{source}/verify"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/SubscriptionItems.js
var require_SubscriptionItems = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/SubscriptionItems.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SubscriptionItems = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.SubscriptionItems = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/subscription_items" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/subscription_items/{item}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/subscription_items/{item}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/subscription_items",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/subscription_items/{item}"
      }),
      createUsageRecord: stripeMethod({
        method: "POST",
        fullPath: "/v1/subscription_items/{subscription_item}/usage_records"
      }),
      listUsageRecordSummaries: stripeMethod({
        method: "GET",
        fullPath: "/v1/subscription_items/{subscription_item}/usage_record_summaries",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/SubscriptionSchedules.js
var require_SubscriptionSchedules = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/SubscriptionSchedules.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SubscriptionSchedules = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.SubscriptionSchedules = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({
        method: "POST",
        fullPath: "/v1/subscription_schedules"
      }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/subscription_schedules/{schedule}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/subscription_schedules/{schedule}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/subscription_schedules",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "POST",
        fullPath: "/v1/subscription_schedules/{schedule}/cancel"
      }),
      release: stripeMethod({
        method: "POST",
        fullPath: "/v1/subscription_schedules/{schedule}/release"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Subscriptions.js
var require_Subscriptions = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Subscriptions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Subscriptions = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Subscriptions = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/subscriptions" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/subscriptions/{subscription_exposed_id}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/subscriptions/{subscription_exposed_id}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/subscriptions",
        methodType: "list"
      }),
      cancel: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/subscriptions/{subscription_exposed_id}"
      }),
      deleteDiscount: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/subscriptions/{subscription_exposed_id}/discount"
      }),
      resume: stripeMethod({
        method: "POST",
        fullPath: "/v1/subscriptions/{subscription}/resume"
      }),
      search: stripeMethod({
        method: "GET",
        fullPath: "/v1/subscriptions/search",
        methodType: "search"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TaxCodes.js
var require_TaxCodes = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TaxCodes.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TaxCodes = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.TaxCodes = StripeResource_js_1.StripeResource.extend({
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/tax_codes/{id}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/tax_codes",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TaxIds.js
var require_TaxIds = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TaxIds.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TaxIds = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.TaxIds = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/tax_ids" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/tax_ids/{id}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/tax_ids",
        methodType: "list"
      }),
      del: stripeMethod({ method: "DELETE", fullPath: "/v1/tax_ids/{id}" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/TaxRates.js
var require_TaxRates = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/TaxRates.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TaxRates = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.TaxRates = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/tax_rates" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/tax_rates/{tax_rate}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/tax_rates/{tax_rate}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/tax_rates",
        methodType: "list"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Tokens.js
var require_Tokens2 = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Tokens.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Tokens = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Tokens = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/tokens" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/tokens/{token}" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Topups.js
var require_Topups = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Topups.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Topups = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Topups = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/topups" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/topups/{topup}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/topups/{topup}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/topups",
        methodType: "list"
      }),
      cancel: stripeMethod({ method: "POST", fullPath: "/v1/topups/{topup}/cancel" })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/Transfers.js
var require_Transfers = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/Transfers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Transfers = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.Transfers = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/transfers" }),
      retrieve: stripeMethod({ method: "GET", fullPath: "/v1/transfers/{transfer}" }),
      update: stripeMethod({ method: "POST", fullPath: "/v1/transfers/{transfer}" }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/transfers",
        methodType: "list"
      }),
      createReversal: stripeMethod({
        method: "POST",
        fullPath: "/v1/transfers/{id}/reversals"
      }),
      listReversals: stripeMethod({
        method: "GET",
        fullPath: "/v1/transfers/{id}/reversals",
        methodType: "list"
      }),
      retrieveReversal: stripeMethod({
        method: "GET",
        fullPath: "/v1/transfers/{transfer}/reversals/{id}"
      }),
      updateReversal: stripeMethod({
        method: "POST",
        fullPath: "/v1/transfers/{transfer}/reversals/{id}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources/WebhookEndpoints.js
var require_WebhookEndpoints = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources/WebhookEndpoints.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WebhookEndpoints = void 0;
    var StripeResource_js_1 = require_StripeResource();
    var stripeMethod = StripeResource_js_1.StripeResource.method;
    exports2.WebhookEndpoints = StripeResource_js_1.StripeResource.extend({
      create: stripeMethod({ method: "POST", fullPath: "/v1/webhook_endpoints" }),
      retrieve: stripeMethod({
        method: "GET",
        fullPath: "/v1/webhook_endpoints/{webhook_endpoint}"
      }),
      update: stripeMethod({
        method: "POST",
        fullPath: "/v1/webhook_endpoints/{webhook_endpoint}"
      }),
      list: stripeMethod({
        method: "GET",
        fullPath: "/v1/webhook_endpoints",
        methodType: "list"
      }),
      del: stripeMethod({
        method: "DELETE",
        fullPath: "/v1/webhook_endpoints/{webhook_endpoint}"
      })
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/resources.js
var require_resources = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/resources.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Topups = exports2.Tokens = exports2.TaxRates = exports2.TaxIds = exports2.TaxCodes = exports2.Subscriptions = exports2.SubscriptionSchedules = exports2.SubscriptionItems = exports2.Sources = exports2.ShippingRates = exports2.SetupIntents = exports2.SetupAttempts = exports2.Reviews = exports2.Refunds = exports2.Quotes = exports2.PromotionCodes = exports2.Products = exports2.Prices = exports2.Plans = exports2.Payouts = exports2.PaymentMethods = exports2.PaymentMethodDomains = exports2.PaymentMethodConfigurations = exports2.PaymentLinks = exports2.PaymentIntents = exports2.OAuth = exports2.Mandates = exports2.Invoices = exports2.InvoiceItems = exports2.Files = exports2.FileLinks = exports2.ExchangeRates = exports2.Events = exports2.EphemeralKeys = exports2.Disputes = exports2.Customers = exports2.CustomerSessions = exports2.CreditNotes = exports2.Coupons = exports2.CountrySpecs = exports2.ConfirmationTokens = exports2.Charges = exports2.BalanceTransactions = exports2.Balance = exports2.ApplicationFees = exports2.ApplePayDomains = exports2.Accounts = exports2.AccountSessions = exports2.AccountLinks = exports2.Account = void 0;
    exports2.Treasury = exports2.TestHelpers = exports2.Terminal = exports2.Tax = exports2.Sigma = exports2.Reporting = exports2.Radar = exports2.Issuing = exports2.Identity = exports2.Forwarding = exports2.FinancialConnections = exports2.Entitlements = exports2.Climate = exports2.Checkout = exports2.BillingPortal = exports2.Billing = exports2.Apps = exports2.WebhookEndpoints = exports2.Transfers = void 0;
    var ResourceNamespace_js_1 = require_ResourceNamespace();
    var Accounts_js_1 = require_Accounts();
    var ActiveEntitlements_js_1 = require_ActiveEntitlements();
    var Authorizations_js_1 = require_Authorizations();
    var Authorizations_js_2 = require_Authorizations2();
    var Calculations_js_1 = require_Calculations();
    var Cardholders_js_1 = require_Cardholders();
    var Cards_js_1 = require_Cards();
    var Cards_js_2 = require_Cards2();
    var Configurations_js_1 = require_Configurations();
    var Configurations_js_2 = require_Configurations2();
    var ConfirmationTokens_js_1 = require_ConfirmationTokens();
    var ConnectionTokens_js_1 = require_ConnectionTokens();
    var CreditReversals_js_1 = require_CreditReversals();
    var Customers_js_1 = require_Customers();
    var DebitReversals_js_1 = require_DebitReversals();
    var Disputes_js_1 = require_Disputes();
    var EarlyFraudWarnings_js_1 = require_EarlyFraudWarnings();
    var Features_js_1 = require_Features();
    var FinancialAccounts_js_1 = require_FinancialAccounts();
    var InboundTransfers_js_1 = require_InboundTransfers();
    var InboundTransfers_js_2 = require_InboundTransfers2();
    var Locations_js_1 = require_Locations();
    var MeterEventAdjustments_js_1 = require_MeterEventAdjustments();
    var MeterEvents_js_1 = require_MeterEvents();
    var Meters_js_1 = require_Meters();
    var Orders_js_1 = require_Orders();
    var OutboundPayments_js_1 = require_OutboundPayments();
    var OutboundPayments_js_2 = require_OutboundPayments2();
    var OutboundTransfers_js_1 = require_OutboundTransfers();
    var OutboundTransfers_js_2 = require_OutboundTransfers2();
    var PersonalizationDesigns_js_1 = require_PersonalizationDesigns();
    var PersonalizationDesigns_js_2 = require_PersonalizationDesigns2();
    var PhysicalBundles_js_1 = require_PhysicalBundles();
    var Products_js_1 = require_Products();
    var Readers_js_1 = require_Readers();
    var Readers_js_2 = require_Readers2();
    var ReceivedCredits_js_1 = require_ReceivedCredits();
    var ReceivedCredits_js_2 = require_ReceivedCredits2();
    var ReceivedDebits_js_1 = require_ReceivedDebits();
    var ReceivedDebits_js_2 = require_ReceivedDebits2();
    var Refunds_js_1 = require_Refunds();
    var Registrations_js_1 = require_Registrations();
    var ReportRuns_js_1 = require_ReportRuns();
    var ReportTypes_js_1 = require_ReportTypes();
    var Requests_js_1 = require_Requests();
    var ScheduledQueryRuns_js_1 = require_ScheduledQueryRuns();
    var Secrets_js_1 = require_Secrets();
    var Sessions_js_1 = require_Sessions();
    var Sessions_js_2 = require_Sessions2();
    var Sessions_js_3 = require_Sessions3();
    var Settings_js_1 = require_Settings();
    var Suppliers_js_1 = require_Suppliers();
    var TestClocks_js_1 = require_TestClocks();
    var Tokens_js_1 = require_Tokens();
    var TransactionEntries_js_1 = require_TransactionEntries();
    var Transactions_js_1 = require_Transactions();
    var Transactions_js_2 = require_Transactions2();
    var Transactions_js_3 = require_Transactions3();
    var Transactions_js_4 = require_Transactions4();
    var Transactions_js_5 = require_Transactions5();
    var ValueListItems_js_1 = require_ValueListItems();
    var ValueLists_js_1 = require_ValueLists();
    var VerificationReports_js_1 = require_VerificationReports();
    var VerificationSessions_js_1 = require_VerificationSessions();
    var Accounts_js_2 = require_Accounts2();
    Object.defineProperty(exports2, "Account", { enumerable: true, get: function() {
      return Accounts_js_2.Accounts;
    } });
    var AccountLinks_js_1 = require_AccountLinks();
    Object.defineProperty(exports2, "AccountLinks", { enumerable: true, get: function() {
      return AccountLinks_js_1.AccountLinks;
    } });
    var AccountSessions_js_1 = require_AccountSessions();
    Object.defineProperty(exports2, "AccountSessions", { enumerable: true, get: function() {
      return AccountSessions_js_1.AccountSessions;
    } });
    var Accounts_js_3 = require_Accounts2();
    Object.defineProperty(exports2, "Accounts", { enumerable: true, get: function() {
      return Accounts_js_3.Accounts;
    } });
    var ApplePayDomains_js_1 = require_ApplePayDomains();
    Object.defineProperty(exports2, "ApplePayDomains", { enumerable: true, get: function() {
      return ApplePayDomains_js_1.ApplePayDomains;
    } });
    var ApplicationFees_js_1 = require_ApplicationFees();
    Object.defineProperty(exports2, "ApplicationFees", { enumerable: true, get: function() {
      return ApplicationFees_js_1.ApplicationFees;
    } });
    var Balance_js_1 = require_Balance();
    Object.defineProperty(exports2, "Balance", { enumerable: true, get: function() {
      return Balance_js_1.Balance;
    } });
    var BalanceTransactions_js_1 = require_BalanceTransactions();
    Object.defineProperty(exports2, "BalanceTransactions", { enumerable: true, get: function() {
      return BalanceTransactions_js_1.BalanceTransactions;
    } });
    var Charges_js_1 = require_Charges();
    Object.defineProperty(exports2, "Charges", { enumerable: true, get: function() {
      return Charges_js_1.Charges;
    } });
    var ConfirmationTokens_js_2 = require_ConfirmationTokens2();
    Object.defineProperty(exports2, "ConfirmationTokens", { enumerable: true, get: function() {
      return ConfirmationTokens_js_2.ConfirmationTokens;
    } });
    var CountrySpecs_js_1 = require_CountrySpecs();
    Object.defineProperty(exports2, "CountrySpecs", { enumerable: true, get: function() {
      return CountrySpecs_js_1.CountrySpecs;
    } });
    var Coupons_js_1 = require_Coupons();
    Object.defineProperty(exports2, "Coupons", { enumerable: true, get: function() {
      return Coupons_js_1.Coupons;
    } });
    var CreditNotes_js_1 = require_CreditNotes();
    Object.defineProperty(exports2, "CreditNotes", { enumerable: true, get: function() {
      return CreditNotes_js_1.CreditNotes;
    } });
    var CustomerSessions_js_1 = require_CustomerSessions();
    Object.defineProperty(exports2, "CustomerSessions", { enumerable: true, get: function() {
      return CustomerSessions_js_1.CustomerSessions;
    } });
    var Customers_js_2 = require_Customers2();
    Object.defineProperty(exports2, "Customers", { enumerable: true, get: function() {
      return Customers_js_2.Customers;
    } });
    var Disputes_js_2 = require_Disputes2();
    Object.defineProperty(exports2, "Disputes", { enumerable: true, get: function() {
      return Disputes_js_2.Disputes;
    } });
    var EphemeralKeys_js_1 = require_EphemeralKeys();
    Object.defineProperty(exports2, "EphemeralKeys", { enumerable: true, get: function() {
      return EphemeralKeys_js_1.EphemeralKeys;
    } });
    var Events_js_1 = require_Events();
    Object.defineProperty(exports2, "Events", { enumerable: true, get: function() {
      return Events_js_1.Events;
    } });
    var ExchangeRates_js_1 = require_ExchangeRates();
    Object.defineProperty(exports2, "ExchangeRates", { enumerable: true, get: function() {
      return ExchangeRates_js_1.ExchangeRates;
    } });
    var FileLinks_js_1 = require_FileLinks();
    Object.defineProperty(exports2, "FileLinks", { enumerable: true, get: function() {
      return FileLinks_js_1.FileLinks;
    } });
    var Files_js_1 = require_Files();
    Object.defineProperty(exports2, "Files", { enumerable: true, get: function() {
      return Files_js_1.Files;
    } });
    var InvoiceItems_js_1 = require_InvoiceItems();
    Object.defineProperty(exports2, "InvoiceItems", { enumerable: true, get: function() {
      return InvoiceItems_js_1.InvoiceItems;
    } });
    var Invoices_js_1 = require_Invoices();
    Object.defineProperty(exports2, "Invoices", { enumerable: true, get: function() {
      return Invoices_js_1.Invoices;
    } });
    var Mandates_js_1 = require_Mandates();
    Object.defineProperty(exports2, "Mandates", { enumerable: true, get: function() {
      return Mandates_js_1.Mandates;
    } });
    var OAuth_js_1 = require_OAuth();
    Object.defineProperty(exports2, "OAuth", { enumerable: true, get: function() {
      return OAuth_js_1.OAuth;
    } });
    var PaymentIntents_js_1 = require_PaymentIntents();
    Object.defineProperty(exports2, "PaymentIntents", { enumerable: true, get: function() {
      return PaymentIntents_js_1.PaymentIntents;
    } });
    var PaymentLinks_js_1 = require_PaymentLinks();
    Object.defineProperty(exports2, "PaymentLinks", { enumerable: true, get: function() {
      return PaymentLinks_js_1.PaymentLinks;
    } });
    var PaymentMethodConfigurations_js_1 = require_PaymentMethodConfigurations();
    Object.defineProperty(exports2, "PaymentMethodConfigurations", { enumerable: true, get: function() {
      return PaymentMethodConfigurations_js_1.PaymentMethodConfigurations;
    } });
    var PaymentMethodDomains_js_1 = require_PaymentMethodDomains();
    Object.defineProperty(exports2, "PaymentMethodDomains", { enumerable: true, get: function() {
      return PaymentMethodDomains_js_1.PaymentMethodDomains;
    } });
    var PaymentMethods_js_1 = require_PaymentMethods();
    Object.defineProperty(exports2, "PaymentMethods", { enumerable: true, get: function() {
      return PaymentMethods_js_1.PaymentMethods;
    } });
    var Payouts_js_1 = require_Payouts();
    Object.defineProperty(exports2, "Payouts", { enumerable: true, get: function() {
      return Payouts_js_1.Payouts;
    } });
    var Plans_js_1 = require_Plans();
    Object.defineProperty(exports2, "Plans", { enumerable: true, get: function() {
      return Plans_js_1.Plans;
    } });
    var Prices_js_1 = require_Prices();
    Object.defineProperty(exports2, "Prices", { enumerable: true, get: function() {
      return Prices_js_1.Prices;
    } });
    var Products_js_2 = require_Products2();
    Object.defineProperty(exports2, "Products", { enumerable: true, get: function() {
      return Products_js_2.Products;
    } });
    var PromotionCodes_js_1 = require_PromotionCodes();
    Object.defineProperty(exports2, "PromotionCodes", { enumerable: true, get: function() {
      return PromotionCodes_js_1.PromotionCodes;
    } });
    var Quotes_js_1 = require_Quotes();
    Object.defineProperty(exports2, "Quotes", { enumerable: true, get: function() {
      return Quotes_js_1.Quotes;
    } });
    var Refunds_js_2 = require_Refunds2();
    Object.defineProperty(exports2, "Refunds", { enumerable: true, get: function() {
      return Refunds_js_2.Refunds;
    } });
    var Reviews_js_1 = require_Reviews();
    Object.defineProperty(exports2, "Reviews", { enumerable: true, get: function() {
      return Reviews_js_1.Reviews;
    } });
    var SetupAttempts_js_1 = require_SetupAttempts();
    Object.defineProperty(exports2, "SetupAttempts", { enumerable: true, get: function() {
      return SetupAttempts_js_1.SetupAttempts;
    } });
    var SetupIntents_js_1 = require_SetupIntents();
    Object.defineProperty(exports2, "SetupIntents", { enumerable: true, get: function() {
      return SetupIntents_js_1.SetupIntents;
    } });
    var ShippingRates_js_1 = require_ShippingRates();
    Object.defineProperty(exports2, "ShippingRates", { enumerable: true, get: function() {
      return ShippingRates_js_1.ShippingRates;
    } });
    var Sources_js_1 = require_Sources();
    Object.defineProperty(exports2, "Sources", { enumerable: true, get: function() {
      return Sources_js_1.Sources;
    } });
    var SubscriptionItems_js_1 = require_SubscriptionItems();
    Object.defineProperty(exports2, "SubscriptionItems", { enumerable: true, get: function() {
      return SubscriptionItems_js_1.SubscriptionItems;
    } });
    var SubscriptionSchedules_js_1 = require_SubscriptionSchedules();
    Object.defineProperty(exports2, "SubscriptionSchedules", { enumerable: true, get: function() {
      return SubscriptionSchedules_js_1.SubscriptionSchedules;
    } });
    var Subscriptions_js_1 = require_Subscriptions();
    Object.defineProperty(exports2, "Subscriptions", { enumerable: true, get: function() {
      return Subscriptions_js_1.Subscriptions;
    } });
    var TaxCodes_js_1 = require_TaxCodes();
    Object.defineProperty(exports2, "TaxCodes", { enumerable: true, get: function() {
      return TaxCodes_js_1.TaxCodes;
    } });
    var TaxIds_js_1 = require_TaxIds();
    Object.defineProperty(exports2, "TaxIds", { enumerable: true, get: function() {
      return TaxIds_js_1.TaxIds;
    } });
    var TaxRates_js_1 = require_TaxRates();
    Object.defineProperty(exports2, "TaxRates", { enumerable: true, get: function() {
      return TaxRates_js_1.TaxRates;
    } });
    var Tokens_js_2 = require_Tokens2();
    Object.defineProperty(exports2, "Tokens", { enumerable: true, get: function() {
      return Tokens_js_2.Tokens;
    } });
    var Topups_js_1 = require_Topups();
    Object.defineProperty(exports2, "Topups", { enumerable: true, get: function() {
      return Topups_js_1.Topups;
    } });
    var Transfers_js_1 = require_Transfers();
    Object.defineProperty(exports2, "Transfers", { enumerable: true, get: function() {
      return Transfers_js_1.Transfers;
    } });
    var WebhookEndpoints_js_1 = require_WebhookEndpoints();
    Object.defineProperty(exports2, "WebhookEndpoints", { enumerable: true, get: function() {
      return WebhookEndpoints_js_1.WebhookEndpoints;
    } });
    exports2.Apps = (0, ResourceNamespace_js_1.resourceNamespace)("apps", { Secrets: Secrets_js_1.Secrets });
    exports2.Billing = (0, ResourceNamespace_js_1.resourceNamespace)("billing", {
      MeterEventAdjustments: MeterEventAdjustments_js_1.MeterEventAdjustments,
      MeterEvents: MeterEvents_js_1.MeterEvents,
      Meters: Meters_js_1.Meters
    });
    exports2.BillingPortal = (0, ResourceNamespace_js_1.resourceNamespace)("billingPortal", {
      Configurations: Configurations_js_1.Configurations,
      Sessions: Sessions_js_1.Sessions
    });
    exports2.Checkout = (0, ResourceNamespace_js_1.resourceNamespace)("checkout", {
      Sessions: Sessions_js_2.Sessions
    });
    exports2.Climate = (0, ResourceNamespace_js_1.resourceNamespace)("climate", {
      Orders: Orders_js_1.Orders,
      Products: Products_js_1.Products,
      Suppliers: Suppliers_js_1.Suppliers
    });
    exports2.Entitlements = (0, ResourceNamespace_js_1.resourceNamespace)("entitlements", {
      ActiveEntitlements: ActiveEntitlements_js_1.ActiveEntitlements,
      Features: Features_js_1.Features
    });
    exports2.FinancialConnections = (0, ResourceNamespace_js_1.resourceNamespace)("financialConnections", {
      Accounts: Accounts_js_1.Accounts,
      Sessions: Sessions_js_3.Sessions,
      Transactions: Transactions_js_2.Transactions
    });
    exports2.Forwarding = (0, ResourceNamespace_js_1.resourceNamespace)("forwarding", {
      Requests: Requests_js_1.Requests
    });
    exports2.Identity = (0, ResourceNamespace_js_1.resourceNamespace)("identity", {
      VerificationReports: VerificationReports_js_1.VerificationReports,
      VerificationSessions: VerificationSessions_js_1.VerificationSessions
    });
    exports2.Issuing = (0, ResourceNamespace_js_1.resourceNamespace)("issuing", {
      Authorizations: Authorizations_js_2.Authorizations,
      Cardholders: Cardholders_js_1.Cardholders,
      Cards: Cards_js_2.Cards,
      Disputes: Disputes_js_1.Disputes,
      PersonalizationDesigns: PersonalizationDesigns_js_2.PersonalizationDesigns,
      PhysicalBundles: PhysicalBundles_js_1.PhysicalBundles,
      Tokens: Tokens_js_1.Tokens,
      Transactions: Transactions_js_3.Transactions
    });
    exports2.Radar = (0, ResourceNamespace_js_1.resourceNamespace)("radar", {
      EarlyFraudWarnings: EarlyFraudWarnings_js_1.EarlyFraudWarnings,
      ValueListItems: ValueListItems_js_1.ValueListItems,
      ValueLists: ValueLists_js_1.ValueLists
    });
    exports2.Reporting = (0, ResourceNamespace_js_1.resourceNamespace)("reporting", {
      ReportRuns: ReportRuns_js_1.ReportRuns,
      ReportTypes: ReportTypes_js_1.ReportTypes
    });
    exports2.Sigma = (0, ResourceNamespace_js_1.resourceNamespace)("sigma", {
      ScheduledQueryRuns: ScheduledQueryRuns_js_1.ScheduledQueryRuns
    });
    exports2.Tax = (0, ResourceNamespace_js_1.resourceNamespace)("tax", {
      Calculations: Calculations_js_1.Calculations,
      Registrations: Registrations_js_1.Registrations,
      Settings: Settings_js_1.Settings,
      Transactions: Transactions_js_4.Transactions
    });
    exports2.Terminal = (0, ResourceNamespace_js_1.resourceNamespace)("terminal", {
      Configurations: Configurations_js_2.Configurations,
      ConnectionTokens: ConnectionTokens_js_1.ConnectionTokens,
      Locations: Locations_js_1.Locations,
      Readers: Readers_js_2.Readers
    });
    exports2.TestHelpers = (0, ResourceNamespace_js_1.resourceNamespace)("testHelpers", {
      ConfirmationTokens: ConfirmationTokens_js_1.ConfirmationTokens,
      Customers: Customers_js_1.Customers,
      Refunds: Refunds_js_1.Refunds,
      TestClocks: TestClocks_js_1.TestClocks,
      Issuing: (0, ResourceNamespace_js_1.resourceNamespace)("issuing", {
        Authorizations: Authorizations_js_1.Authorizations,
        Cards: Cards_js_1.Cards,
        PersonalizationDesigns: PersonalizationDesigns_js_1.PersonalizationDesigns,
        Transactions: Transactions_js_1.Transactions
      }),
      Terminal: (0, ResourceNamespace_js_1.resourceNamespace)("terminal", {
        Readers: Readers_js_1.Readers
      }),
      Treasury: (0, ResourceNamespace_js_1.resourceNamespace)("treasury", {
        InboundTransfers: InboundTransfers_js_1.InboundTransfers,
        OutboundPayments: OutboundPayments_js_1.OutboundPayments,
        OutboundTransfers: OutboundTransfers_js_1.OutboundTransfers,
        ReceivedCredits: ReceivedCredits_js_1.ReceivedCredits,
        ReceivedDebits: ReceivedDebits_js_1.ReceivedDebits
      })
    });
    exports2.Treasury = (0, ResourceNamespace_js_1.resourceNamespace)("treasury", {
      CreditReversals: CreditReversals_js_1.CreditReversals,
      DebitReversals: DebitReversals_js_1.DebitReversals,
      FinancialAccounts: FinancialAccounts_js_1.FinancialAccounts,
      InboundTransfers: InboundTransfers_js_2.InboundTransfers,
      OutboundPayments: OutboundPayments_js_2.OutboundPayments,
      OutboundTransfers: OutboundTransfers_js_2.OutboundTransfers,
      ReceivedCredits: ReceivedCredits_js_2.ReceivedCredits,
      ReceivedDebits: ReceivedDebits_js_2.ReceivedDebits,
      TransactionEntries: TransactionEntries_js_1.TransactionEntries,
      Transactions: Transactions_js_5.Transactions
    });
  }
});

// netlify/functions/node_modules/stripe/cjs/RequestSender.js
var require_RequestSender = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/RequestSender.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.RequestSender = void 0;
    var Error_js_1 = require_Error();
    var utils_js_1 = require_utils3();
    var HttpClient_js_1 = require_HttpClient();
    var MAX_RETRY_AFTER_WAIT = 60;
    var RequestSender = class _RequestSender {
      constructor(stripe, maxBufferedRequestMetric) {
        this._stripe = stripe;
        this._maxBufferedRequestMetric = maxBufferedRequestMetric;
      }
      _addHeadersDirectlyToObject(obj, headers) {
        obj.requestId = headers["request-id"];
        obj.stripeAccount = obj.stripeAccount || headers["stripe-account"];
        obj.apiVersion = obj.apiVersion || headers["stripe-version"];
        obj.idempotencyKey = obj.idempotencyKey || headers["idempotency-key"];
      }
      _makeResponseEvent(requestEvent, statusCode, headers) {
        const requestEndTime = Date.now();
        const requestDurationMs = requestEndTime - requestEvent.request_start_time;
        return (0, utils_js_1.removeNullish)({
          api_version: headers["stripe-version"],
          account: headers["stripe-account"],
          idempotency_key: headers["idempotency-key"],
          method: requestEvent.method,
          path: requestEvent.path,
          status: statusCode,
          request_id: this._getRequestId(headers),
          elapsed: requestDurationMs,
          request_start_time: requestEvent.request_start_time,
          request_end_time: requestEndTime
        });
      }
      _getRequestId(headers) {
        return headers["request-id"];
      }
      /**
       * Used by methods with spec.streaming === true. For these methods, we do not
       * buffer successful responses into memory or do parse them into stripe
       * objects, we delegate that all of that to the user and pass back the raw
       * http.Response object to the callback.
       *
       * (Unsuccessful responses shouldn't make it here, they should
       * still be buffered/parsed and handled by _jsonResponseHandler -- see
       * makeRequest)
       */
      _streamingResponseHandler(requestEvent, usage, callback) {
        return (res) => {
          const headers = res.getHeaders();
          const streamCompleteCallback = () => {
            const responseEvent = this._makeResponseEvent(requestEvent, res.getStatusCode(), headers);
            this._stripe._emitter.emit("response", responseEvent);
            this._recordRequestMetrics(this._getRequestId(headers), responseEvent.elapsed, usage);
          };
          const stream = res.toStream(streamCompleteCallback);
          this._addHeadersDirectlyToObject(stream, headers);
          return callback(null, stream);
        };
      }
      /**
       * Default handler for Stripe responses. Buffers the response into memory,
       * parses the JSON and returns it (i.e. passes it to the callback) if there
       * is no "error" field. Otherwise constructs/passes an appropriate Error.
       */
      _jsonResponseHandler(requestEvent, usage, callback) {
        return (res) => {
          const headers = res.getHeaders();
          const requestId = this._getRequestId(headers);
          const statusCode = res.getStatusCode();
          const responseEvent = this._makeResponseEvent(requestEvent, statusCode, headers);
          this._stripe._emitter.emit("response", responseEvent);
          res.toJSON().then((jsonResponse) => {
            if (jsonResponse.error) {
              let err;
              if (typeof jsonResponse.error === "string") {
                jsonResponse.error = {
                  type: jsonResponse.error,
                  message: jsonResponse.error_description
                };
              }
              jsonResponse.error.headers = headers;
              jsonResponse.error.statusCode = statusCode;
              jsonResponse.error.requestId = requestId;
              if (statusCode === 401) {
                err = new Error_js_1.StripeAuthenticationError(jsonResponse.error);
              } else if (statusCode === 403) {
                err = new Error_js_1.StripePermissionError(jsonResponse.error);
              } else if (statusCode === 429) {
                err = new Error_js_1.StripeRateLimitError(jsonResponse.error);
              } else {
                err = Error_js_1.StripeError.generate(jsonResponse.error);
              }
              throw err;
            }
            return jsonResponse;
          }, (e) => {
            throw new Error_js_1.StripeAPIError({
              message: "Invalid JSON received from the Stripe API",
              exception: e,
              requestId: headers["request-id"]
            });
          }).then((jsonResponse) => {
            this._recordRequestMetrics(requestId, responseEvent.elapsed, usage);
            const rawResponse = res.getRawResponse();
            this._addHeadersDirectlyToObject(rawResponse, headers);
            Object.defineProperty(jsonResponse, "lastResponse", {
              enumerable: false,
              writable: false,
              value: rawResponse
            });
            callback(null, jsonResponse);
          }, (e) => callback(e, null));
        };
      }
      static _generateConnectionErrorMessage(requestRetries) {
        return `An error occurred with our connection to Stripe.${requestRetries > 0 ? ` Request was retried ${requestRetries} times.` : ""}`;
      }
      // For more on when and how to retry API requests, see https://stripe.com/docs/error-handling#safely-retrying-requests-with-idempotency
      static _shouldRetry(res, numRetries, maxRetries, error) {
        if (error && numRetries === 0 && HttpClient_js_1.HttpClient.CONNECTION_CLOSED_ERROR_CODES.includes(error.code)) {
          return true;
        }
        if (numRetries >= maxRetries) {
          return false;
        }
        if (!res) {
          return true;
        }
        if (res.getHeaders()["stripe-should-retry"] === "false") {
          return false;
        }
        if (res.getHeaders()["stripe-should-retry"] === "true") {
          return true;
        }
        if (res.getStatusCode() === 409) {
          return true;
        }
        if (res.getStatusCode() >= 500) {
          return true;
        }
        return false;
      }
      _getSleepTimeInMS(numRetries, retryAfter = null) {
        const initialNetworkRetryDelay = this._stripe.getInitialNetworkRetryDelay();
        const maxNetworkRetryDelay = this._stripe.getMaxNetworkRetryDelay();
        let sleepSeconds = Math.min(initialNetworkRetryDelay * Math.pow(numRetries - 1, 2), maxNetworkRetryDelay);
        sleepSeconds *= 0.5 * (1 + Math.random());
        sleepSeconds = Math.max(initialNetworkRetryDelay, sleepSeconds);
        if (Number.isInteger(retryAfter) && retryAfter <= MAX_RETRY_AFTER_WAIT) {
          sleepSeconds = Math.max(sleepSeconds, retryAfter);
        }
        return sleepSeconds * 1e3;
      }
      // Max retries can be set on a per request basis. Favor those over the global setting
      _getMaxNetworkRetries(settings = {}) {
        return settings.maxNetworkRetries !== void 0 && Number.isInteger(settings.maxNetworkRetries) ? settings.maxNetworkRetries : this._stripe.getMaxNetworkRetries();
      }
      _defaultIdempotencyKey(method, settings) {
        const maxRetries = this._getMaxNetworkRetries(settings);
        if (method === "POST" && maxRetries > 0) {
          return `stripe-node-retry-${this._stripe._platformFunctions.uuid4()}`;
        }
        return null;
      }
      _makeHeaders(auth, contentLength, apiVersion, clientUserAgent, method, userSuppliedHeaders, userSuppliedSettings) {
        const defaultHeaders = {
          // Use specified auth token or use default from this stripe instance:
          Authorization: auth ? `Bearer ${auth}` : this._stripe.getApiField("auth"),
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": this._getUserAgentString(),
          "X-Stripe-Client-User-Agent": clientUserAgent,
          "X-Stripe-Client-Telemetry": this._getTelemetryHeader(),
          "Stripe-Version": apiVersion,
          "Stripe-Account": this._stripe.getApiField("stripeAccount"),
          "Idempotency-Key": this._defaultIdempotencyKey(method, userSuppliedSettings)
        };
        const methodHasPayload = method == "POST" || method == "PUT" || method == "PATCH";
        if (methodHasPayload || contentLength) {
          if (!methodHasPayload) {
            (0, utils_js_1.emitWarning)(`${method} method had non-zero contentLength but no payload is expected for this verb`);
          }
          defaultHeaders["Content-Length"] = contentLength;
        }
        return Object.assign(
          (0, utils_js_1.removeNullish)(defaultHeaders),
          // If the user supplied, say 'idempotency-key', override instead of appending by ensuring caps are the same.
          (0, utils_js_1.normalizeHeaders)(userSuppliedHeaders)
        );
      }
      _getUserAgentString() {
        const packageVersion = this._stripe.getConstant("PACKAGE_VERSION");
        const appInfo = this._stripe._appInfo ? this._stripe.getAppInfoAsString() : "";
        return `Stripe/v1 NodeBindings/${packageVersion} ${appInfo}`.trim();
      }
      _getTelemetryHeader() {
        if (this._stripe.getTelemetryEnabled() && this._stripe._prevRequestMetrics.length > 0) {
          const metrics = this._stripe._prevRequestMetrics.shift();
          return JSON.stringify({
            last_request_metrics: metrics
          });
        }
      }
      _recordRequestMetrics(requestId, requestDurationMs, usage) {
        if (this._stripe.getTelemetryEnabled() && requestId) {
          if (this._stripe._prevRequestMetrics.length > this._maxBufferedRequestMetric) {
            (0, utils_js_1.emitWarning)("Request metrics buffer is full, dropping telemetry message.");
          } else {
            const m = {
              request_id: requestId,
              request_duration_ms: requestDurationMs
            };
            if (usage && usage.length > 0) {
              m.usage = usage;
            }
            this._stripe._prevRequestMetrics.push(m);
          }
        }
      }
      _request(method, host, path, data, auth, options = {}, usage = [], callback, requestDataProcessor = null) {
        let requestData;
        const retryRequest = (requestFn, apiVersion, headers, requestRetries, retryAfter) => {
          return setTimeout(requestFn, this._getSleepTimeInMS(requestRetries, retryAfter), apiVersion, headers, requestRetries + 1);
        };
        const makeRequest = (apiVersion, headers, numRetries) => {
          const timeout = options.settings && options.settings.timeout && Number.isInteger(options.settings.timeout) && options.settings.timeout >= 0 ? options.settings.timeout : this._stripe.getApiField("timeout");
          const req = this._stripe.getApiField("httpClient").makeRequest(host || this._stripe.getApiField("host"), this._stripe.getApiField("port"), path, method, headers, requestData, this._stripe.getApiField("protocol"), timeout);
          const requestStartTime = Date.now();
          const requestEvent = (0, utils_js_1.removeNullish)({
            api_version: apiVersion,
            account: headers["Stripe-Account"],
            idempotency_key: headers["Idempotency-Key"],
            method,
            path,
            request_start_time: requestStartTime
          });
          const requestRetries = numRetries || 0;
          const maxRetries = this._getMaxNetworkRetries(options.settings || {});
          this._stripe._emitter.emit("request", requestEvent);
          req.then((res) => {
            if (_RequestSender._shouldRetry(res, requestRetries, maxRetries)) {
              return retryRequest(
                makeRequest,
                apiVersion,
                headers,
                requestRetries,
                // @ts-ignore
                res.getHeaders()["retry-after"]
              );
            } else if (options.streaming && res.getStatusCode() < 400) {
              return this._streamingResponseHandler(requestEvent, usage, callback)(res);
            } else {
              return this._jsonResponseHandler(requestEvent, usage, callback)(res);
            }
          }).catch((error) => {
            if (_RequestSender._shouldRetry(null, requestRetries, maxRetries, error)) {
              return retryRequest(makeRequest, apiVersion, headers, requestRetries, null);
            } else {
              const isTimeoutError = error.code && error.code === HttpClient_js_1.HttpClient.TIMEOUT_ERROR_CODE;
              return callback(new Error_js_1.StripeConnectionError({
                message: isTimeoutError ? `Request aborted due to timeout being reached (${timeout}ms)` : _RequestSender._generateConnectionErrorMessage(requestRetries),
                // @ts-ignore
                detail: error
              }));
            }
          });
        };
        const prepareAndMakeRequest = (error, data2) => {
          if (error) {
            return callback(error);
          }
          requestData = data2;
          this._stripe.getClientUserAgent((clientUserAgent) => {
            var _a, _b;
            const apiVersion = this._stripe.getApiField("version");
            const headers = this._makeHeaders(auth, requestData.length, apiVersion, clientUserAgent, method, (_a = options.headers) !== null && _a !== void 0 ? _a : null, (_b = options.settings) !== null && _b !== void 0 ? _b : {});
            makeRequest(apiVersion, headers, 0);
          });
        };
        if (requestDataProcessor) {
          requestDataProcessor(method, data, options.headers, prepareAndMakeRequest);
        } else {
          prepareAndMakeRequest(null, (0, utils_js_1.stringifyRequestData)(data || {}));
        }
      }
    };
    exports2.RequestSender = RequestSender;
  }
});

// netlify/functions/node_modules/stripe/cjs/Webhooks.js
var require_Webhooks = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/Webhooks.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createWebhooks = void 0;
    var Error_js_1 = require_Error();
    var CryptoProvider_js_1 = require_CryptoProvider();
    function createWebhooks(platformFunctions) {
      const Webhook = {
        DEFAULT_TOLERANCE: 300,
        // @ts-ignore
        signature: null,
        constructEvent(payload, header, secret, tolerance, cryptoProvider, receivedAt) {
          try {
            this.signature.verifyHeader(payload, header, secret, tolerance || Webhook.DEFAULT_TOLERANCE, cryptoProvider, receivedAt);
          } catch (e) {
            if (e instanceof CryptoProvider_js_1.CryptoProviderOnlySupportsAsyncError) {
              e.message += "\nUse `await constructEventAsync(...)` instead of `constructEvent(...)`";
            }
            throw e;
          }
          const jsonPayload = payload instanceof Uint8Array ? JSON.parse(new TextDecoder("utf8").decode(payload)) : JSON.parse(payload);
          return jsonPayload;
        },
        async constructEventAsync(payload, header, secret, tolerance, cryptoProvider, receivedAt) {
          await this.signature.verifyHeaderAsync(payload, header, secret, tolerance || Webhook.DEFAULT_TOLERANCE, cryptoProvider, receivedAt);
          const jsonPayload = payload instanceof Uint8Array ? JSON.parse(new TextDecoder("utf8").decode(payload)) : JSON.parse(payload);
          return jsonPayload;
        },
        /**
         * Generates a header to be used for webhook mocking
         *
         * @typedef {object} opts
         * @property {number} timestamp - Timestamp of the header. Defaults to Date.now()
         * @property {string} payload - JSON stringified payload object, containing the 'id' and 'object' parameters
         * @property {string} secret - Stripe webhook secret 'whsec_...'
         * @property {string} scheme - Version of API to hit. Defaults to 'v1'.
         * @property {string} signature - Computed webhook signature
         * @property {CryptoProvider} cryptoProvider - Crypto provider to use for computing the signature if none was provided. Defaults to NodeCryptoProvider.
         */
        generateTestHeaderString: function(opts) {
          if (!opts) {
            throw new Error_js_1.StripeError({
              message: "Options are required"
            });
          }
          opts.timestamp = Math.floor(opts.timestamp) || Math.floor(Date.now() / 1e3);
          opts.scheme = opts.scheme || signature.EXPECTED_SCHEME;
          opts.cryptoProvider = opts.cryptoProvider || getCryptoProvider();
          opts.signature = opts.signature || opts.cryptoProvider.computeHMACSignature(opts.timestamp + "." + opts.payload, opts.secret);
          const generatedHeader = [
            "t=" + opts.timestamp,
            opts.scheme + "=" + opts.signature
          ].join(",");
          return generatedHeader;
        }
      };
      const signature = {
        EXPECTED_SCHEME: "v1",
        verifyHeader(encodedPayload, encodedHeader, secret, tolerance, cryptoProvider, receivedAt) {
          const { decodedHeader: header, decodedPayload: payload, details, suspectPayloadType } = parseEventDetails(encodedPayload, encodedHeader, this.EXPECTED_SCHEME);
          const secretContainsWhitespace = /\s/.test(secret);
          cryptoProvider = cryptoProvider || getCryptoProvider();
          const expectedSignature = cryptoProvider.computeHMACSignature(makeHMACContent(payload, details), secret);
          validateComputedSignature(payload, header, details, expectedSignature, tolerance, suspectPayloadType, secretContainsWhitespace, receivedAt);
          return true;
        },
        async verifyHeaderAsync(encodedPayload, encodedHeader, secret, tolerance, cryptoProvider, receivedAt) {
          const { decodedHeader: header, decodedPayload: payload, details, suspectPayloadType } = parseEventDetails(encodedPayload, encodedHeader, this.EXPECTED_SCHEME);
          const secretContainsWhitespace = /\s/.test(secret);
          cryptoProvider = cryptoProvider || getCryptoProvider();
          const expectedSignature = await cryptoProvider.computeHMACSignatureAsync(makeHMACContent(payload, details), secret);
          return validateComputedSignature(payload, header, details, expectedSignature, tolerance, suspectPayloadType, secretContainsWhitespace, receivedAt);
        }
      };
      function makeHMACContent(payload, details) {
        return `${details.timestamp}.${payload}`;
      }
      function parseEventDetails(encodedPayload, encodedHeader, expectedScheme) {
        if (!encodedPayload) {
          throw new Error_js_1.StripeSignatureVerificationError(encodedHeader, encodedPayload, {
            message: "No webhook payload was provided."
          });
        }
        const suspectPayloadType = typeof encodedPayload != "string" && !(encodedPayload instanceof Uint8Array);
        const textDecoder = new TextDecoder("utf8");
        const decodedPayload = encodedPayload instanceof Uint8Array ? textDecoder.decode(encodedPayload) : encodedPayload;
        if (Array.isArray(encodedHeader)) {
          throw new Error("Unexpected: An array was passed as a header, which should not be possible for the stripe-signature header.");
        }
        if (encodedHeader == null || encodedHeader == "") {
          throw new Error_js_1.StripeSignatureVerificationError(encodedHeader, encodedPayload, {
            message: "No stripe-signature header value was provided."
          });
        }
        const decodedHeader = encodedHeader instanceof Uint8Array ? textDecoder.decode(encodedHeader) : encodedHeader;
        const details = parseHeader(decodedHeader, expectedScheme);
        if (!details || details.timestamp === -1) {
          throw new Error_js_1.StripeSignatureVerificationError(decodedHeader, decodedPayload, {
            message: "Unable to extract timestamp and signatures from header"
          });
        }
        if (!details.signatures.length) {
          throw new Error_js_1.StripeSignatureVerificationError(decodedHeader, decodedPayload, {
            message: "No signatures found with expected scheme"
          });
        }
        return {
          decodedPayload,
          decodedHeader,
          details,
          suspectPayloadType
        };
      }
      function validateComputedSignature(payload, header, details, expectedSignature, tolerance, suspectPayloadType, secretContainsWhitespace, receivedAt) {
        const signatureFound = !!details.signatures.filter(platformFunctions.secureCompare.bind(platformFunctions, expectedSignature)).length;
        const docsLocation = "\nLearn more about webhook signing and explore webhook integration examples for various frameworks at https://github.com/stripe/stripe-node#webhook-signing";
        const whitespaceMessage = secretContainsWhitespace ? "\n\nNote: The provided signing secret contains whitespace. This often indicates an extra newline or space is in the value" : "";
        if (!signatureFound) {
          if (suspectPayloadType) {
            throw new Error_js_1.StripeSignatureVerificationError(header, payload, {
              message: "Webhook payload must be provided as a string or a Buffer (https://nodejs.org/api/buffer.html) instance representing the _raw_ request body.Payload was provided as a parsed JavaScript object instead. \nSignature verification is impossible without access to the original signed material. \n" + docsLocation + "\n" + whitespaceMessage
            });
          }
          throw new Error_js_1.StripeSignatureVerificationError(header, payload, {
            message: "No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe? \n If a webhook request is being forwarded by a third-party tool, ensure that the exact request body, including JSON formatting and new line style, is preserved.\n" + docsLocation + "\n" + whitespaceMessage
          });
        }
        const timestampAge = Math.floor((typeof receivedAt === "number" ? receivedAt : Date.now()) / 1e3) - details.timestamp;
        if (tolerance > 0 && timestampAge > tolerance) {
          throw new Error_js_1.StripeSignatureVerificationError(header, payload, {
            message: "Timestamp outside the tolerance zone"
          });
        }
        return true;
      }
      function parseHeader(header, scheme) {
        if (typeof header !== "string") {
          return null;
        }
        return header.split(",").reduce((accum, item) => {
          const kv = item.split("=");
          if (kv[0] === "t") {
            accum.timestamp = parseInt(kv[1], 10);
          }
          if (kv[0] === scheme) {
            accum.signatures.push(kv[1]);
          }
          return accum;
        }, {
          timestamp: -1,
          signatures: []
        });
      }
      let webhooksCryptoProviderInstance = null;
      function getCryptoProvider() {
        if (!webhooksCryptoProviderInstance) {
          webhooksCryptoProviderInstance = platformFunctions.createDefaultCryptoProvider();
        }
        return webhooksCryptoProviderInstance;
      }
      Webhook.signature = signature;
      return Webhook;
    }
    exports2.createWebhooks = createWebhooks;
  }
});

// netlify/functions/node_modules/stripe/cjs/stripe.core.js
var require_stripe_core = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/stripe.core.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createStripe = void 0;
    var _Error = require_Error();
    var apiVersion = require_apiVersion();
    var resources = require_resources();
    var HttpClient_js_1 = require_HttpClient();
    var utils_js_1 = require_utils3();
    var CryptoProvider_js_1 = require_CryptoProvider();
    var RequestSender_js_1 = require_RequestSender();
    var StripeResource_js_1 = require_StripeResource();
    var Webhooks_js_1 = require_Webhooks();
    var DEFAULT_HOST = "api.stripe.com";
    var DEFAULT_PORT = "443";
    var DEFAULT_BASE_PATH = "/v1/";
    var DEFAULT_API_VERSION = apiVersion.ApiVersion;
    var DEFAULT_TIMEOUT = 8e4;
    var MAX_NETWORK_RETRY_DELAY_SEC = 2;
    var INITIAL_NETWORK_RETRY_DELAY_SEC = 0.5;
    var APP_INFO_PROPERTIES = ["name", "version", "url", "partner_id"];
    var ALLOWED_CONFIG_PROPERTIES = [
      "apiVersion",
      "typescript",
      "maxNetworkRetries",
      "httpAgent",
      "httpClient",
      "timeout",
      "host",
      "port",
      "protocol",
      "telemetry",
      "appInfo",
      "stripeAccount"
    ];
    var defaultRequestSenderFactory = (stripe) => new RequestSender_js_1.RequestSender(stripe, StripeResource_js_1.StripeResource.MAX_BUFFERED_REQUEST_METRICS);
    function createStripe(platformFunctions, requestSender = defaultRequestSenderFactory) {
      Stripe.PACKAGE_VERSION = "14.25.0";
      Stripe.USER_AGENT = Object.assign({ bindings_version: Stripe.PACKAGE_VERSION, lang: "node", publisher: "stripe", uname: null, typescript: false }, (0, utils_js_1.determineProcessUserAgentProperties)());
      Stripe.StripeResource = StripeResource_js_1.StripeResource;
      Stripe.resources = resources;
      Stripe.HttpClient = HttpClient_js_1.HttpClient;
      Stripe.HttpClientResponse = HttpClient_js_1.HttpClientResponse;
      Stripe.CryptoProvider = CryptoProvider_js_1.CryptoProvider;
      function createWebhooksDefault(fns = platformFunctions) {
        return (0, Webhooks_js_1.createWebhooks)(fns);
      }
      Stripe.webhooks = Object.assign(createWebhooksDefault, (0, Webhooks_js_1.createWebhooks)(platformFunctions));
      function Stripe(key, config = {}) {
        if (!(this instanceof Stripe)) {
          return new Stripe(key, config);
        }
        const props = this._getPropsFromConfig(config);
        this._platformFunctions = platformFunctions;
        Object.defineProperty(this, "_emitter", {
          value: this._platformFunctions.createEmitter(),
          enumerable: false,
          configurable: false,
          writable: false
        });
        this.VERSION = Stripe.PACKAGE_VERSION;
        this.on = this._emitter.on.bind(this._emitter);
        this.once = this._emitter.once.bind(this._emitter);
        this.off = this._emitter.removeListener.bind(this._emitter);
        const agent = props.httpAgent || null;
        this._api = {
          auth: null,
          host: props.host || DEFAULT_HOST,
          port: props.port || DEFAULT_PORT,
          protocol: props.protocol || "https",
          basePath: DEFAULT_BASE_PATH,
          version: props.apiVersion || DEFAULT_API_VERSION,
          timeout: (0, utils_js_1.validateInteger)("timeout", props.timeout, DEFAULT_TIMEOUT),
          maxNetworkRetries: (0, utils_js_1.validateInteger)("maxNetworkRetries", props.maxNetworkRetries, 1),
          agent,
          httpClient: props.httpClient || (agent ? this._platformFunctions.createNodeHttpClient(agent) : this._platformFunctions.createDefaultHttpClient()),
          dev: false,
          stripeAccount: props.stripeAccount || null
        };
        const typescript = props.typescript || false;
        if (typescript !== Stripe.USER_AGENT.typescript) {
          Stripe.USER_AGENT.typescript = typescript;
        }
        if (props.appInfo) {
          this._setAppInfo(props.appInfo);
        }
        this._prepResources();
        this._setApiKey(key);
        this.errors = _Error;
        this.webhooks = createWebhooksDefault();
        this._prevRequestMetrics = [];
        this._enableTelemetry = props.telemetry !== false;
        this._requestSender = requestSender(this);
        this.StripeResource = Stripe.StripeResource;
      }
      Stripe.errors = _Error;
      Stripe.createNodeHttpClient = platformFunctions.createNodeHttpClient;
      Stripe.createFetchHttpClient = platformFunctions.createFetchHttpClient;
      Stripe.createNodeCryptoProvider = platformFunctions.createNodeCryptoProvider;
      Stripe.createSubtleCryptoProvider = platformFunctions.createSubtleCryptoProvider;
      Stripe.prototype = {
        // Properties are set in the constructor above
        _appInfo: void 0,
        on: null,
        off: null,
        once: null,
        VERSION: null,
        StripeResource: null,
        webhooks: null,
        errors: null,
        _api: null,
        _prevRequestMetrics: null,
        _emitter: null,
        _enableTelemetry: null,
        _requestSender: null,
        _platformFunctions: null,
        /**
         * @private
         */
        _setApiKey(key) {
          if (key) {
            this._setApiField("auth", `Bearer ${key}`);
          }
        },
        /**
         * @private
         * This may be removed in the future.
         */
        _setAppInfo(info) {
          if (info && typeof info !== "object") {
            throw new Error("AppInfo must be an object.");
          }
          if (info && !info.name) {
            throw new Error("AppInfo.name is required");
          }
          info = info || {};
          this._appInfo = APP_INFO_PROPERTIES.reduce(
            (accum, prop) => {
              if (typeof info[prop] == "string") {
                accum = accum || {};
                accum[prop] = info[prop];
              }
              return accum;
            },
            // @ts-ignore
            void 0
          );
        },
        /**
         * @private
         * This may be removed in the future.
         */
        _setApiField(key, value) {
          this._api[key] = value;
        },
        /**
         * @private
         * Please open or upvote an issue at github.com/stripe/stripe-node
         * if you use this, detailing your use-case.
         *
         * It may be deprecated and removed in the future.
         */
        getApiField(key) {
          return this._api[key];
        },
        setClientId(clientId) {
          this._clientId = clientId;
        },
        getClientId() {
          return this._clientId;
        },
        /**
         * @private
         * Please open or upvote an issue at github.com/stripe/stripe-node
         * if you use this, detailing your use-case.
         *
         * It may be deprecated and removed in the future.
         */
        getConstant: (c) => {
          switch (c) {
            case "DEFAULT_HOST":
              return DEFAULT_HOST;
            case "DEFAULT_PORT":
              return DEFAULT_PORT;
            case "DEFAULT_BASE_PATH":
              return DEFAULT_BASE_PATH;
            case "DEFAULT_API_VERSION":
              return DEFAULT_API_VERSION;
            case "DEFAULT_TIMEOUT":
              return DEFAULT_TIMEOUT;
            case "MAX_NETWORK_RETRY_DELAY_SEC":
              return MAX_NETWORK_RETRY_DELAY_SEC;
            case "INITIAL_NETWORK_RETRY_DELAY_SEC":
              return INITIAL_NETWORK_RETRY_DELAY_SEC;
          }
          return Stripe[c];
        },
        getMaxNetworkRetries() {
          return this.getApiField("maxNetworkRetries");
        },
        /**
         * @private
         * This may be removed in the future.
         */
        _setApiNumberField(prop, n, defaultVal) {
          const val = (0, utils_js_1.validateInteger)(prop, n, defaultVal);
          this._setApiField(prop, val);
        },
        getMaxNetworkRetryDelay() {
          return MAX_NETWORK_RETRY_DELAY_SEC;
        },
        getInitialNetworkRetryDelay() {
          return INITIAL_NETWORK_RETRY_DELAY_SEC;
        },
        /**
         * @private
         * Please open or upvote an issue at github.com/stripe/stripe-node
         * if you use this, detailing your use-case.
         *
         * It may be deprecated and removed in the future.
         *
         * Gets a JSON version of a User-Agent and uses a cached version for a slight
         * speed advantage.
         */
        getClientUserAgent(cb) {
          return this.getClientUserAgentSeeded(Stripe.USER_AGENT, cb);
        },
        /**
         * @private
         * Please open or upvote an issue at github.com/stripe/stripe-node
         * if you use this, detailing your use-case.
         *
         * It may be deprecated and removed in the future.
         *
         * Gets a JSON version of a User-Agent by encoding a seeded object and
         * fetching a uname from the system.
         */
        getClientUserAgentSeeded(seed, cb) {
          this._platformFunctions.getUname().then((uname) => {
            var _a;
            const userAgent = {};
            for (const field in seed) {
              userAgent[field] = encodeURIComponent((_a = seed[field]) !== null && _a !== void 0 ? _a : "null");
            }
            userAgent.uname = encodeURIComponent(uname || "UNKNOWN");
            const client = this.getApiField("httpClient");
            if (client) {
              userAgent.httplib = encodeURIComponent(client.getClientName());
            }
            if (this._appInfo) {
              userAgent.application = this._appInfo;
            }
            cb(JSON.stringify(userAgent));
          });
        },
        /**
         * @private
         * Please open or upvote an issue at github.com/stripe/stripe-node
         * if you use this, detailing your use-case.
         *
         * It may be deprecated and removed in the future.
         */
        getAppInfoAsString() {
          if (!this._appInfo) {
            return "";
          }
          let formatted = this._appInfo.name;
          if (this._appInfo.version) {
            formatted += `/${this._appInfo.version}`;
          }
          if (this._appInfo.url) {
            formatted += ` (${this._appInfo.url})`;
          }
          return formatted;
        },
        getTelemetryEnabled() {
          return this._enableTelemetry;
        },
        /**
         * @private
         * This may be removed in the future.
         */
        _prepResources() {
          for (const name in resources) {
            this[(0, utils_js_1.pascalToCamelCase)(name)] = new resources[name](this);
          }
        },
        /**
         * @private
         * This may be removed in the future.
         */
        _getPropsFromConfig(config) {
          if (!config) {
            return {};
          }
          const isString = typeof config === "string";
          const isObject = config === Object(config) && !Array.isArray(config);
          if (!isObject && !isString) {
            throw new Error("Config must either be an object or a string");
          }
          if (isString) {
            return {
              apiVersion: config
            };
          }
          const values = Object.keys(config).filter((value) => !ALLOWED_CONFIG_PROPERTIES.includes(value));
          if (values.length > 0) {
            throw new Error(`Config object may only contain the following: ${ALLOWED_CONFIG_PROPERTIES.join(", ")}`);
          }
          return config;
        }
      };
      return Stripe;
    }
    exports2.createStripe = createStripe;
  }
});

// netlify/functions/node_modules/stripe/cjs/stripe.cjs.node.js
var require_stripe_cjs_node = __commonJS({
  "netlify/functions/node_modules/stripe/cjs/stripe.cjs.node.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var NodePlatformFunctions_js_1 = require_NodePlatformFunctions();
    var stripe_core_js_1 = require_stripe_core();
    var Stripe = (0, stripe_core_js_1.createStripe)(new NodePlatformFunctions_js_1.NodePlatformFunctions());
    module2.exports = Stripe;
    module2.exports.Stripe = Stripe;
    module2.exports.default = Stripe;
  }
});

// netlify/functions/split-pay.js
var utils = require_utils();
exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return utils.optionsResponse();
  }
  if (event.httpMethod !== "POST") {
    return utils.errorResponse(405, "Method not allowed");
  }
  try {
    var participantId = utils.extractPathParam(event.path);
    if (!utils.isValidUUID(participantId)) {
      return utils.errorResponse(400, "Invalid participant ID");
    }
    var authHeader = event.headers["authorization"] || event.headers["Authorization"] || "";
    var authToken = authHeader.replace("Bearer ", "");
    if (!authToken) {
      return utils.errorResponse(401, "Authorization required");
    }
    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, "Service temporarily unavailable");
    }
    var userResult = await supabase.auth.getUser(authToken);
    if (userResult.error || !userResult.data || !userResult.data.user) {
      return utils.errorResponse(401, "Invalid or expired auth token");
    }
    var user = userResult.data.user;
    var result = await supabase.from("split_participants").select("id, email, display_name, amount_cents, status, split_payment_id, member_id, payment_intent_id, split_payments(package_id, total_amount_cents, status, expires_at)").eq("id", participantId).single();
    if (result.error || !result.data) {
      return utils.errorResponse(404, "Participant not found");
    }
    var participant = result.data;
    if (participant.member_id && participant.member_id !== user.id) {
      return utils.errorResponse(403, "This payment belongs to a different user");
    }
    if (!participant.member_id) {
      var profileResult = await supabase.from("profiles").select("email").eq("id", user.id).single();
      if (profileResult.data && profileResult.data.email && participant.email && profileResult.data.email.toLowerCase() === participant.email.toLowerCase()) {
        await supabase.from("split_participants").update({ member_id: user.id }).eq("id", participantId);
      } else {
        return utils.errorResponse(403, "You are not authorized to pay this share");
      }
    }
    if (participant.split_payments && participant.split_payments.expires_at && new Date(participant.split_payments.expires_at) < /* @__PURE__ */ new Date()) {
      return utils.errorResponse(400, "This split payment has expired");
    }
    if (participant.status === "paid") {
      return utils.errorResponse(400, "This share has already been paid");
    }
    if (participant.split_payments && participant.split_payments.status !== "pending") {
      return utils.errorResponse(400, "This split payment is no longer accepting payments");
    }
    var stripe = require_stripe_cjs_node()(process.env.STRIPE_SECRET_KEY);
    var clientSecret;
    var paymentIntentId;
    if (participant.payment_intent_id) {
      try {
        var existingPI = await stripe.paymentIntents.retrieve(participant.payment_intent_id);
        if (existingPI && (existingPI.status === "requires_payment_method" || existingPI.status === "requires_confirmation" || existingPI.status === "requires_action")) {
          clientSecret = existingPI.client_secret;
          paymentIntentId = existingPI.id;
        }
      } catch (e) {
        console.log("Could not retrieve existing PaymentIntent, creating new one");
      }
    }
    if (!clientSecret) {
      var paymentIntent = await stripe.paymentIntents.create({
        amount: participant.amount_cents,
        currency: "usd",
        capture_method: "automatic",
        metadata: {
          split_payment_id: participant.split_payment_id,
          participant_id: participantId,
          package_id: participant.split_payments ? participant.split_payments.package_id : "",
          member_id: user.id,
          type: "member_split_payment_share"
        },
        description: "Split payment share (member) for package " + (participant.split_payments ? participant.split_payments.package_id : "")
      });
      clientSecret = paymentIntent.client_secret;
      paymentIntentId = paymentIntent.id;
      await supabase.from("split_participants").update({
        payment_intent_id: paymentIntentId,
        stripe_client_secret: clientSecret,
        status: "pending"
      }).eq("id", participantId);
    }
    return utils.successResponse({
      success: true,
      clientSecret,
      paymentIntentId,
      amountCents: participant.amount_cents
    });
  } catch (err) {
    console.error("split-pay error:", err);
    return utils.errorResponse(500, "Internal server error");
  }
};
