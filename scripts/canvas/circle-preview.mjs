/** Local placement overlay. It never creates scene documents and disappears on cancellation. */
export function circlePreview(scene, center, radiusMeters) {
  const stage = canvas.stage, shape = new PIXI.Graphics();
  shape.eventMode = "none";
  const radius = radiusMeters / scene.grid.distance * scene.grid.size;
  shape.lineStyle(2, 0xe4c78d, .95).beginFill(0xb6a275, .25).drawCircle(0, 0, radius).endFill();
  shape.lineStyle(1, 0xffffff, .9).moveTo(-7, 0).lineTo(7, 0).moveTo(0, -7).lineTo(0, 7);
  shape.position.set(center.x, center.y);
  stage.addChild(shape);
  const move = event => { const point = event.getLocalPosition(stage); shape.position.set(point.x, point.y); };
  stage.on("pointermove", move);
  return () => { stage.off("pointermove", move); stage.removeChild(shape); shape.destroy(); };
}
