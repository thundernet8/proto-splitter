import * as Protobuf from 'protobufjs';
import * as fs from 'fs';
import * as path from 'path';
import {
    createEnumDefinition,
    createMessageDefinition,
    loadProtoDef,
    isNamespace,
} from './utils';

interface MessageDefinition<T = Protobuf.Message> {
    outName?: string;
    fullName: string;
    parent: Protobuf.Message | Protobuf.Namespace;
    namespace: Protobuf.Namespace;
    type: T;
}

export interface ProtoRoute {
    path: string;
    pkg: string;
    service: string;
    method: string;
    proto: string;
    messages: MessageDefinition<Protobuf.Type>[];
    enums: MessageDefinition<Protobuf.Enum>[];
    errors: string[];
}

class RoutesSearcher {
    private searchHistory: Map<string, boolean> = new Map();

    private refHistory: Map<string, boolean> = new Map();

    private idMap: Map<string, number> = new Map();

    private messages = new Map<string, MessageDefinition<Protobuf.Type>>();

    private enums = new Map<string, MessageDefinition<Protobuf.Enum>>();

    private errors: string[] = [];

    private pb;

    private pkg: string;

    private service: string;

    private method: string;

    constructor({ pb, pkg, service, method }) {
        this.pb = pb;
        this.pkg = pkg;
        this.service = service;
        this.method = method;
    }

    getRoute() {
        const Service = this.pb[`${this.pkg}.${this.service}`];
        const Method = Service[this.method];
        const { requestType, responseType } = Method;
        this.refHistory.set(requestType.fullName, true);
        this.refHistory.set(responseType.fullName, true);
        this.lookupMessage(requestType);
        this.lookupMessage(responseType);
        requestType.outName = 'Req';
        responseType.outName = 'Resp';
        const route: ProtoRoute = {
            path: Method.path,
            pkg: this.pkg,
            service: this.service,
            method: this.method,
            messages: Array.from(this.messages.values()),
            enums: Array.from(this.enums.values()),
            errors: this.errors,
            proto: '',
        };
        route.proto = this.generateRouteProto(route);
        return route;
    }

    private lookupMessage(msg) {
        if (this.searchHistory.get(msg.fullName)) {
            return msg;
        }
        this.searchHistory.set(msg.fullName, true);
        if (!isNamespace(msg.parent)) {
            this.lookupMessage(createMessageDefinition(msg.parent));
        }
        if (msg.type instanceof Protobuf.Enum) {
            this.enums.set(msg.fullName, msg);
        } else if (msg.type instanceof Protobuf.Type) {
            this.messages.set(msg.fullName, msg);
        }
        const { fieldsArray: fields, nestedArray } = msg.type;
        for (const nestMsg of nestedArray || []) {
            this.lookupMessage(createMessageDefinition(nestMsg));
        }
        for (const field of fields || []) {
            if (!field.resolved) {
                this.errors.push(`Field not resolved: ${field.fullName}`);
            } else if (
                field.resolvedType &&
                field.resolvedType instanceof Protobuf.Type
            ) {
                const toFind = createMessageDefinition(field.resolvedType);
                this.refHistory.set(toFind.fullName, true);
                this.lookupMessage(toFind);
            } else if (
                field.resolvedType &&
                field.resolvedType instanceof Protobuf.Enum
            ) {
                const toFind = createEnumDefinition(field.resolvedType);
                this.refHistory.set(toFind.fullName, true);
                this.lookupMessage(toFind);
            } else if (
                field instanceof Protobuf.MapField &&
                field.resolvedKeyType
            ) {
                const toFind = createMessageDefinition(field.resolvedKeyType);
                this.refHistory.set(toFind.fullName, true);
                this.lookupMessage(toFind);
            }
        }
        return msg;
    }

