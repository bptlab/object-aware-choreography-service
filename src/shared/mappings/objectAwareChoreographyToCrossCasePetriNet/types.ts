export interface CrossCasePetriNetOptions {
  crossCaseClasses: string[];
  participantIdsByRole?: Record<string, string[]>;
}

export interface CrossCaseClassMetadata {
  classId: string;
  isCrossCase: boolean;
}

export interface CrossCasePetriNetMappingMetadata {
  classes: CrossCaseClassMetadata[];
}
