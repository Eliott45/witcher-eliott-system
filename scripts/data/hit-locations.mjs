export const ATTACK_LOCATIONS = [
  {id:"random",name:"Без прицеливания",penalty:0,multiplier:1},
  {id:"head",name:"Голова",penalty:-6,multiplier:3},
  {id:"torso",name:"Корпус",penalty:-1,multiplier:1},
  {id:"rightArm",name:"Правая рука / конечность",penalty:-3,multiplier:0.5},
  {id:"leftArm",name:"Левая рука / конечность",penalty:-3,multiplier:0.5},
  {id:"rightLeg",name:"Правая нога",penalty:-2,multiplier:0.5},
  {id:"leftLeg",name:"Левая нога",penalty:-2,multiplier:0.5},
  {id:"tail",name:"Хвост / крыло",penalty:-2,multiplier:0.5}
];

/** Shared zone IDs also serve natural armor; their displayed names follow the target. */
export function attackLocation(id, bodyPlan) {
  const location = ATTACK_LOCATIONS.find(entry => entry.id === id);
  if (!location || !bodyPlan) return location;
  const names = bodyPlan === "monster"
    ? {rightArm:"Правая конечность",leftArm:"Левая конечность",rightLeg:"Правая конечность",leftLeg:"Левая конечность"}
    : {rightArm:"Правая рука",leftArm:"Левая рука"};
  return names[id] ? {...location,name:names[id]} : location;
}

/** Humanoid or monster hit-location table for a target actor. */
export const bodyPlanOf = actor => actor?.type === "npc" && actor.system.creature?.category !== "humanoid" ? "monster" : "humanoid";

export function hitLocation(result, bodyPlan = "humanoid", {hasTailOrWings = true} = {}) {
  if (!Number.isInteger(result) || result < 1 || result > 10 || !["humanoid", "monster"].includes(bodyPlan)) throw new Error("Неизвестная зона попадания.");
  const table = bodyPlan === "humanoid" ? ["head","torso","torso","torso","rightArm","leftArm","rightLeg","rightLeg","leftLeg","leftLeg"]
    : ["head","torso","torso","torso","torso","rightArm","rightArm","leftArm","leftArm",hasTailOrWings ? "tail" : "leftArm"];
  return attackLocation(table[result - 1], bodyPlan);
}
