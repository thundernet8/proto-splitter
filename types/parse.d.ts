import * as Protobuf from 'protobufjs';
import { Options } from '@grpc/proto-loader';
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
export declare function getProtoRoutes(filePath: string, options?: GetProtoRoutesOptions): Promise<false | ProtoRoute[]>;
export {};
