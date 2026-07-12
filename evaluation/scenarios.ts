import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildObjectAwareChoreographyContext,
  type ObjectAwareChoreographyContext,
  type ObjectAwareChoreographySerializedInput,
} from "../src/shared/context/objectAwareChoreographyContext.js";
import type { FixedParticipantsByCaseAndRole } from "../src/shared/targets/typedPetriNet/index.js";

export type EvaluationScenarioKind =
  | "construct"
  | "validation"
  | "witness"
  | "integrated";

export type EvaluationScenarioId =
  | `CS${string}`
  | `VS${string}`
  | `WS${string}`
  | `IS${string}`;

export interface EvaluationFixtures {
  choreography: string;
  sharedDataModel: string;
  sharedLifecycles: string;
}

export interface PropertyLevelIsolatedExpectation {
  optionToComplete: boolean;
  properInteractionCompletion: boolean;
  taskCoverage: boolean;
  branchCoverage: boolean;
  senderProgression: boolean;
  receiverProgression: boolean;
  decisionConsistency: boolean;
}

export interface PropertyLevelCrossCaseExpectation {
  caseOptionToComplete: boolean;
  properInteractionCompletion: boolean;
  taskCoverage: boolean;
  branchCoverage: boolean;
  senderProgression: boolean;
  receiverProgression: boolean;
  decisionConsistency: boolean;
}

export interface CrossCaseAnalysisVariant {
  id: string;
  slug: string;
  crossCaseClasses: string[];
  participantIdsByRole?: Record<string, string[]>;
  domainsByAlias: Record<string, string[]>;
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
  expectedCrossCaseAnalysis: PropertyLevelCrossCaseExpectation;
  maxMarkings?: number;
  maxDepth?: number;
}

export type ExpectedValidationTarget = "context" | "bspl";

export type BsplExpectation =
  | {
      outcome: "holds";
      exactAfterRefinement?: boolean;
      exactBeforeRefinement?: boolean;
    }
  | { outcome: "rejects"; rejection: RegExp; reason?: string }
  | { outcome: "skip"; reason?: string };

export interface BaseEvaluationScenarioDefinition {
  id: EvaluationScenarioId;
  title: string;
  kind: EvaluationScenarioKind;
  slug: string;
  fixtures: EvaluationFixtures;
  notes?: string;
}

export interface ConstructScenarioDefinition
  extends BaseEvaluationScenarioDefinition {
  kind: "construct";
  bspl?: BsplExpectation;
}

export interface ValidationScenarioDefinition
  extends BaseEvaluationScenarioDefinition {
  kind: "validation";
  validation: {
    target: ExpectedValidationTarget;
    category: string;
    rejection: RegExp;
  };
}

export interface WitnessScenarioDefinition
  extends BaseEvaluationScenarioDefinition {
  kind: "witness";
  expectedIsolatedCaseAnalysis: PropertyLevelIsolatedExpectation;
}

export interface IntegratedScenarioDefinition
  extends BaseEvaluationScenarioDefinition {
  kind: "integrated";
  bspl?: BsplExpectation;
  crossCaseVariants?: CrossCaseAnalysisVariant[];
}

export type EvaluationScenarioDefinition =
  | ConstructScenarioDefinition
  | ValidationScenarioDefinition
  | WitnessScenarioDefinition
  | IntegratedScenarioDefinition;

export interface EvaluationScenarioContext {
  definition: EvaluationScenarioDefinition;
  input: ObjectAwareChoreographySerializedInput;
  context: ObjectAwareChoreographyContext;
}

const ALL_CROSS_CASE_PROPERTIES_HOLD = {
  caseOptionToComplete: true,
  properInteractionCompletion: true,
  taskCoverage: true,
  branchCoverage: true,
  senderProgression: true,
  receiverProgression: true,
  decisionConsistency: true,
};

const FIXED_TWO_BUYER_CASES: FixedParticipantsByCaseAndRole = {
  case1: { Buyer: "buyer1", Seller: "seller1" },
  case2: { Buyer: "buyer2", Seller: "seller1" },
};

