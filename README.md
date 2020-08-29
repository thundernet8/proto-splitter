## Proto-Splitter

Split protobuf files into single method protos and tree shaking

## Install

```bash
yarn add proto-splitter
```

## Usage

```ts
import { getProtoRoutes } from 'proto-splitter';

const file = '/your_proto_file_path';
(async function() {
    const routes = await getProtoRoutes(file);
    console.log(routes);
})();
```

### Example

```proto3
# source a.proto
syntax = "proto3";
package a;

message PostType {
    enum Enum {
        V1 = 0;
        V2 = 1;
    }
}

# source b.proto
syntax = "proto3";
package b;

import "a.proto";

message GetPostReq {
    int32 id = 1;
}

message Post {
    string title = 1;
    int32 id = 2;
    string content = 3;
    PostType.Enum type = 4;
}

message GetPostListReq {
    int32 page_size = 1;
    int32 page = 2;
}

message GetPostListResp {
    repeated Post post = 1;
    int32 total = 2;
}

service PostService {
    rpc GetPost(GetPostReq) returns (Post);
    rpc GetPostList(GetPostListReq) returns (GetPostListResp);
}

# output two routes
# 1
syntax = "proto3";

package mono;

enum E1 {
  V1 = 0;
  V2 = 1;
}

message Req {
  int32 id = 1;
}

message Resp {
  string title = 1;
  int32 id = 2;
  string content = 3;
  E1 type = 4;
}

service Mono {
  rpc Call(Req) returns (Resp);
}

# 2
syntax = "proto3";

package mono;

enum E1 {
  V1 = 0;
  V2 = 1;
}

message M1 {
  string title = 1;
  int32 id = 2;
  string content = 3;
  E1 type = 4;
}

message Req {
  int32 page_size = 1;
  int32 page = 2;
}

message Resp {
  repeated M1 post = 1;
  int32 total = 2;
}

service Mono {
  rpc Call(Req) returns (Resp);
}
```
