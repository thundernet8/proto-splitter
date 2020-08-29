"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProtoDef = exports.createEnumDefinition = exports.createMessageDefinition = exports.getNamespace = exports.isNamespace = void 0;
const pbUtil = __importStar(require("@grpc/proto-loader/build/src/util"));
const Protobuf = __importStar(require("protobufjs"));
const lodash_camelcase_1 = __importDefault(require("lodash.camelcase"));
function isHandledReflectionObject(obj) {
    return (obj instanceof Protobuf.Service ||
        obj instanceof Protobuf.Type ||
        obj instanceof Protobuf.Enum);
}
function isNamespaceBase(obj) {
    return obj instanceof Protobuf.Namespace || obj instanceof Protobuf.Root;
}
function getAllHandledReflectionObjects(obj, parentName) {
    const objName = joinName(parentName, obj.name);
    if (isHandledReflectionObject(obj)) {
        return [[objName, obj]];
    }
    else {
        if (isNamespaceBase(obj) && typeof obj.nested !== 'undefined') {
            return Object.keys(obj.nested)
                .map((name) => {
                return getAllHandledReflectionObjects(obj.nested[name], objName);
            })
                .reduce((accumulator, currentValue) => accumulator.concat(currentValue), []);
        }
    }
    return [];
}
function joinName(baseName, name) {
    if (baseName === '') {
        return name;
    }
    else {
        return baseName + '.' + name;
    }
}
function createDefinition(obj, name, options) {
    if (obj instanceof Protobuf.Service) {
        return createServiceDefinition(obj, name, options);
    }
    else if (obj instanceof Protobuf.Type) {
        return createMessageDefinition(obj);
    }
    else if (obj instanceof Protobuf.Enum) {
        return createEnumDefinition(obj);
    }
    else {
        throw new Error('Type mismatch in reflection object handling');
    }
}
function createMethodDefinition(method, serviceName, options) {
    const requestType = method.resolvedRequestType;
    const responseType = method.resolvedResponseType;
    return {
        path: '/' + serviceName + '/' + method.name,
        requestStream: !!method.requestStream,
        responseStream: !!method.responseStream,
        originalName: lodash_camelcase_1.default(method.name),
        requestType: createMessageDefinition(requestType),
        responseType: createMessageDefinition(responseType),
    };
}
function createServiceDefinition(service, name, options) {
    const def = {};
    for (const method of service.methodsArray) {
        def[method.name] = createMethodDefinition(method, name, options);
    }
    return def;
}
function isNamespace(type) {
    return (type instanceof Protobuf.Namespace &&
        type['__proto__'].constructor.name === 'Namespace');
}
exports.isNamespace = isNamespace;
function getNamespace(type) {
    let result = type;
    while (true) {
        if (isNamespace(type)) {
            break;
        }
        if (!type) {
            result = null;
            break;
        }
        type = type.parent;
    }
    return result;
}
exports.getNamespace = getNamespace;
function createMessageDefinition(message) {
    return {
        fullName: message.fullName,
        parent: message.parent,
        namespace: getNamespace(message),
        type: message,
    };
}
exports.createMessageDefinition = createMessageDefinition;
function createEnumDefinition(enumType) {
    return {
        fullName: enumType.fullName,
        parent: enumType.parent,
        namespace: getNamespace(enumType),
        type: enumType,
    };
}
exports.createEnumDefinition = createEnumDefinition;
async function loadProtoDef(filename, options) {
    const root = await pbUtil.loadProtosWithOptions(filename, options);
    const def = {};
    root.resolveAll();
    for (const [name, obj] of getAllHandledReflectionObjects(root, '')) {
        def[name] = createDefinition(obj, name, options);
    }
    return def;
}
exports.loadProtoDef = loadProtoDef;
//# sourceMappingURL=utils.js.map