export const constructScenarios = [
  construct("CS01", "no-object sequence", "no_object_sequence", {
    choreography: "cc01_no_object_sequence.chor",
    sharedDataModel: "cd01_one_class.obpt-cd",
    sharedLifecycles: "cl01_create_single_state.obpt-sts",
  }),
  construct(
    "CS02",
    "single-object creation with multiple initial states and common identifier",
    "single_object_alternative_creation",
    {
      choreography: "cc02_single_object_alternative_creation.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl02_create_multiple_states.obpt-sts",
    },
  ),
  construct(
    "CS03",
    "two-object one-to-one creation",
    "two_object_one_to_one_creation",
    {
      choreography: "cc03_two_classes_sequence.chor",
      sharedDataModel: "cd02_two_classes_one_to_one.obpt-cd",
      sharedLifecycles: "cl03_create_two_classes.obpt-sts",
    },
  ),
  construct(
    "CS04",
    "two-object one-to-many creation",
    "two_object_one_to_many_creation",
    {
      choreography: "cc03_two_classes_sequence.chor",
      sharedDataModel: "cd03_two_classes_one_to_many.obpt-cd",
      sharedLifecycles: "cl03_create_two_classes.obpt-sts",
    },
  ),
  construct(
    "CS05",
    "two-object many-to-many creation",
    "two_object_many_to_many_creation",
    {
      choreography: "cc03_two_classes_sequence.chor",
      sharedDataModel: "cd04_two_classes_many_to_many.obpt-cd",
      sharedLifecycles: "cl03_create_two_classes.obpt-sts",
    },
  ),
  construct(
    "CS06",
    "two-object creation without association",
    "two_object_creation_without_association",
    {
      choreography: "cc03_two_classes_sequence.chor",
      sharedDataModel: "cd05_two_classes_no_association.obpt-cd",
      sharedLifecycles: "cl03_create_two_classes.obpt-sts",
    },
  ),
  construct(
    "CS07",
    "three-object mixed dependencies",
    "three_object_mixed_dependencies",
    {
      choreography: "cc04_three_classes_sequence.chor",
      sharedDataModel: "cd06_three_classes_mixed_dependencies.obpt-cd",
      sharedLifecycles: "cl04_create_three_classes.obpt-sts",
    },
  ),
  construct(
    "CS08",
    "communication with different-role local transitions and forwarding",
    "local_transitions_and_forwarding",
    {
      choreography: "cc05_local_transitions_and_forwarding.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles:
        "cl05_local_transition_different_roles_two_states.obpt-sts",
    },
  ),
  construct(
    "CS09",
    "multiple compatible receiver states",
    "multiple_compatible_receiver_states",
    {
      choreography: "cc06_multiple_compatible_receiver_states.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles:
        "cl08_local_transition_different_sources_same_target.obpt-sts",
    },
  ),
  construct(
    "CS10",
    "multi-class synchronization followed by forwarding",
    "multi_class_synchronization_forwarding",
    {
      choreography: "cc07_multi_class_synchronization_forwarding.chor",
      sharedDataModel: "cd04_two_classes_many_to_many.obpt-cd",
      sharedLifecycles: "cl11_synchronized_transition_two_classes.obpt-sts",
    },
  ),
  construct(
    "CS11",
    "synchronization with multiple source states",
    "synchronization_multiple_source_states",
    {
      choreography: "cc08_synchronization_multiple_source_states.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles:
        "cl12_synchronized_transition_multiple_sources.obpt-sts",
    },
  ),
  construct(
    "CS12",
    "state reachable by synchronization or local transition",
    "state_reachable_by_sync_or_local",
    {
      choreography: "cc09_state_reachable_by_sync_or_local.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl09_local_or_synchronized_same_target.obpt-sts",
    },
  ),
  construct("CS13", "combined task on same class", "combined_same_class", {
    choreography: "cc10_combined_same_class.chor",
    sharedDataModel: "cd01_one_class.obpt-cd",
    sharedLifecycles: "cl10_synchronized_transition_one_class.obpt-sts",
  }),
  construct(
    "CS14",
    "combined task across classes",
    "combined_different_classes",
    {
      choreography: "cc11_combined_different_classes.chor",
      sharedDataModel: "cd04_two_classes_many_to_many.obpt-cd",
      sharedLifecycles:
        "cl13_synchronized_transition_one_of_two_classes.obpt-sts",
    },
  ),
  construct(
    "CS15",
    "event-based gateway with local non-creational decision",
    "event_based_local_non_creational_decision",
    {
      choreography: "cc12_event_based_local_non_creational_decision.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl06_local_decision_two_roles.obpt-sts",
    },
  ),
  construct("CS16", "guarded exclusive gateway", "guarded_exclusive_gateway", {
    choreography: "cc13_exclusive_guarded_branches.chor",
    sharedDataModel: "cd01_one_class.obpt-cd",
    sharedLifecycles: "cl02_create_multiple_states.obpt-sts",
  }),
  construct(
    "CS17",
    "exclusive gateway with affected role identification",
    "guarded_exclusive_gateway",
    {
      choreography: "cc14_exclusive_affected_participants.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl02_create_multiple_states.obpt-sts",
    },
    {
      bspl: {
        outcome: "skip",
        reason: "Number of independent tasks is too large",
      },
    },
  ),
  construct(
    "CS18",
    "parallel independent object branches",
    "parallel_independent_object_branches",
    {
      choreography: "cc15_parallel_independent_object_branches.chor",
      sharedDataModel: "cd07_three_classes_no_association.obpt-cd",
      sharedLifecycles: "cl04_create_three_classes.obpt-sts",
    },
  ),
  construct(
    "CS19",
    "event-based gateway loop",
    "event_based_gateway_loop",
    {
      choreography: "cc16_event_based_gateway_loop.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl01_create_single_state.obpt-sts",
    },
    {
      bspl: {
        outcome: "rejects",
        rejection: /loop|cycle|cyclic.*control.*flow|control[- ]?flow.*cycle/i,
      },
    },
  ),
  construct(
    "CS20",
    "exclusive gateway loop",
    "exclusive_gateway_loop",
    {
      choreography: "cc17_exclusive_gateway_loop.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl15_local_decision_synchronized_loop.obpt-sts",
    },
    {
      bspl: {
        outcome: "rejects",
        rejection: /loop|cycle|cyclic.*control.*flow|control[- ]?flow.*cycle/i,
      },
    },
  ),
] as const satisfies readonly ConstructScenarioDefinition[];

