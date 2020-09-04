const { loadRouteFromSource } = require('../lib');
const source = `syntax = "proto3";
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
}`;

const result = loadRouteFromSource(source);

console.log(result);
