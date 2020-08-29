import * as Protobuf from 'protobufjs';
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
export declare function getProtoRoutes(filePath: string): Promise<false | ProtoRoute[]>;
export {};