    private generateRouteProto(route: ProtoRoute) {
        const { enums, messages } = route;
        let m = 1;
        enums.forEach((item) => {
            if (!item.outName && this.refHistory.get(item.fullName)) {
                this.idMap.set(item.fullName, m++);
            }
        });
        m = 1;
        messages.forEach((item) => {
            if (!item.outName && this.refHistory.get(item.fullName)) {
                this.idMap.set(item.fullName, m++);
            }
        });
        const lines: string[] = [];
        lines.push(`syntax = "proto3";\n`);
        lines.push('package mono;\n');
        for (const enumItem of route.enums) {
            if (this.refHistory.get(enumItem.fullName)) {
                lines.push(this.generateEnumProto(enumItem));
            }
        }
        let req;
        let resp;
        for (const msg of route.messages) {
            if (msg.outName === 'Req') {
                req = msg;
            } else if (msg.outName === 'Resp') {
                resp = msg;
            } else if (this.refHistory.get(msg.fullName)) {
                lines.push(this.generateMsgProto(msg));
            }
        }
        lines.push(this.generateMsgProto(req));
        lines.push(this.generateMsgProto(resp));
        lines.push(`service Mono {\n  rpc Call(Req) returns (Resp);\n}`);
        return lines.join('\n');
    }

    private generateMsgProto(msg) {
        const lines: string[] = [];
        const name = msg.outName || `M${this.idMap.get(msg.fullName)}`;
        lines.push(`message ${name} {\n`);
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
            lines.push(`  ${text}`);
        }
        for (const part of msg.type.oneofsArray) {
            const { name, fieldsArray } = part;
            lines.push(`  oneof ${name} {\n`);
            for (const subField of fieldsArray) {
                const text = this.generateFieldProto(subField, true);
                lines.push(`    ${text}`);
            }
            lines.push(`  }\n`);
        }
        if (msg.type.reserved) {
            for (const field of msg.type.reserved) {
                if (field[0] === field[1]) {
                    lines.push(`  reserved ${field[0]};\n`);
                } else if (field[1] === 536870911) {
                    lines.push(`  reserved ${field[0]} to max;\n`);
                } else {
                    lines.push(`  reserved ${field[0]} to ${field[1]};\n`);
                }
            }
        }
        lines.push('}\n');
        return lines.filter((str) => !/^[' ']+$/.test(str)).join('');
    }

    private generateEnumProto(enumItem) {
        const lines: string[] = [];
        lines.push(`enum E${this.idMap.get(enumItem.fullName)} {\n`);
        for (const key in enumItem.type.values) {
            if (enumItem.type.values.hasOwnProperty(key)) {
                lines.push(`  ${key} = ${enumItem.type.values[key]};\n`);
            }
        }
        lines.push('}\n');
        return lines.join('');
    }

    private generateFieldProto(field, oneof = false) {
        const {
            id,
            name,
            type,
            typeDefault,
            repeated,
            resolvedKeyType,
            resolvedType,
            partOf,
        } = field;
        if (partOf && !oneof) {
            return '';
        }
        const text: string[] = [];
        // proto3不允许写required，忽略required label
        if (repeated) {
            text.push('repeated');
        }

        let protoType;
        if (!resolvedType) {
            protoType = type;
        } else if (field instanceof Protobuf.MapField) {
            const keyType =
                field.keyType || `M${this.idMap.get(resolvedKeyType.fullName)}`;
            const valueType = resolvedType
                ? resolvedType instanceof Protobuf.Enum
                    ? `E${this.idMap.get(resolvedType.fullName)}`
                    : `M${this.idMap.get(resolvedType.fullName)}`
                : type;
            protoType = `map<${keyType}, ${valueType}>`;
        } else if (resolvedType instanceof Protobuf.Type) {
            protoType = `M${this.idMap.get(resolvedType.fullName)}`;
        } else if (resolvedType instanceof Protobuf.Enum) {
            protoType = `E${this.idMap.get(resolvedType.fullName)}`;
        }
        text.push(protoType);
        text.push(name);
        text.push('=');
        text.push(`${id};\n`);
        return text.join(' ');
    }
}

export async function getProtoRoutes(filePath: string) {
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
    const routes: ProtoRoute[] = [];
    const pb = await loadProtoDef(filePath, {
        includeDirs: [
            path.join(__dirname, './'),
            path.join(path.dirname(require.resolve('protobufjs')), ''),
        ],
        keepCase: true,
    });
    const Service = pb[`${packageName}.${serviceName}`];

    for (const methodName in Service) {
        const searcher = new RoutesSearcher({
            pb,
            pkg: packageName,
            service: serviceName,
            method: methodName,
        });
        const route = searcher.getRoute();
        routes.push(route);
    }

    return routes;
}
