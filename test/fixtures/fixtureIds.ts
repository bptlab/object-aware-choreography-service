export const Choreographies = {
  c01TaskNoClass: "chor_01_task_no_class.chor",
  c02SequenceNoClass: "chor_02_sequence_no_class.chor",
  c03InvalidDuplicateTaskNames: "chor_03_invalid_duplicate_task_names.chor",
  c04CommunicationOneClass: "chor_04_communication_one_class.chor",
  c05SequenceCommunicationOneClass:
    "chor_05_sequence_communication_one_class.chor",
  c06SequenceCommunicationOneClassThreeTasks:
    "chor_06_sequence_communication_one_class_three_tasks.chor",
  c07SequenceCommunicationTwoClasses:
    "chor_07_sequence_communication_two_classes.chor",
  c08SequenceCommunicationThreeClasses:
    "chor_08_sequence_communication_three_classes.chor",
  c09SequenceCommunicationOneClassForwarding:
    "chor_09_sequence_communication_one_class_forwarding.chor",
  c10SequenceSynchronizationOneClass:
    "chor_10_sequence_synchronization_one_class.chor",
  c11SequenceSynchronizationTwoClasses:
    "chor_11_sequence_synchronization_two_classes.chor",
  c12SequenceSynchronizationOneClassDifferentRoles:
    "chor_12_sequence_synchronization_one_class_different_roles.chor",
  c13SequenceForwardAfterSynchronization:
    "chor_13_sequence_forward_after_synchronization.chor",
  c14CombinedSameClass: "chor_14_combined_same_class.chor",
  c15CombinedDifferentClasses: "chor_15_combined_different_classes.chor",
  c16EventBasedGatewayCommunicationOneClassCreate:
    "chor_16_event_based_gateway_communication_one_class_create.chor",
  c17EventBasedGatewayCommunicationOneClassJoinCommunication:
    "chor_17_event_based_gateway_communication_one_class_join_communication.chor",
  c18EventBasedGatewayCommunicationOneClassJoinSynchronization:
    "chor_18_event_based_gateway_communication_one_class_join_synchronization.chor",
  c19EventBasedGatewayCommunicationOneClassFollowsCommunication:
    "chor_19_event_based_gateway_communication_one_class_follows_communication.chor",
  c20EventBasedGatewayCommunicationTwoClassesCreate:
    "chor_20_event_based_gateway_communication_two_classes_create.chor",
  c21EventBasedGatewayCommunicationAndSynchronizationOptionOneClass:
    "chor_21_event_based_gateway_communication_and_synchronization_option_one_class.chor",
  c22EventBasedGatewayNoClassLoop:
    "chor_22_event_based_gateway_no_class_loop.chor",
  c23ExclusiveGatewayCommunicationOneClass:
    "chor_23_exclusive_gateway_communication_one_class.chor",
  c24ExclusiveGatewayMultipleAffectedParticipants:
    "chor_24_exclusive_gateway_multiple_affected_participants.chor",
  c25ExclusiveGatewayInvalidNoSese:
    "chor_25_exclusive_gateway_invalid_no_sese.chor",
  c26ExclusiveGatewayNoTaskBranch:
    "chor_26_exclusive_gateway_no_task_branch.chor",
  c27ExclusiveGatewayCommunicationOneClassLoop:
    "chor_27_exclusive_gateway_communication_one_class_loop.chor",
  c28ParallelGatewayCommunicationThreeClasses:
    "chor_28_parallel_gateway_communication_three_classes.chor",
  c29ParallelGatewayJoinTermination:
    "chor_29_parallel_gateway_join_termination.chor",
  c30SendBlockingCommunication: "chor_30_send_blocking_communication.chor",
  c31SendBlockingSynchronization: "chor_31_send_blocking_synchronization.chor",
  c32ReceiveBlockingCommunication:
    "chor_32_receive_blocking_communication.chor",
  c33ReceiveBlockingSynchronization:
    "chor_33_receive_blocking_synchronization.chor",
  c34MisalignedDecision: "chor_34_misaligned_decision.chor",
  c35DeadBranch: "chor_35_dead_branch.chor",
} as const;

export const SharedDataModels = {
  d01OneClass: "sdm_01_one_class.obpt-cd",
  d02TwoClassesNM: "sdm_02_two_classes_n_m.obpt-cd",
  d03TwoClassesN1: "sdm_03_two_classes_n_1.obpt-cd",
  d04TwoClasses11: "sdm_04_two_classes_1_1.obpt-cd",
  d05ThreeClassesNoAssociation: "sdm_05_three_classes_no_association.obpt-cd",
  d06ThreeClasses1NAndNM: "sdm_06_three_classes_1_n_and_n_m.obpt-cd",
} as const;

export const SharedLifecycles = {
  l01CreateSingleState: "solc_01_create_single_state.obpt-sts",
  l02CreateMultipleStates: "solc_02_create_multiple_states.obpt-sts",
  l03CreateMultipleStatesNoCommonAttribute:
    "solc_03_create_multiple_states_no_common_attribute.obpt-sts",
  l04CreateMultipleStatesNoCommonRole:
    "solc_04_create_multiple_states_no_common_role.obpt-sts",
  l05CreateTwoClasses: "solc_05_create_two_classes.obpt-sts",
  l06CreateTwoClassesDifferentRoles:
    "solc_06_create_two_classes_different_roles.obpt-sts",
  l07CreateThreeClasses: "solc_07_create_three_classes.obpt-sts",
  l09LocalTransitionSameRoleTwoStates:
    "solc_09_local_transition_same_role_two_states.obpt-sts",
  l10LocalTransitionDifferentRolesTwoStates:
    "solc_10_local_transition_different_roles_two_states.obpt-sts",
  l11LocalTransitionDifferentRolesThreeStates:
    "solc_11_local_transition_different_roles_three_states.obpt-sts",
  l12LocalDecisionSameRole: "solc_12_local_decision_same_role.obpt-sts",
  l13LocalDecisionDifferentRoles:
    "solc_13_local_decision_different_roles.obpt-sts",
  l14LocalTransitionDifferentSourcesSameTarget:
    "solc_14_local_transition_different_sources_same_target.obpt-sts",
  l15LocalTransitionOrSynchronizedTransitionSameTarget:
    "solc_15_local_transition_or_synchronized_transition_same_target.obpt-sts",
  l16SynchronizedTransitionOneClass:
    "solc_16_synchronized_transition_one_class.obpt-sts",
  l17SynchronizedTransitionTwoClasses:
    "solc_17_synchronized_transition_two_classes.obpt-sts",
  l18SynchronizedTransitionDifferentSourcesSameTarget:
    "solc_18_synchronized_transition_different_sources_same_target.obpt-sts",
  l19DecisionViaSynchronizedOrLocalTransition:
    "solc_19_decision_via_synchronized_or_local_transition.obpt-sts",
  l20SynchronizedTransitionOneOfTwoClasses:
    "solc_20_synchronized_transition_one_of_two_classes.obpt-sts",
  l21LocalTransitionLoop: "solc_21_local_transition_loop.obpt-sts",
  l22LocalDecisionSynchronizedLoop:
    "solc_22_local_decision_synchronized_loop.obpt-sts",
  l23InvalidMissingAttributeSignature:
    "solc_23_invalid_missing_attribute_signature.obpt-sts",
} as const;
