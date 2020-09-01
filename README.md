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
    const routes = await getProtoRoutes(file, { format: true });
    console.log(routes);
})();
```

### Example

```protobuf
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
```

will be

```protobuf
# output two routes
# 1
syntax = "proto3";
package mono;
message ME1 {
  enum E {
    V1 = 0;
    V2 = 1;
  }
}
message M1 {
  int32 id = 1;
}
message M2 {
  string title = 1;
  int32 id = 2;
  string content = 3;
  ME1.E type = 4;
}
service Mono {
  rpc Call(M1) returns (M2);
}

# 2
syntax = "proto3";
package mono;
message ME1 {
  enum E {
    V1 = 0;
    V2 = 1;
  }
}
message M1 {
  int32 page_size = 1;
  int32 page = 2;
}
message M2 {
  repeated M3 post = 1;
  int32 total = 2;
}
message M3 {
  string title = 1;
  int32 id = 2;
  string content = 3;
  ME1.E type = 4;
}
service Mono {
  rpc Call(M1) returns (M2);
}
```
