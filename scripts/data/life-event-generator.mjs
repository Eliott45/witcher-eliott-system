import { LIFE_EVENTS, ALLY_OCCUPATIONS, ALLY_MEETINGS, ALLY_CLOSENESS, ALLY_REGIONS, ENEMY_OCCUPATIONS, ENEMY_CAUSES, ENEMY_PURSUIT, ENEMY_POWER } from "./life-events.mjs";

const band = (roll, thresholds) => thresholds.findIndex(limit => roll <= limit);
/** Independent native d10 draws; caller posts rolls and lets the player fill in names/choices. */
export async function generateLifeEvent(age, draw) {
  const pick = async rows => rows[(await draw(10)) - 1];
  const event = { age, notes: "" }, main = await draw(10);
  if (main <= 4) {
    event.kind = (await draw(10)) % 2 === 0 ? "fortune" : "misfortune";
    const detail = event[event.kind] = { result: (await pick(LIFE_EVENTS[event.kind])).id };
    if (event.kind === "fortune") {
      if (detail.result === "money") detail.amount = await draw(10) * 100;
      if (["teacher", "instructor"].includes(detail.result)) detail.skillBonus = 1;
      if (detail.result === "animal") detail.animal = (await draw(10)) <= 7 ? "Дикая собака" : "Волк";
    } else {
      if (detail.result === "debt") detail.amount = await draw(10) * 100;
      if (detail.result === "prison") detail.months = await draw(10);
      const bands = { loss: [5, 8, 10], accusation: [3, 5, 8, 9, 10], wanted: [3, 6, 8, 10], betrayal: [3, 7, 10], accident: [4, 6, 8, 10], trauma: [3, 7, 10] };
      if (bands[detail.result]) detail[detail.result] = LIFE_EVENTS[detail.result][band(await draw(10), bands[detail.result])].id;
      if (["healing", "amnesia"].includes(detail.accident)) detail.months = await draw(10);
    }
  } else if (main <= 7) {
    event.kind = (await draw(10)) % 2 === 0 ? "ally" : "enemy";
    const person = event[event.kind] = { gender: (await draw(10)) % 2 === 0 ? "Женщина" : "Мужчина" };
    if (event.kind === "ally") {
      person.occupation = await pick(ALLY_OCCUPATIONS); person.meeting = await pick(ALLY_MEETINGS);
      person.closeness = ALLY_CLOSENESS[band(await draw(10), [3, 6, 8, 9, 10])];
      person.region = ALLY_REGIONS[band(await draw(10), [3, 6, 9, 10])];
    } else {
      person.occupation = await pick(ENEMY_OCCUPATIONS); person.cause = await pick(ENEMY_CAUSES);
      person.injured = (await draw(10)) % 2 === 0 ? "Персонаж" : "Враг";
      person.strength = await draw(10); person.pursuit = ENEMY_PURSUIT[band(await draw(10), [2, 4, 6, 8, 10])];
      person.power = ENEMY_POWER[band(await draw(10), [2, 4, 6, 8, 10])];
    }
  } else {
    event.kind = "romance";
    const romance = event.romance = { result: LIFE_EVENTS.romance[band(await draw(10), [1, 4, 6, 10])].id };
    if (romance.result === "happy") romance.status = "Продолжаются";
    if (romance.result === "tragic") romance.tragedy = (await pick(LIFE_EVENTS.tragic)).id;
    if (romance.result === "difficult") romance.difficulty = (await pick(LIFE_EVENTS.difficult)).id;
  }
  return event;
}