export const validationScenarios = [
  validation(
    "VS01",
    "duplicate task names are rejected",
    "duplicate_task_names",
    {
      choreography: "vc01_duplicate_task_names.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl01_create_single_state.obpt-sts",
    },
    "duplicate-task-name",
    /duplicate.*task|task.*name.*unique/i,
  ),
  validation(
    "VS02",
    "unsupported two-way task",
    "non-normalized_task",
    {
      choreography: "vc08_two_way_task.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles:
        "cl05_local_transition_different_roles_two_states.obpt-sts",
    },
    "non-normalized-task",
    /more than one message element.*at most one/i,
    "context",
  ),
  validation(
    "VS03",
    "multiple creator roles are rejected",
    "multiple_creator_roles",
    {
      choreography: "cc02_single_object_alternative_creation.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "vl02_create_multiple_states_no_common_role.obpt-sts",
    },
    "multiple-creator-roles",
    /multiple.*creator.*roles|creator.*role.*class|multiple.*initial.*roles/i,
  ),
  validation(
    "VS04",
    "inconsistent one-to-one creators are rejected",
    "inconsistent_one_to_one_creators",
    {
      choreography: "cc03_two_classes_sequence.chor",
      sharedDataModel: "cd02_two_classes_one_to_one.obpt-cd",
      sharedLifecycles: "vl03_create_two_classes_different_roles.obpt-sts",
    },
    "one-to-one-creator-inconsistency",
    /(mandatory.*)?(one-to-one|1:1).*common.*creator|creator.*role.*inconsistent|common.*creator.*role/i,
  ),
  validation(
    "VS05",
    "exclusive gateway without SESE is rejected",
    "exclusive_gateway_without_sese",
    {
      choreography: "vc02_exclusive_gateway_without_sese.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl02_create_multiple_states.obpt-sts",
    },
    "non-sese-exclusive-gateway",
    /SESE|single-entry.*single-exit|well-formed.*(decision|loop)|exclusive.*gateway.*SESE/i,
  ),
  validation(
    "VS06",
    "data-model class without lifecycle is rejected",
    "data_class_without_lifecycle",
    {
      choreography: "cc01_no_object_sequence.chor",
      sharedDataModel: "cd04_two_classes_many_to_many.obpt-cd",
      sharedLifecycles: "cl01_create_single_state.obpt-sts",
    },
    "missing-lifecycle-for-data-class",
    /data model class.*does not have.*object lifecycle|class.*without.*lifecycle|missing.*object lifecycle/i,
  ),
  validation(
    "VS07",
    "lifecycle class absent from data model is rejected",
    "lifecycle_class_absent_from_data_model",
    {
      choreography: "cc01_no_object_sequence.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl03_create_two_classes.obpt-sts",
    },
    "lifecycle-class-not-in-data-model",
    /object lifecycle class.*does not exist.*data model|lifecycle.*class.*absent.*data model|not.*in.*data.*model/i,
  ),
  validation(
    "VS08",
    "task reference to unknown class is rejected",
    "task_reference_unknown_class",
    {
      choreography: "vc03_task_reference_unknown_class.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl01_create_single_state.obpt-sts",
    },
    "unknown-task-class-reference",
    /unknown.*class.*MissingClass|MissingClass.*not.*in.*data.*model/i,
    "context",
  ),
  validation(
    "VS09",
    "task reference to unknown lifecycle state is rejected",
    "task_reference_unknown_state",
    {
      choreography: "vc04_task_reference_unknown_state.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl01_create_single_state.obpt-sts",
    },
    "unknown-task-state-reference",
    /unknown.*state.*ClassA.*missing-state|state.*not.*found.*missing-state/i,
    "context",
  ),
  validation(
    "VS10",
    "ambiguous synchronized transition target",
    "ambiguous_sync_target",
    {
      choreography: "cc12_event_based_local_non_creational_decision.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles:
        "vl05_synchronized_transition_different_targets.obpt-sts",
    },
    "ambiguous-sync-target",
    /ambiguous.*synchronized.*transition|synchronized.*transition.*ambiguous/i,
    "context",
  ),
  validation(
    "VS11",
    "decision guard with unknown class is rejected",
    "guard_unknown_class",
    {
      choreography: "vc05_guard_unknown_class.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl02_create_multiple_states.obpt-sts",
    },
    "unknown-guard-class",
    /guard.*class.*MissingClass|unknown.*class.*MissingClass|MissingClass.*not.*in.*data.*model/i,
    "context",
  ),
  validation(
    "VS12",
    "decision guard with unknown state is rejected",
    "guard_unknown_state",
    {
      choreography: "vc06_guard_unknown_state.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl02_create_multiple_states.obpt-sts",
    },
    "unknown-guard-state",
    /guard.*state.*missing-state|unknown.*state.*missing-state|missing-state.*not.*in.*lifecycle/i,
    "context",
  ),
  validation(
    "VS13",
    "BSPL rejects alternative initial states without common identifier",
    "bspl_no_common_identifier",
    {
      choreography: "cc02_single_object_alternative_creation.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles:
        "vl01_create_multiple_states_no_common_attribute.obpt-sts",
    },
    "bspl-no-common-identifier",
    /no common.*attributes|common.*identifier|object-identifying.*parameters/i,
    "bspl",
  ),
  validation(
    "VS14",
    "BSPL rejects control-flow loop",
    "bspl_control_flow_loop",
    {
      choreography: "cc16_event_based_gateway_loop.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl01_create_single_state.obpt-sts",
    },
    "bspl-control-flow-cycle",
    /loop|cycle|cyclic.*control.*flow|control[- ]?flow.*cycle/i,
    "bspl",
  ),
  validation(
    "VS15",
    "BSPL rejects lifecycle loop",
    "bspl_lifecycle_loop",
    {
      choreography: "cc05_local_transitions_and_forwarding.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "cl14_local_transition_loop.obpt-sts",
    },
    "bspl-lifecycle-cycle",
    /lifecycle.*loop|lifecycle.*cycle|cycle.*lifecycle/i,
    "bspl",
  ),
  validation(
    "VS16",
    "BSPL rejects direct completion after parallel join",
    "bspl_parallel_join_completion",
    {
      choreography: "vc07_bspl_parallel_join_completion.chor",
      sharedDataModel: "cd04_two_classes_many_to_many.obpt-cd",
      sharedLifecycles: "cl03_create_two_classes.obpt-sts",
    },
    "bspl-parallel-join-completion",
    /parallel.*join|completion.*parallel|unsupported.*completion/i,
    "bspl",
  ),
  validation(
    "VS17",
    "BSPL rejects missing local-transition attribute signature",
    "bspl_missing_attribute_signature",
    {
      choreography: "cc05_local_transitions_and_forwarding.chor",
      sharedDataModel: "cd01_one_class.obpt-cd",
      sharedLifecycles: "vl04_invalid_missing_attribute_signature.obpt-sts",
    },
    "bspl-missing-attribute-signature",
    /local transition.*attribute/i,
    "bspl",
  ),
] as const satisfies readonly ValidationScenarioDefinition[];

