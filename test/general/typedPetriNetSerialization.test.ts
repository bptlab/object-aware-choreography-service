import assert from "node:assert";
import { describe, it } from "node:test";
import {
  computeTypedPetriNetLayout,
  serializeTypedPetriNet,
  TypedPetriNetBuilder,
} from "../../src/shared/targets/typedPetriNet/index.js";
import { centerOf } from "../../src/shared/targets/layout/geometry.js";
import type {
  TypedBounds,
  TypedPetriNet,
  TypedPoint,
} from "../../src/shared/targets/typedPetriNet/index.js";
import { writeScenarioResult } from "../../src/shared/testing/resultWriter.js";

describe("Typed Petri-Net Serialization", () => {
  it("TPNS-01P serializes typed inhibitor net constructs", async () => {
    const builder = new TypedPetriNetBuilder("model_1", "Typed test model");
    const orderType = builder.addIdentifierType({
      id: "Order",
      name: "Order",
      alias: "O",
    });
    const invoiceType = builder.addIdentifierType({
      id: "Invoice",
      name: "Invoice",
      alias: "I",
    });

    const orderVariable = builder.addVariable({
      id: "o",
      typeId: orderType.id,
    });
    const invoiceVariable = builder.addVariable({
      id: "i",
      typeId: invoiceType.id,
    });

    const source = builder.addPlace({
      id: "order-source",
      name: "order source",
      tupleType: [orderType.id],
      initialTokens: [[{ typeId: orderType.id, value: "Order_1" }]],
    });
    const target = builder.addPlace({
      id: "order-invoice-target",
      name: "order invoice target",
      tupleType: [orderType.id, invoiceType.id],
    });
    const blocked = builder.addPlace({
      id: "blocked-orders",
      name: "blocked orders",
      tupleType: [orderType.id],
      initialTokens: [[{ typeId: orderType.id, value: "Order_2" }]],
    });

    const createInvoice = builder.addTransition({
      id: "create-invoice",
      name: "create invoice",
      freshVariables: [
        { variableId: invoiceVariable.id, typeId: invoiceType.id },
      ],
    });

    builder.addOrdinaryArc({
      sourceId: source.id,
      targetId: createInvoice.id,
      inscription: [
        {
          typeId: orderType.id,
          variableId: orderVariable.id,
          isGenerated: false,
        },
      ],
    });
    builder.addOrdinaryArc({
      sourceId: createInvoice.id,
      targetId: target.id,
      inscription: [
        {
          typeId: orderType.id,
          variableId: orderVariable.id,
          isGenerated: false,
        },
        {
          typeId: invoiceType.id,
          variableId: invoiceVariable.id,
          isGenerated: true,
        },
      ],
    });
    builder.addInhibitorArc({
      sourceId: blocked.id,
      targetId: createInvoice.id,
      inscription: [
        {
          typeId: orderType.id,
          variableId: orderVariable.id,
          isGenerated: false,
        },
      ],
    });

    const net = builder.toTypedPetriNet();
    const serialized = serializeTypedPetriNet(net);
    assert.equal(serializeTypedPetriNet(net), serialized);

    assert.match(serialized, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(
      serialized,
      /<tpn:definitions[^>]+xmlns:tpn="http:\/\/bpt-lab\.org\/schemas\/tpn"/,
    );
    assert.match(
      serialized,
      new RegExp(
        `<tpn:dataClass id="${orderType.id}" name="Order" alias="O" valueType="ID" />`,
      ),
    );
    assert.match(
      serialized,
      new RegExp(
        `<tpn:dataClass id="${invoiceType.id}" name="Invoice" alias="I" valueType="ID" />`,
      ),
    );
    assert.match(
      serialized,
      new RegExp(
        `<tpn:place id="${target.id}" name="order invoice target" color="${orderType.id} ${invoiceType.id}" type="tpn:Place" />`,
      ),
    );
    assert.match(
      serialized,
      /<tpn:tokenValue id="Place_order_source_token_1_value_1" dataClass="DataClass_Order" value="Order_1" \/>/,
    );
    assert.match(
      serialized,
      new RegExp(
        `<tpn:transition id="${createInvoice.id}" name="create invoice" type="tpn:Transition" />`,
      ),
    );
    assert.match(
      serialized,
      /<tpn:arc id="Arc_Place_order_source_to_Transition_create_invoice" source="Place_order_source" target="Transition_create_invoice" type="tpn:Arc">/,
    );
    assert.match(
      serialized,
      /<tpn:arc id="Arc_Place_blocked_orders_to_Transition_create_invoice" source="Place_blocked_orders" target="Transition_create_invoice" isInhibitorArc="true" type="tpn:Arc">/,
    );
    assert.match(
      serialized,
      /<tpn:inscriptionElement id="Arc_Transition_create_invoice_to_Place_order_invoice_target_inscriptionElement_2" dataClass="DataClass_Invoice" variableName="i" isGenerated="true" \/>/,
    );
    assert.match(
      serialized,
      /<tpnDi:diagram id="model_1_di"><tpnDi:plane id="model_1_plane" modelElement="model_1">/,
    );

    const shapeMatches = [
      ...serialized.matchAll(
        /<tpnDi:diagramShape id="([^"]+)" modelElement="([^"]+)">([\s\S]*?)<\/tpnDi:diagramShape>/g,
      ),
    ];
    assert.equal(
      shapeMatches.length,
      net.places.length + net.transitions.length,
    );
    assert.deepEqual(
      shapeMatches.map((match) => match[2]).sort(),
      [
        ...net.places.map((place) => place.id),
        ...net.transitions.map((transition) => transition.id),
      ].sort(),
    );

    for (const match of shapeMatches) {
      assert.match(
        match[3],
        /<dc:Bounds x="-?\d+(?:\.\d+)?" y="-?\d+(?:\.\d+)?" width="50" height="50" \/>/,
      );
    }

    assert.match(
      serialized,
      /<tpnDi:diagramShape id="Place_order_source_di" modelElement="Place_order_source"><dc:Bounds x="0" y="0" width="50" height="50" \/><tpnDi:diagramLabel><dc:Bounds x="-17" y="57" width="84" height="16" \/><\/tpnDi:diagramLabel><\/tpnDi:diagramShape>/,
    );
    assert.match(
      serialized,
      /<tpnDi:diagramShape id="Transition_create_invoice_di" modelElement="Transition_create_invoice"><dc:Bounds x="0" y="110" width="50" height="50" \/><\/tpnDi:diagramShape>/,
    );

    const edgeMatches = [
      ...serialized.matchAll(
        /<tpnDi:diagramEdge id="([^"]+)" modelElement="([^"]+)">([\s\S]*?)<\/tpnDi:diagramEdge>/g,
      ),
    ];
    assert.equal(edgeMatches.length, net.arcs.length);
    assert.deepEqual(
      edgeMatches.map((match) => match[2]).sort(),
      net.arcs.map((arc) => arc.id).sort(),
    );

    for (const match of edgeMatches) {
      const waypointMatches = [
        ...match[3].matchAll(
          /<tpnDi:waypoint x="(-?\d+(?:\.\d+)?)" y="(-?\d+(?:\.\d+)?)" \/>/g,
        ),
      ];
      assert.equal(waypointMatches.length, 2);
      assert.match(match[3], /<tpnDi:diagramLabel><dc:Bounds /);
    }

    assert.match(
      serialized,
      /<tpnDi:diagramEdge id="Arc_Place_order_source_to_Transition_create_invoice_di" modelElement="Arc_Place_order_source_to_Transition_create_invoice"><tpnDi:waypoint x="25" y="50" \/><tpnDi:waypoint x="25" y="110" \/>/,
    );

    const customLayout = serializeTypedPetriNet(net, {
      layout: {
        nodeBoundsById: {
          [source.id]: { x: 10, y: 20, width: 50, height: 50 },
        },
        edgeWaypointsByArcId: {
          [net.arcs[0].id]: [
            { x: 35, y: 45 },
            { x: 100, y: 45 },
          ],
        },
      },
    });
    assert.match(
      customLayout,
      /<tpnDi:diagramShape id="Place_order_source_di" modelElement="Place_order_source"><dc:Bounds x="10" y="20" width="50" height="50" \/>/,
    );
    assert.match(
      customLayout,
      /<tpnDi:diagramEdge id="Arc_Place_order_source_to_Transition_create_invoice_di" modelElement="Arc_Place_order_source_to_Transition_create_invoice"><tpnDi:waypoint x="35" y="45" \/><tpnDi:waypoint x="100" y="45" \/>/,
    );

    await writeScenarioResult({
      subdirectory: "general",
      resultDirectory: "typedPetriNetGeneration",
      scenarioName: "typedPetriNetSerializationTest",
      content: serialized,
      fileExtension: "obpt-typed-pn",
    });
  });

  it("TPNS-02N rejects duplicate builder IDs", () => {
    const builder = new TypedPetriNetBuilder();
    const type = builder.addIdentifierType({ id: "Order" });
    const variable = builder.addVariable({ id: "o", typeId: type.id });
    const place = builder.addPlace({ id: "p", tupleType: [type.id] });
    const transition = builder.addTransition({ id: "t" });
    builder.addOrdinaryArc({
      id: "a",
      sourceId: place.id,
      targetId: transition.id,
      inscription: [
        {
          typeId: type.id,
          variableId: variable.id,
          isGenerated: false,
        },
      ],
    });

    assert.throws(
      () => builder.addIdentifierType({ id: "Order" }),
      /Duplicate typed Petri-net identifier type DataClass_Order/,
    );
    assert.throws(
      () => builder.addPlace({ id: "p", tupleType: [type.id] }),
      /Duplicate typed Petri-net place Place_p/,
    );
    assert.throws(
      () => builder.addTransition({ id: "t" }),
      /Duplicate typed Petri-net transition Transition_t/,
    );
    assert.throws(
      () =>
        builder.addOrdinaryArc({
          id: "a",
          sourceId: place.id,
          targetId: transition.id,
          inscription: [
            {
              typeId: type.id,
              variableId: variable.id,
              isGenerated: false,
            },
          ],
        }),
      /Duplicate typed Petri-net arc Arc_a/,
    );
  });

  it("TPNS-03P computes side-anchor edge waypoints from explicit bounds", () => {
    assertSideAnchor({
      sourceBounds: { x: 0, y: 0, width: 50, height: 50 },
      targetBounds: { x: 130, y: 0, width: 50, height: 50 },
      expectedWaypoints: [
        { x: 50, y: 25 },
        { x: 130, y: 25 },
      ],
    });
    assertSideAnchor({
      sourceBounds: { x: 130, y: 0, width: 50, height: 50 },
      targetBounds: { x: 0, y: 0, width: 50, height: 50 },
      expectedWaypoints: [
        { x: 130, y: 25 },
        { x: 50, y: 25 },
      ],
    });
    assertSideAnchor({
      sourceBounds: { x: 0, y: 0, width: 50, height: 50 },
      targetBounds: { x: 0, y: 110, width: 50, height: 50 },
      expectedWaypoints: [
        { x: 25, y: 50 },
        { x: 25, y: 110 },
      ],
    });
    assertSideAnchor({
      sourceBounds: { x: 0, y: 110, width: 50, height: 50 },
      targetBounds: { x: 0, y: 0, width: 50, height: 50 },
      expectedWaypoints: [
        { x: 25, y: 110 },
        { x: 25, y: 50 },
      ],
    });
  });
});

function assertSideAnchor(args: {
  sourceBounds: TypedBounds;
  targetBounds: TypedBounds;
  expectedWaypoints: [TypedPoint, TypedPoint];
}): void {
  const { net, sourceId, targetId, arcId } = buildSingleArcNet();
  const layout = computeTypedPetriNetLayout(net, {
    nodeBoundsById: {
      [sourceId]: args.sourceBounds,
      [targetId]: args.targetBounds,
    },
  });
  const waypoints = layout.edgeWaypointsByArcId.get(arcId);

  assert.deepEqual(waypoints, args.expectedWaypoints);
  assert.notDeepEqual(waypoints?.[0], centerOf(args.sourceBounds));
  assert.notDeepEqual(waypoints?.[1], centerOf(args.targetBounds));
}

function buildSingleArcNet(): {
  net: TypedPetriNet;
  sourceId: string;
  targetId: string;
  arcId: string;
} {
  const builder = new TypedPetriNetBuilder();
  const type = builder.addIdentifierType({ id: "Order" });
  const variable = builder.addVariable({ id: "o", typeId: type.id });
  const source = builder.addPlace({ id: "source", tupleType: [type.id] });
  const target = builder.addTransition({ id: "target" });
  const arc = builder.addOrdinaryArc({
    sourceId: source.id,
    targetId: target.id,
    inscription: [
      {
        typeId: type.id,
        variableId: variable.id,
        isGenerated: false,
      },
    ],
  });

  return {
    net: builder.toTypedPetriNet(),
    sourceId: source.id,
    targetId: target.id,
    arcId: arc.id,
  };
}
