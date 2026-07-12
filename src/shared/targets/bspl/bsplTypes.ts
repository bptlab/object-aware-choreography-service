export type BsplAdornment = "in" | "out" | "nil";

export interface BsplMessageParameter {
  name: string;
  adornment: BsplAdornment;
  key?: boolean;
}

export interface BsplMessageSchema {
  id: string;
  name: string;
  sender: string;
  receiver: string;
  taskId: string;
  parameters: BsplMessageParameter[];
}

export interface BsplProtocolParameter {
  name: string;
  adornment: "out";
  key?: boolean;
  private?: boolean;
}

export interface BsplProtocol {
  name: string;
  roles: string[];
  parameters: BsplProtocolParameter[];
  messages: BsplMessageSchema[];
}

export interface BsplWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BsplBuildSummary {
  roles: number;
  parameters: number;
  privateParameters: number;
  messages: number;
  skippedVariants: number;
}

export interface BsplBuildResult {
  protocol: BsplProtocol;
  warnings: BsplWarning[];
  summary: BsplBuildSummary;
}
