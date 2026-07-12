import type {
  BsplAdornment,
  BsplMessageParameter,
  BsplMessageSchema,
} from "../../targets/bspl/bsplTypes.js";

export class BsplMessageVariantBuilder {
  private readonly parameters = new Map<string, BsplAdornment>();
  private conflicted = false;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly sender: string,
    readonly receiver: string,
    readonly taskId: string,
  ) {}

  clone(id = this.id): BsplMessageVariantBuilder {
    const next = new BsplMessageVariantBuilder(
      id,
      this.name,
      this.sender,
      this.receiver,
      this.taskId,
    );

    for (const [parameter, adornment] of this.parameters) {
      next.parameters.set(parameter, adornment);
    }

    next.conflicted = this.conflicted;
    return next;
  }

  add(parameter: string, adornment: BsplAdornment): this {
    const existingAdornment = this.parameters.get(parameter);

    if (existingAdornment !== undefined && existingAdornment !== adornment) {
      this.conflicted = true;
      return this;
    }

    this.parameters.set(parameter, adornment);
    return this;
  }

  addMany(parameters: string[], adornment: BsplAdornment): this {
    for (const parameter of parameters) {
      this.add(parameter, adornment);
    }

    return this;
  }

  parametersWithAdornments(adornments: BsplAdornment[]): string[] {
    const adornmentSet = new Set(adornments);

    return [...this.parameters.entries()]
      .filter(([, adornment]) => adornmentSet.has(adornment))
      .map(([parameter]) => parameter)
      .sort();
  }

  hasConflict(): boolean {
    return this.conflicted;
  }

  build(): BsplMessageSchema | undefined {
    if (this.conflicted) {
      return undefined;
    }

    return {
      id: this.id,
      name: this.name,
      sender: this.sender,
      receiver: this.receiver,
      taskId: this.taskId,
      parameters: [...this.parameters.entries()]
        .map(([name, adornment]) => ({ name, adornment }))
        .sort(compareMessageParameters),
    };
  }
}

export function expandByAlternativeSignatures(
  builders: BsplMessageVariantBuilder[],
  alternativesByGroup: string[][][],
  adornment: BsplAdornment,
  idPart: string,
): BsplMessageVariantBuilder[] {
  return alternativesByGroup.reduce<BsplMessageVariantBuilder[]>(
    (currentBuilders, alternatives, groupIndex) =>
      currentBuilders.flatMap((builder) =>
        alternatives.map((alternative, alternativeIndex) => {
          const next = builder.clone(
            `${builder.id}_${idPart}${groupIndex}_${alternativeIndex}`,
          );
          next.addMany(alternative, adornment);
          return next;
        }),
      ),
    builders,
  );
}

export function deduplicateMessageSchemas(
  messages: BsplMessageSchema[],
): BsplMessageSchema[] {
  const messagesBySignature = new Map<string, BsplMessageSchema>();

  for (const message of messages) {
    messagesBySignature.set(messageSignature(message), message);
  }

  return [...messagesBySignature.values()].sort(compareMessages);
}

export function messageSignature(message: BsplMessageSchema): string {
  return [
    message.sender,
    message.receiver,
    message.name,
    ...message.parameters.map(
      (parameter) => `${parameter.adornment}:${parameter.name}`,
    ),
  ].join("|");
}

export function compareMessages(
  left: BsplMessageSchema,
  right: BsplMessageSchema,
): number {
  return (
    left.name.localeCompare(right.name) ||
    left.sender.localeCompare(right.sender) ||
    left.receiver.localeCompare(right.receiver) ||
    left.id.localeCompare(right.id)
  );
}

function compareMessageParameters(
  left: BsplMessageParameter,
  right: BsplMessageParameter,
): number {
  const keyParameterOrder = (parameter: BsplMessageParameter): number =>
    parameter.name === "case_id" || parameter.name === "q_case" ? 0 : 1;
  const adornmentOrder = new Map<BsplAdornment, number>([
    ["in", 0],
    ["out", 1],
    ["nil", 2],
  ]);

  return (
    keyParameterOrder(left) - keyParameterOrder(right) ||
    (adornmentOrder.get(left.adornment) ?? 0) -
      (adornmentOrder.get(right.adornment) ?? 0) ||
    left.name.localeCompare(right.name)
  );
}
