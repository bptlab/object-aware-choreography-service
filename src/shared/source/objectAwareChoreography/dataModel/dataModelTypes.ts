export type ClassId = string;
export type AttributeId = string;

export interface DataModel {
  classes: DataClass[];
  associations: Association[];
}

export interface DataClass {
  id: ClassId;
  name: string;
  attributes: AttributeId[];
}

export interface AssociationEnd {
  classId: ClassId;
  lower: number;
  upper: number | "*";
}

export interface Association {
  id: string;
  ends: [AssociationEnd, AssociationEnd];
}