export const witnessScenarios = [
  witness(
    "WS01",
    "sender-side blocking",
    "sender_side_blocking",
    {
      choreography: "wc01_sender_side_blocking.chor",
      sharedDataModel: "wd01_order.obpt-cd",
      sharedLifecycles: "wl01_order.obpt-sts",
    },
    {
      senderProgression: false,
      receiverProgression: true,
      decisionConsistency: true,
      optionToComplete: true,
      properInteractionCompletion: true,
      taskCoverage: true,
      branchCoverage: true,
    },
  ),
  witness(
    "WS02",
    "receiver-side blocking",
    "receiver_side_blocking",
    {
      choreography: "wc02_receiver_side_blocking.chor",
      sharedDataModel: "wd01_order.obpt-cd",
      sharedLifecycles: "wl01_order.obpt-sts",
    },
    {
      senderProgression: true,
      receiverProgression: false,
      decisionConsistency: true,
      optionToComplete: true,
      properInteractionCompletion: true,
      taskCoverage: true,
      branchCoverage: true,
    },
  ),
  witness(
    "WS03",
    "unreachable behavior",
    "unreachable_behavior",
    {
      choreography: "wc03_unreachable_behavior.chor",
      sharedDataModel: "wd01_order.obpt-cd",
      sharedLifecycles: "wl01_order.obpt-sts",
    },
    {
      senderProgression: true,
      receiverProgression: true,
      decisionConsistency: true,
      optionToComplete: true,
      properInteractionCompletion: true,
      taskCoverage: false,
      branchCoverage: false,
    },
  ),
  witness(
    "WS04",
    "decision misalignment",
    "decision_misalignment",
    {
      choreography: "wc04_decision_misalignment.chor",
      sharedDataModel: "wd01_order.obpt-cd",
      sharedLifecycles: "wl01_order.obpt-sts",
    },
    {
      senderProgression: true,
      receiverProgression: true,
      decisionConsistency: false,
      optionToComplete: true,
      properInteractionCompletion: true,
      taskCoverage: true,
      branchCoverage: true,
    },
  ),
  witness(
    "WS05",
    "completion loss",
    "completion_loss",
    {
      choreography: "wc05_completion_loss.chor",
      sharedDataModel: "wd01_order.obpt-cd",
      sharedLifecycles: "wl01_order.obpt-sts",
    },
    {
      senderProgression: true,
      receiverProgression: true,
      decisionConsistency: true,
      optionToComplete: false,
      properInteractionCompletion: true,
      taskCoverage: true,
      branchCoverage: true,
    },
  ),
] as const satisfies readonly WitnessScenarioDefinition[];

