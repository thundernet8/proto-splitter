import * as Protobuf from 'protobufjs';
import { Options } from '@grpc/proto-loader';
export declare function loadRouteFromSource(source: string, options?: Options): {
    root: Protobuf.Root;
    service: any;
    method: any;
    request: any;
    response: any;
};
