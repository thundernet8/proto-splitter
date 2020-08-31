import * as Protobuf from 'protobufjs';
import * as fs from 'fs';
import * as path from 'path';
import format from 'clang-format';
import tmp from 'tmp';
import { Options } from '@grpc/proto-loader';
import {
    createEnumDefinition,
    createMessageDefinition,
    loadProtoDef,
    isNamespace,
} from './utils';

interface MessageDefinition<T = Protobuf.Message> {
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

    private options: GetProtoRoutesOptions;

    private reqFullName!: string;

    private respFullName!: string;

    constructor({ pb, pkg, service, method, options }) {
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
        route.proto = await this.generateRouteProto(route);
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

    private async generateRouteProto(route: ProtoRoute) {
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
        const lines: string[] = [];
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
        lines.push(
            `service Mono{rpc Call(M${this.idMap.get(
                this.reqFullName
            )}) returns (M${this.idMap.get(this.respFullName)});}`
        );
        const proto = lines.join('').trim();
        if (this.options.format) {
            return new Promise<string>((resolve, reject) => {
                tmp.file(
                    {
                        discardDescriptor: true,
                        postfix: '.proto',
                    },
                    (err, path, fd, clear) => {
                        if (err) {
                            reject(err);
                        } else {
                            fs.writeFile(path, proto, (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    const stream = format(
                                        { path },
                                        'utf-8',
                                        '{Language: Proto,BasedOnStyle: Google}',
                                        function() {}
                                    );
                                    const bufs: string[] = [];
                                    stream.on('data', function(chunk) {
                                        bufs.push(chunk);
                                    });
                                    stream.on('end', function() {
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
                    }
                );
            });
        }
        return proto;
    }

    private generateMsgProto(msg) {
        const lines: string[] = [];
        const name = `M${this.idMap.get(msg.fullName)}`;
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
                } else if (field[1] === 536870911) {
                    lines.push(`reserved ${field[0]} to max;`);
                } else {
                    lines.push(`reserved ${field[0]} to ${field[1]};`);
                }
            }
        }
        lines.push('}');
        return lines.filter((str) => !/^[' ']+$/.test(str)).join('');
    }

    private generateEnumProto(enumItem) {
        const lines: string[] = [];
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
            text.push('repeated ');
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
            protoType = `ME${this.idMap.get(resolvedType.fullName)}.E`;
        }
        text.push(protoType + ' ');
        text.push(name);
        text.push('=');
        text.push(`${id};`);
        return text.join('');
    }
}

export interface GetProtoRoutesOptions extends Options {
    /**
     * 是否格式化proto文件，默认否则proto文件会被压缩
     */
    format?: boolean;
}

/**
 * 从单个proto文件中解析出以单个RPC方法为粒度的proto文件列表
 * @param filePath proto文件路径
 * @param options proto文件解析以及输出选项，主要包括includeDirs和format选项
 */
export async function getProtoRoutes(
    filePath: string,
    options: GetProtoRoutesOptions = {}
) {
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
    const pb = await loadProtoDef(filePath, {
        includeDirs: [
            path.join(path.dirname(require.resolve('protobufjs')), ''),
            path.join(path.resolve(__dirname, '../protos')),
        ].concat(options.includeDirs || []),
        keepCase: true,
    });
    const Service = pb[`${packageName}.${serviceName}`];
    const tasks: Promise<ProtoRoute>[] = [];
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