export const integratedScenarios = [
  integrated("IS01", "order fulfillment", "order_fulfillment", {
    choreography: "ic01_order_fulfillment.chor",
    sharedDataModel: "id01_order_fulfillment.obpt-cd",
    sharedLifecycles: "il01_order_fulfillment.obpt-sts",
  }),
  integrated(
    "IS02",
    "item purchase plain",
    "item_purchase_plain",
    {
      choreography: "ic02_item_purchase_plain.chor",
      sharedDataModel: "id02_item_purchase_plain.obpt-cd",
      sharedLifecycles: "il02_item_purchase_plain.obpt-sts",
    },
    {
      crossCaseVariants: [
        crossCaseVariant("unique_1case_1item", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: { Buyer: ["buyer1"], Seller: ["seller1"] },
          domainsByAlias: {
            case: ["case1"],
            Buyer: ["buyer1"],
            Seller: ["seller1"],
            Item: ["item1"],
          },
          expectedCrossCaseAnalysis: ALL_CROSS_CASE_PROPERTIES_HOLD,
        }),
        crossCaseVariant("fixed_2cases_2items", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1", "item2"],
          },
          fixedParticipantsByCaseAndRole: FIXED_TWO_BUYER_CASES,
          expectedCrossCaseAnalysis: {
            caseOptionToComplete: false,
            properInteractionCompletion: true,
            taskCoverage: true,
            branchCoverage: true,
            senderProgression: true,
            receiverProgression: false,
            decisionConsistency: true,
          },
        }),
        crossCaseVariant("unrestricted_2cases_2items", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1", "item2"],
          },
          expectedCrossCaseAnalysis: {
            caseOptionToComplete: false,
            properInteractionCompletion: true,
            taskCoverage: true,
            branchCoverage: true,
            senderProgression: true,
            receiverProgression: false,
            decisionConsistency: true,
          },
        }),
        crossCaseVariant("fixed_2cases_1item", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1"],
          },
          fixedParticipantsByCaseAndRole: FIXED_TWO_BUYER_CASES,
          expectedCrossCaseAnalysis: {
            caseOptionToComplete: false,
            properInteractionCompletion: true,
            taskCoverage: true,
            branchCoverage: true,
            senderProgression: false,
            receiverProgression: false,
            decisionConsistency: true,
          },
        }),
        crossCaseVariant("unrestricted_2cases_1item", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1"],
          },
          expectedCrossCaseAnalysis: {
            caseOptionToComplete: false,
            properInteractionCompletion: true,
            taskCoverage: true,
            branchCoverage: true,
            senderProgression: false,
            receiverProgression: false,
            decisionConsistency: true,
          },
        }),
      ],
    },
  ),
  integrated(
    "IS03",
    "item purchase optimistic",
    "item_purchase_optimistic",
    {
      choreography: "ic03_item_purchase_optimistic.chor",
      sharedDataModel: "id03_item_purchase_optimistic.obpt-cd",
      sharedLifecycles: "il03_item_purchase_optimistic.obpt-sts",
    },
    {
      crossCaseVariants: [
        crossCaseVariant("unique_1case_1item", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: { Buyer: ["buyer1"], Seller: ["seller1"] },
          domainsByAlias: {
            case: ["case1"],
            Buyer: ["buyer1"],
            Seller: ["seller1"],
            Item: ["item1"],
            Order: ["order1"],
          },
          expectedCrossCaseAnalysis: ALL_CROSS_CASE_PROPERTIES_HOLD,
        }),
        crossCaseVariant("fixed_2cases_2items", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1", "item2"],
            Order: ["order1", "order2"],
          },
          fixedParticipantsByCaseAndRole: FIXED_TWO_BUYER_CASES,
          expectedCrossCaseAnalysis: ALL_CROSS_CASE_PROPERTIES_HOLD,
        }),
        crossCaseVariant("unrestricted_2cases_2items", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1", "item2"],
            Order: ["order1", "order2"],
          },
          expectedCrossCaseAnalysis: {
            caseOptionToComplete: false,
            properInteractionCompletion: true,
            taskCoverage: true,
            branchCoverage: true,
            senderProgression: true,
            receiverProgression: false,
            decisionConsistency: true,
          },
        }),
        crossCaseVariant("fixed_2cases_1item", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1"],
            Order: ["order1", "order2"],
          },
          fixedParticipantsByCaseAndRole: FIXED_TWO_BUYER_CASES,
          expectedCrossCaseAnalysis: ALL_CROSS_CASE_PROPERTIES_HOLD,
        }),
        crossCaseVariant("unrestricted_2cases_1item", {
          crossCaseClasses: ["Item"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1"],
            Order: ["order1", "order2"],
          },
          expectedCrossCaseAnalysis: {
            caseOptionToComplete: false,
            properInteractionCompletion: true,
            taskCoverage: true,
            branchCoverage: true,
            senderProgression: true,
            receiverProgression: false,
            decisionConsistency: true,
          },
        }),
      ],
    },
  ),
  integrated(
    "IS04",
    "item purchase pessimistic",
    "item_purchase_pessimistic",
    {
      choreography: "ic04_item_purchase_pessimistic.chor",
      sharedDataModel: "id04_item_purchase_pessimistic.obpt-cd",
      sharedLifecycles: "il04_item_purchase_pessimistic.obpt-sts",
    },
    {
      bspl: {
        outcome: "skip",
        reason: "Pessimistic item purchase is not included in BSPL evaluation.",
      },
      crossCaseVariants: [
        crossCaseVariant("unique_1case_1reservation", {
          crossCaseClasses: ["Item", "Reservation"],
          participantIdsByRole: { Buyer: ["buyer1"], Seller: ["seller1"] },
          domainsByAlias: {
            case: ["case1"],
            Buyer: ["buyer1"],
            Seller: ["seller1"],
            Item: ["item1"],
            Reservation: ["reservation1"],
          },
          expectedCrossCaseAnalysis: ALL_CROSS_CASE_PROPERTIES_HOLD,
        }),
        crossCaseVariant("fixed_2cases_2reservations", {
          crossCaseClasses: ["Item", "Reservation"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1", "item2"],
            Reservation: ["reservation1", "reservation2"],
          },
          fixedParticipantsByCaseAndRole: FIXED_TWO_BUYER_CASES,
          expectedCrossCaseAnalysis: ALL_CROSS_CASE_PROPERTIES_HOLD,
        }),
        crossCaseVariant("unrestricted_2cases_2reservations", {
          crossCaseClasses: ["Item", "Reservation"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1", "item2"],
            Reservation: ["reservation1", "reservation2"],
          },
          expectedCrossCaseAnalysis: {
            caseOptionToComplete: false,
            properInteractionCompletion: true,
            taskCoverage: true,
            branchCoverage: true,
            senderProgression: true,
            receiverProgression: false,
            decisionConsistency: true,
          },
        }),
        crossCaseVariant("fixed_2cases_1reservation", {
          crossCaseClasses: ["Item", "Reservation"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1"],
            Reservation: ["reservation1"],
          },
          fixedParticipantsByCaseAndRole: FIXED_TWO_BUYER_CASES,
          expectedCrossCaseAnalysis: ALL_CROSS_CASE_PROPERTIES_HOLD,
        }),
        crossCaseVariant("unrestricted_2cases_1reservation", {
          crossCaseClasses: ["Item", "Reservation"],
          participantIdsByRole: {
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
          },
          domainsByAlias: {
            case: ["case1", "case2"],
            Buyer: ["buyer1", "buyer2"],
            Seller: ["seller1"],
            Item: ["item1"],
            Reservation: ["reservation1"],
          },
          expectedCrossCaseAnalysis: {
            caseOptionToComplete: false,
            properInteractionCompletion: true,
            taskCoverage: true,
            branchCoverage: true,
            senderProgression: true,
            receiverProgression: false,
            decisionConsistency: true,
          },
        }),
      ],
    },
  ),
] as const satisfies readonly IntegratedScenarioDefinition[];

