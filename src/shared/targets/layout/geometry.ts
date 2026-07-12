export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutPoint {
  x: number;
  y: number;
}

export function centerOf(bounds: LayoutBounds): LayoutPoint {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export function edgePointToward(
  bounds: LayoutBounds,
  otherBounds: LayoutBounds,
): LayoutPoint {
  const center = centerOf(bounds);
  const otherCenter = centerOf(otherBounds);
  const deltaX = otherCenter.x - center.x;
  const deltaY = otherCenter.y - center.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return {
      x: deltaX >= 0 ? bounds.x + bounds.width : bounds.x,
      y: center.y,
    };
  }

  return {
    x: center.x,
    y: deltaY >= 0 ? bounds.y + bounds.height : bounds.y,
  };
}

export function sideAnchorWaypoints(
  sourceBounds: LayoutBounds,
  targetBounds: LayoutBounds,
): [LayoutPoint, LayoutPoint] {
  return [
    edgePointToward(sourceBounds, targetBounds),
    edgePointToward(targetBounds, sourceBounds),
  ];
}
