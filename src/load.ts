import * as Protobuf from 'protobufjs';
import { Options } from '@grpc/proto-loader';

export function loadRouteFromSource(source: string, options?: Options) {
    const root = new Protobuf.Root();
    Protobuf.parse(source, root, options);
    root.resolveAll();
    const namespace = root.nestedArray[0];
    const service = namespace['Mono'];
    const method = service.methods.Call;
    const request = method.resolvedRequestType;
    const response = method.resolvedResponseType;
    return {
        root,
        service,
        method,
        request,
        response,
    };
}