export const evaluationScenarios = [
  ...constructScenarios,
  ...validationScenarios,
  ...witnessScenarios,
  ...integratedScenarios,
] as const satisfies readonly EvaluationScenarioDefinition[];

export function getScenarioDefinition(
  id: EvaluationScenarioId,
): EvaluationScenarioDefinition {
  const definition = evaluationScenarios.find((scenario) => scenario.id === id);

  if (!definition) {
    throw new Error(`Unknown evaluation scenario: ${id}`);
  }

  return definition;
}

export function getConstructScenarios(): ConstructScenarioDefinition[] {
  return [...constructScenarios];
}

export function getValidationScenarios(): ValidationScenarioDefinition[] {
  return [...validationScenarios];
}

export function getWitnessScenarios(): WitnessScenarioDefinition[] {
  return [...witnessScenarios];
}

export function getIntegratedScenarios(): IntegratedScenarioDefinition[] {
  return [...integratedScenarios];
}

export function getCrossCaseAnalysisVariants(): Array<{
  scenario: IntegratedScenarioDefinition;
  variant: CrossCaseAnalysisVariant;
}> {
  return getIntegratedScenarios().flatMap((scenario) =>
    (scenario.crossCaseVariants ?? []).map((variant) => ({
      scenario,
      variant,
    })),
  );
}

