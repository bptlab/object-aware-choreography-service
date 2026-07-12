export type ToolExchangePayload = Record<string, boolean | number | string | undefined>;
export declare enum PayloadType {
    BOOLEAN = "BOOLEAN",
    STRING = "STRING",
    NUMBER = "NUMBER",
    FILE = "FILE",
    CURRENT_FILE = "CURRENT_FILE",
    LINKED_FILE = "LINKED_FILE",
    ENUM = "ENUM",
    LIST = "LIST"
}
export declare enum ContentType {
    DIRECTORY = "DIRECTORY",
    BPMN_PROCESS = "BPMN_PROCESS",
    BPMN_CHOREOGRAPHY = "BPMN_CHOREOGRAPHY",
    DMN = "DMN",
    PETRI_NET = "PETRI_NET",
    TYPED_PETRI_NET = "TYPED_PETRI_NET",
    BPMN_Q = "BPMN_Q",
    ER = "ER",
    UML_CLASS = "UML_CLASS",
    STATE_TRANSITION = "STATE_TRANSITION",
    TEXT = "TEXT",
    XML = "XML",
    JSON = "JSON",
    CSV = "CSV",
    YAML = "YAML"
}
export interface PayloadDescription {
    id: string;
    name: string;
    description: string;
    type: PayloadType;
    contentType?: ContentType;
}
export interface ToolOutputPayloadDescription extends PayloadDescription {
    saveFile?: boolean;
}
export interface ToolInputPayloadDescription extends PayloadDescription {
    isOptional: boolean;
    options?: string[];
}
export declare enum Category {
    ANALYSIS = "ANALYSIS",
    CONSISTENCY = "CONSISTENCY",
    TRANSLATION = "TRANSLATION",
    CONSISTENCY_CHECKER = "CONSISTENCY_CHECKER"
}
export interface ToolManifest {
    category: string;
    description: string;
    id: string;
    name: string;
    input: readonly ToolInputPayloadDescription[];
    output: readonly ToolOutputPayloadDescription[];
}
export interface ServiceManifest {
    id: string;
    version: string;
    name: string;
    description: string;
    url: string;
    ttl: number;
    tools: readonly ToolManifest[];
    lastSeen: Date;
}
export interface ServiceInputPayload {
    toolId: string;
    payload: ToolExchangePayload;
}
export declare class ServiceResultDto {
    success: boolean;
    data: ToolExchangePayload | null;
    error?: string;
}
