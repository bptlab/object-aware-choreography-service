import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeIdPart } from "../../src/shared/ids/sanitization.js";
import {
  combinedReceiveTransitionId,
  combinedSendTransitionId,
  compositeOneToOneCreationTransitionId,
  communicationReceiveTransitionId,
  communicationSendTransitionId,
  localLifecycleTransitionId,
  statePlaceId,
  transitionIdForExclusiveJoin,
  transitionIdForExclusiveSplit,
  transitionIdForParallelGateway,
} from "../../src/shared/targets/petriNet/ids.js";
import {
  attributeParameterName,
  bsplMessageName,
} from "../../src/shared/mappings/objectAwareChoreographyToBspl/parameterMapping.js";

describe("Generated ID Sanitization", () => {
  it("GIDS-01P sanitizes semantic ID parts without underscores", () => {
    assert.equal(sanitizeIdPart("a_x"), "a-x");
    assert.equal(sanitizeIdPart("a x"), "a-x");
    assert.equal(sanitizeIdPart("a/x"), "a-x");
  });

  it("GIDS-02P keeps Petri-net local transition structural delimiters", () => {
    assert.equal(
      localLifecycleTransitionId("RoleA", "ClassA", "initial", "a_x"),
      "t_local_RoleA_ClassA_initial_a-x",
    );
  });

  it("GIDS-03P keeps Petri-net state-place structural delimiters", () => {
    assert.equal(
      statePlaceId("RoleA", "ClassA", "a_x"),
      "p_state_RoleA_ClassA_a-x",
    );
  });

  it("GIDS-04P keeps composite creation entry and list delimiters stable", () => {
    const leftFirst = compositeOneToOneCreationTransitionId("RoleA", [
      { classId: "Class_B", targetStateId: "b_x" },
      { classId: "Class_A", targetStateId: "a_x" },
    ]);
    const rightFirst = compositeOneToOneCreationTransitionId("RoleA", [
      { classId: "Class_A", targetStateId: "a_x" },
      { classId: "Class_B", targetStateId: "b_x" },
    ]);

    assert.equal(leftFirst, rightFirst);
    assert.equal(
      leftFirst,
      "t_create_1to1_RoleA_Class-A_a-x__Class-B_b-x",
    );
  });

  it("GIDS-05P uses explicit Petri-net gateway transition prefixes", () => {
    const gateway = { id: "Gateway_1arwctf" };
    const task = { id: "ChoreographyTask_14itcau" };

    assert.equal(
      transitionIdForExclusiveSplit(gateway as never, task as never, {
        classId: "Class_A",
        stateId: "a_x",
      }),
      "t_xor_Gateway-1arwctf_ChoreographyTask-14itcau_Class-A_a-x",
    );
    assert.equal(
      transitionIdForExclusiveJoin(task as never, gateway as never),
      "t_xor_ChoreographyTask-14itcau_Gateway-1arwctf",
    );
    assert.equal(
      transitionIdForParallelGateway(gateway as never),
      "t_parallel_Gateway-1arwctf",
    );
  });

  it("GIDS-06P includes communicated object details in Petri-net communication IDs", () => {
    assert.equal(
      communicationSendTransitionId(
        "ChoreographyTask_14itcau",
        "Class_A",
        "a_x",
      ),
      "t_send_ChoreographyTask-14itcau_Class-A_a-x",
    );
    assert.equal(
      communicationReceiveTransitionId(
        "ChoreographyTask_14itcau",
        "Class_A",
        "initial",
        "a_x",
      ),
      "t_recv_ChoreographyTask-14itcau_Class-A_initial_a-x",
    );
  });

  it("GIDS-07P prefixes combined communication IDs with communicated object details", () => {
    const sourceCombination = new Map([
      ["Class_B", "b_x"],
      ["Class_A", "a_x"],
    ]);

    assert.equal(
      combinedSendTransitionId(
        "ChoreographyTask_14itcau",
        "Class_B",
        "b_x",
        sourceCombination,
      ),
      "t_comb_send_ChoreographyTask-14itcau_Class-B_b-x_Class-A_a-x__Class-B_b-x",
    );
    assert.equal(
      combinedReceiveTransitionId(
        "ChoreographyTask_14itcau",
        "Class_B",
        "b_x",
        "initial",
        "b_y",
        sourceCombination,
      ),
      "t_comb_recv_ChoreographyTask-14itcau_Class-B_b-x_initial_b-y_Class-A_a-x__Class-B_b-x",
    );
  });

  it("GIDS-08P sanitizes BSPL semantic parts without raw underscores", () => {
    assert.equal(
      attributeParameterName({
        className: "Class A",
        attributeName: "a_id",
      }),
      "attribute_class-a_a-id",
    );
  });

  it("GIDS-09P sanitizes BSPL task message labels consistently", () => {
    assert.equal(bsplMessageName("place order"), "place-order");
    assert.equal(bsplMessageName("request shipment 1"), "request-shipment-1");
  });
});