export async function getScenario(
  id: EvaluationScenarioId,
): Promise<EvaluationScenarioContext> {
  const definition = getScenarioDefinition(id);
  const input = await loadScenarioInput(definition);

  return {
    definition,
    input,
    context: await buildObjectAwareChoreographyContext(input),
  };
}

export async function loadScenarioInput(
  definition: EvaluationScenarioDefinition,
): Promise<ObjectAwareChoreographySerializedInput> {
  const [choreography, sharedDataModel, sharedLifecycleFiles] =
    await Promise.all([
      loadEvaluationFixture(
        "choreographies",
        definition.fixtures.choreography,
        definition,
      ),
      loadEvaluationFixture(
        "shared_data_models",
        definition.fixtures.sharedDataModel,
        definition,
      ),
      loadEvaluationFixture(
        "shared_object_lifecycles",
        definition.fixtures.sharedLifecycles,
        definition,
      ),
    ]);

  return {
    choreography,
    shared_data_model: sharedDataModel,
    shared_object_lifecycles: sharedLifecycleFiles,
  };
}

export function missingFixturePaths(
  definition: EvaluationScenarioDefinition,
): string[] {
  return fixturePaths(definition).filter(
    (fixturePath) => !existsSync(fixturePath),
  );
}

function construct(
  id: EvaluationScenarioId,
  title: string,
  slug: string,
  fixtures: EvaluationFixtures,
  options: Pick<ConstructScenarioDefinition, "notes" | "bspl"> = {},
): ConstructScenarioDefinition {
  return {
    id,
    title,
    kind: "construct",
    slug,
    fixtures,
    ...options,
  };
}

