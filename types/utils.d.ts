export declare function isNamespace(type: any): boolean;
export declare function getNamespace(type: any): any;
export declare function createMessageDefinition(message: any): {
    fullName: any;
    parent: any;
    namespace: any;
    type: any;
};
export declare function createEnumDefinition(enumType: any): {
    fullName: any;
    parent: any;
    namespace: any;
    type: any;
};
export declare function loadProtoDef(filename: any, options: any): Promise<{}>;
