import * as pbUtil from '@grpc/proto-loader/build/src/util';
import * as Protobuf from 'protobufjs';
import camelCase from 'lodash.camelcase';

function isHandledReflectionObject(obj) {
    return (
        obj instanceof Protobuf.Service ||
        obj instanceof Protobuf.Type ||
        obj instanceof Protobuf.Enum
    );
}

function isNamespaceBase(obj) {
    return obj instanceof Protobuf.Namespace || obj instanceof Protobuf.Root;
}

function getAllHandledReflectionObjects(obj, parentName) {
    const objName = joinName(parentName, obj.name);
    if (isHandledReflectionObject(obj)) {
        return [[objName, obj]];
    } else {
        if (isNamespaceBase(obj) && typeof obj.nested !== 'undefined') {
            return Object.keys(obj.nested)
                .map((name) => {
                    return getAllHandledReflectionObjects(
                        obj.nested[name],
                        objName
                    );
                })
                .reduce(
                    (accumulator, currentValue) =>
                        accumulator.concat(currentValue),
                    []
                );
        }
    }
    return [];
}

function joinName(baseName, name) {
    if (baseName === '') {
        return name;
    } else {
        return baseName + '.' + name;
    }
}

function createDefinition(obj, name, options) {
    if (obj instanceof Protobuf.Service) {
        return createServiceDefinition(obj, name, options);
    } else if (obj instanceof Protobuf.Type) {
        return createMessageDefinition(obj);
    } else if (obj instanceof Protobuf.Enum) {
        return createEnumDefinition(obj);
    } else {
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
        originalName: camelCase(method.name),
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

export function isNamespace(type) {
    return (
        type instanceof Protobuf.Namespace &&
        type['__proto__'].constructor.name === 'Namespace'
    );
}

export function getNamespace(type) {
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

export function createMessageDefinition(message) {
    return {
        fullName: message.fullName,
        parent: message.parent,
        namespace: getNamespace(message),
        type: message,
    };
}

export function createEnumDefinition(enumType) {
    return {
        fullName: enumType.fullName,
        parent: enumType.parent,
        namespace: getNamespace(enumType),
        type: enumType,
    };
}

export async function loadProtoDef(filename, options) {
    const root = await pbUtil.loadProtosWithOptions(filename, options);
    const def = {};
    root.resolveAll();
    for (const [name, obj] of getAllHandledReflectionObjects(root, '')) {
        def[name] = createDefinition(obj, name, options);
    }
    return def;
}