function validation(
  id: EvaluationScenarioId,
  title: string,
  slug: string,
  fixtures: EvaluationFixtures,
  category: string,
  rejection: RegExp,
  validationTarget: ExpectedValidationTarget = "context",
): ValidationScenarioDefinition {
  return {
    id,
    title,
    kind: "validation",
    slug,
    fixtures,
    validation: {
      target: validationTarget,
      category,
      rejection,
    },
  };
}

function witness(
  id: EvaluationScenarioId,
  title: string,
  slug: string,
  fixtures: EvaluationFixtures,
  expectedIsolatedCaseAnalysis: PropertyLevelIsolatedExpectation,
): WitnessScenarioDefinition {
  return {
    id,
    title,
    kind: "witness",
    slug,
    fixtures,
    expectedIsolatedCaseAnalysis,
  };
}

function integrated(
  id: EvaluationScenarioId,
  title: string,
  slug: string,
  fixtures: EvaluationFixtures,
  options: Pick<
    IntegratedScenarioDefinition,
    "notes" | "bspl" | "crossCaseVariants"
  > = {},
): IntegratedScenarioDefinition {
  return {
    id,
    title,
    kind: "integrated",
    slug,
    fixtures,
    ...options,
  };
}

function crossCaseVariant(
  slug: string,
  definition: Omit<CrossCaseAnalysisVariant, "id" | "slug">,
): CrossCaseAnalysisVariant {
  return {
    id: slug,
    slug,
    maxMarkings: 300000,
    maxDepth: 100,
    ...definition,
  };
}

function fixturePaths(definition: EvaluationScenarioDefinition): string[] {
  return [
    evaluationFixturePath("choreographies", definition.fixtures.choreography),
    evaluationFixturePath(
      "shared_data_models",
      definition.fixtures.sharedDataModel,
    ),
    evaluationFixturePath(
      "shared_object_lifecycles",
      definition.fixtures.sharedLifecycles,
    ),
  ];
}

async function loadEvaluationFixture(
  directory:
    | "choreographies"
    | "shared_data_models"
    | "shared_object_lifecycles",
  fileName: string,
  definition: EvaluationScenarioDefinition,
): Promise<string> {
  const fixturePath = evaluationFixturePath(directory, fileName);

  if (!existsSync(fixturePath)) {
    throw new Error(
      `Missing evaluation fixture for ${definition.id} (${definition.title}): ${fixturePath}`,
    );
  }

  return readFile(fixturePath, "utf8");
}

function evaluationFixturePath(directory: string, fileName: string): string {
  return resolve(
    process.cwd(),
    "evaluation",
    "fixtures",
    directory,
    fileName,
  );
}
