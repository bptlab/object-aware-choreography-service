import { analyzeObjectAwareAnomalies } from "../analysis/objectAwareAnomalyAnalysis/objectAwareAnomalyAnalysis.js";
import { generateBehaviorStateSpace } from "../analysis/objectAwareAnomalyAnalysis/stateSpace.js";
import {
  buildObjectAwareRealizabilityReport,
  type ObjectAwareRealizabilityReport,
} from "../analysis/objectAwareRealizability/index.js";
import { analyzeProjectedChoreographySoundness } from "../analysis/projectedChoreographySoundness/index.js";
import type {
  ObjectAwareRealizabilityMetadata,
  ObjectAwareAnomalyReport,
} from "../analysis/objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";
import {
  buildPetriNet,
  buildPetriNetWithSemantics,
} from "../mappings/objectAwareChoreographyToPetriNet/buildPetriNet.js";
import { getChoreographyTasks } from "../source/objectAwareChoreography/choreography/choreography.js";
import {
  toAnalysisPetriNet,
  type AnalysisPetriNet,
} from "../targets/petriNet/firing.js";
import type { PetriNetBuilder } from "../targets/petriNet/petriNetBuilder.js";
import type { ObjectAwareChoreographyContext } from "../context/objectAwareChoreographyContext.js";

export interface IsolatedCaseSemantics {
  context: ObjectAwareChoreographyContext;
  petriNet: PetriNetBuilder;
  analysisPetriNet: AnalysisPetriNet;
  objectAwareRealizabilityMetadata: ObjectAwareRealizabilityMetadata;
}

export function buildIsolatedCaseSemantics(
  context: ObjectAwareChoreographyContext,
): IsolatedCaseSemantics {
  const { petriNet, objectAwareRealizabilityMetadata } = buildPetriNet({
    choreography: context.choreography,
    dataModel: context.dataModel,
    lifecycleModel: context.lifecycleModel,
    objectReferences: context.objectReferences,
    taskNameIndex: context.taskNameIndex,
  });

  return {
    context,
    petriNet,
    analysisPetriNet: toAnalysisPetriNet(petriNet),
    objectAwareRealizabilityMetadata,
  };
}

export function buildIsolatedCaseSemanticsWithObjectAwareAnomalyAnalysis(
  context: ObjectAwareChoreographyContext,
):
  IsolatedCaseSemantics & {
    objectAwareAnomalyReport: ObjectAwareAnomalyReport;
  } {
  const semantics = buildIsolatedCaseSemantics(context);
  const objectAwareAnomalyReport = analyzeObjectAwareAnomalies({
    net: semantics.analysisPetriNet,
    metadata: semantics.objectAwareRealizabilityMetadata,
  });

  return {
    ...semantics,
    objectAwareAnomalyReport,
  };
}

export function buildIsolatedCaseSemanticsWithObjectAwareRealizability(
  context: ObjectAwareChoreographyContext,
):
  IsolatedCaseSemantics & {
    objectAwareAnomalyReport: ObjectAwareAnomalyReport;
    objectAwareRealizabilityReport: ObjectAwareRealizabilityReport;
  } {
  const isolated = buildPetriNetWithSemantics({
    choreography: context.choreography,
    dataModel: context.dataModel,
    lifecycleModel: context.lifecycleModel,
    objectReferences: context.objectReferences,
    taskNameIndex: context.taskNameIndex,
  });
  const analysisPetriNet = toAnalysisPetriNet(isolated.petriNet);
  const objectAwareAnomalyReport = analyzeObjectAwareAnomalies({
    net: analysisPetriNet,
    metadata: isolated.objectAwareRealizabilityMetadata,
  });
  const stateSpace = generateBehaviorStateSpace({ net: analysisPetriNet });
  const projectedChoreographySoundness =
    analyzeProjectedChoreographySoundness({
      net: analysisPetriNet,
      stateSpace,
      taskIds: getChoreographyTasks(context.choreography).map((task) => task.id),
      semantics: isolated.semantics,
      branchCoverageBranches: isolated.objectAwareRealizabilityMetadata.branches,
    });
  const objectAwareRealizabilityReport = buildObjectAwareRealizabilityReport({
    anomalyReport: objectAwareAnomalyReport,
    projectedChoreographySoundness,
  });

  return {
    context,
    petriNet: isolated.petriNet,
    analysisPetriNet,
    objectAwareRealizabilityMetadata: isolated.objectAwareRealizabilityMetadata,
    objectAwareAnomalyReport,
    objectAwareRealizabilityReport,
  };
}
