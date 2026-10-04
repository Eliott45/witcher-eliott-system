/** Vehicles and mounts are physical Items with their own container tree, not copied Actor inventories. */
export const isTransport = item => item?.type === "equipment" && item.system.kind === "transport";
export const isMount = item => isTransport(item) && item.system.transport?.type === "mount";
export const TRANSPORT_TYPES = [{id:"mount",name:"Животное"},{id:"wagon",name:"Повозка / карета"},{id:"boat",name:"Судно"}];
export const TACK_SLOTS = [{id:"saddle",name:"Седло",icon:"fa-horse"},{id:"bags",name:"Седельные сумки",icon:"fa-bag-shopping"},{id:"barding",name:"Конский доспех",icon:"fa-shield-halved"},{id:"spurs",name:"Шпоры",icon:"fa-shoe-prints"}];
export function canHitch(vehicle, mount, items) {
  return isTransport(vehicle) && vehicle.system.transport.type === "wagon" && (!mount || isMount(mount)
    && mount.system.quantity > 0 && !Array.from(items).some(other => other.id !== vehicle.id && isTransport(other) && other.system.transport.mountId === mount.id));
}
export function transportSpeed(item, items) {
  const data=item.system.transport;
  const saddleBonus=mount=>Array.from(items).filter(gear=>gear.system.containerId===mount.id&&gear.system.equipped&&gear.system.tack?.slot==="saddle").reduce((sum,gear)=>sum+(gear.system.tack.speedBonus??0),0);
  if(data.type==="wagon") {
    const mount=Array.from(items).find(mount=>mount.id===data.mountId&&isMount(mount));
    return mount?Math.max(0,mount.system.transport.speed+saddleBonus(mount)+data.speedModifier):null;
  }
  return data.speed+(isMount(item)?saddleBonus(item):0);
}
export function cargoSections(item) {
  if (!(item.system.tack?.compartments > 1)) return [];
  return [{id:"left",name:"Левая сумка",capacity:item.system.capacity/2,slots:0},{id:"right",name:"Правая сумка",capacity:item.system.capacity/2,slots:0},
    ...(item.system.tack.externalSlots>0?[{id:"outside",name:"Наружные крепления",capacity:0,slots:item.system.tack.externalSlots}]:[])];
}
export function cargoSection(item, parent) {
  const sections=cargoSections(parent);
  return sections.find(section=>section.id===item.system.containerSection)?.id ?? sections[0]?.id ?? "";
}
