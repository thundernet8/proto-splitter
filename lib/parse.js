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
exports.getProtoRoutes = void 0;
const Protobuf = __importStar(require("protobufjs"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const clang_format_1 = __importDefault(require("clang-format"));
const tmp_1 = __importDefault(require("tmp"));
const utils_1 = require("./utils");
class RoutesSearcher {
    constructor({ pb, pkg, service, method, options }) {
        this.searchHistory = new Map();
        this.refHistory = new Map();
        this.idMap = new Map();
        this.messages = new Map();
        this.enums = new Map();
        this.errors = [];
        this.pb = pb;
        this.pkg = pkg;
        this.service = service;
        this.method = method;
        this.options = options;
    }
    async getRoute() {
        const Service = this.pb[`${this.pkg}.${this.service}`];
        const Method = Service[this.method];
        const { requestType, responseType } = Method;
        this.reqFullName = requestType.fullName;
        this.respFullName = responseType.fullName;
        this.refHistory.set(requestType.fullName, true);
        this.refHistory.set(responseType.fullName, true);
        this.lookupMessage(requestType);
        this.lookupMessage(responseType);
        const route = {
            path: Method.path,
            pkg: this.pkg,
            service: this.service,
            method: this.method,
            messages: Array.from(this.messages.values()),
            enums: Array.from(this.enums.values()),
            errors: this.errors,
            proto: '',
        };
        route.proto = await this.generateRouteProto(route);
        return route;
    }
    lookupMessage(msg) {
        if (this.searchHistory.get(msg.fullName)) {
            return msg;
        }
        this.searchHistory.set(msg.fullName, true);
        if (!utils_1.isNamespace(msg.parent)) {
            this.lookupMessage(utils_1.createMessageDefinition(msg.parent));
        }
        if (msg.type instanceof Protobuf.Enum) {
            this.enums.set(msg.fullName, msg);
        }
        else if (msg.type instanceof Protobuf.Type) {
            this.messages.set(msg.fullName, msg);
        }
        const { fieldsArray: fields, nestedArray } = msg.type;
        for (const nestMsg of nestedArray || []) {
            this.lookupMessage(utils_1.createMessageDefinition(nestMsg));
        }
        for (const field of fields || []) {
            if (!field.resolved) {
                this.errors.push(`Field not resolved: ${field.fullName}`);
            }
            else if (field.resolvedType &&
                field.resolvedType instanceof Protobuf.Type) {
                const toFind = utils_1.createMessageDefinition(field.resolvedType);
                this.refHistory.set(toFind.fullName, true);
                this.lookupMessage(toFind);
            }
            else if (field.resolvedType &&
                field.resolvedType instanceof Protobuf.Enum) {
                const toFind = utils_1.createEnumDefinition(field.resolvedType);
                this.refHistory.set(toFind.fullName, true);
                this.lookupMessage(toFind);
            }
            else if (field instanceof Protobuf.MapField &&
                field.resolvedKeyType) {
                const toFind = utils_1.createMessageDefinition(field.resolvedKeyType);
                this.refHistory.set(toFind.fullName, true);
                this.lookupMessage(toFind);
            }
        }
        return msg;
    }
    async generateRouteProto(route) {
        const { enums, messages } = route;
        let m = 1;
        enums.forEach((item) => {
            if (this.refHistory.get(item.fullName)) {
                this.idMap.set(item.fullName, m++);
            }
        });
        m = 1;
        messages.forEach((item) => {
            if (this.refHistory.get(item.fullName)) {
                this.idMap.set(item.fullName, m++);
            }
        });
        const lines = [];
        lines.push(`syntax = "proto3";`);
        lines.push('package mono;');
        for (const enumItem of route.enums) {
            if (this.refHistory.get(enumItem.fullName)) {
                lines.push(this.generateEnumProto(enumItem));
            }
        }
        for (const msg of route.messages) {
            if (this.refHistory.get(msg.fullName)) {
                lines.push(this.generateMsgProto(msg));
            }
        }
        lines.push(`service Mono{rpc Call(Req) returns (Resp);}`);
        const proto = lines.join('').trim();
        if (this.options.format) {
            return new Promise((resolve, reject) => {
                tmp_1.default.file({
                    discardDescriptor: true,
                    postfix: '.proto',
                }, (err, path, fd, clear) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        fs.writeFile(path, proto, (err) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                const stream = clang_format_1.default({ path }, 'utf-8', '{Language: Proto,BasedOnStyle: Google}', function () { });
                                const bufs = [];
                                stream.on('data', function (chunk) {
                                    bufs.push(chunk);
                                });
                                stream.on('end', function () {
                                    clear();
                                    resolve(bufs.join(''));
                                });
                                stream.on('error', (err) => {
                                    clear();
                                    reject(err);
                                });
                            }
                        });
                    }
                });
            });
        }
        return proto;
    }
    generateMsgProto(msg) {
        const lines = [];
        const name = this.getNewMsgName(msg);
        lines.push(`message ${name}{`);
        // for (const value of msg.type.nestedArray) {
        //     if (value instanceof Protobuf.Enum) {
        //         const enumText = this.generateEnumProto(
        //             createEnumDefinition(value)
        //         )
        //             .split('\n')
        //             .map((line) => {
        //                 if (line) {
        //                     return `  ${line}`;
        //                 }
        //                 return line;
        //             })
        //             .join('\n');
        //         lines.push(enumText);
        //     } else if (value instanceof Protobuf.Type) {
        //         const msgText = this.generateMsgProto(
        //             createMessageDefinition(value)
        //         )
        //             .split('\n')
        //             .map((line) => {
        //                 if (line) {
        //                     return `  ${line}`;
        //                 }
        //                 return line;
        //             })
        //             .join('\n');
        //         lines.push(msgText);
        //     }
        // }
        for (const field of msg.type.fieldsArray) {
            const text = this.generateFieldProto(field);
            lines.push(`${text}`);
        }
        for (const part of msg.type.oneofsArray) {
            const { name, fieldsArray } = part;
            lines.push(`oneof ${name}{`);
            for (const subField of fieldsArray) {
                const text = this.generateFieldProto(subField, true);
                lines.push(`    ${text}`);
            }
            lines.push(`}`);
        }
        if (msg.type.reserved) {
            for (const field of msg.type.reserved) {
                if (field[0] === field[1]) {
                    lines.push(`reserved ${field[0]};`);
                }
                else if (field[1] === 536870911) {
                    lines.push(`reserved ${field[0]} to max;`);
                }
                else {
                    lines.push(`reserved ${field[0]} to ${field[1]};`);
                }
            }
        }
        lines.push('}');
        return lines.filter((str) => !/^[' ']+$/.test(str)).join('');
    }
    generateEnumProto(enumItem) {
        const lines = [];
        lines.push(`message ME${this.idMap.get(enumItem.fullName)}{`);
        lines.push(`enum E{`);
        for (const key in enumItem.type.values) {
            if (enumItem.type.values.hasOwnProperty(key)) {
                lines.push(`${key}=${enumItem.type.values[key]};`);
            }
        }
        lines.push('}');
        lines.push('}');
        return lines.join('');
    }
    generateFieldProto(field, oneof = false) {
        const { id, name, type, typeDefault, repeated, resolvedKeyType, resolvedType, partOf, } = field;
        if (partOf && !oneof) {
            return '';
        }
        const text = [];
        // proto3不允许写required，忽略required label
        if (repeated) {
            text.push('repeated ');
        }
        let protoType;
        if (!resolvedType) {
            protoType = type;
        }
        else if (field instanceof Protobuf.MapField) {
            const keyType = field.keyType || this.getNewMsgName(resolvedKeyType);
            const valueType = resolvedType
                ? resolvedType instanceof Protobuf.Enum
                    ? `E${this.idMap.get(resolvedType.fullName)}`
                    : this.getNewMsgName(resolvedType)
                : type;
            protoType = `map<${keyType}, ${valueType}>`;
        }
        else if (resolvedType instanceof Protobuf.Type) {
            protoType = this.getNewMsgName(resolvedType);
        }
        else if (resolvedType instanceof Protobuf.Enum) {
            protoType = `ME${this.idMap.get(resolvedType.fullName)}.E`;
        }
        text.push(protoType + ' ');
        text.push(name);
        text.push('=');
        text.push(`${id};`);
        return text.join('');
    }
    getNewMsgName(msg) {
        if (msg.fullName === this.reqFullName) {
            return 'Req';
        }
        else if (msg.fullName === this.respFullName) {
            return 'Resp';
        }
        return `M${this.idMap.get(msg.fullName)}`;
    }
}
/**
 * 从单个proto文件中解析出以单个RPC方法为粒度的proto文件列表
 * @param filePath proto文件路径
 * @param options proto文件解析以及输出选项，主要包括includeDirs和format选项
 */
async function getProtoRoutes(filePath, options = {}) {
    const content = fs.readFileSync(filePath).toString();
    const match1 = content.match(/[\s]+package[ ]+([a-zA-Z._]+);[\s]+/);
    const match2 = content.match(/[\s]+service[ ]+([a-zA-Z._]+)[\s]+/);
    if (!match1) {
        return false;
    }
    const packageName = match1[1];
    const serviceName = match2 && match2[1];
    if (!serviceName) {
        return [];
    }
    const pb = await utils_1.loadProtoDef(filePath, {
        includeDirs: [
            path.join(path.dirname(require.resolve('protobufjs')), ''),
            path.join(path.resolve(__dirname, '../protos')),
        ].concat(options.includeDirs || []),
        keepCase: true,
    });
    const Service = pb[`${packageName}.${serviceName}`];
    const tasks = [];
    for (const methodName in Service) {
        const searcher = new RoutesSearcher({
            pb,
            pkg: packageName,
            service: serviceName,
            method: methodName,
            options,
        });
        tasks.push(searcher.getRoute());
    }
    return Promise.all(tasks);
}
exports.getProtoRoutes = getProtoRoutes;
