import { SYSTEM_ID } from "../config.mjs";
import { getOrigin } from "./origins.mjs";
import { getFamilyStatus } from "./family-statuses.mjs";
import { getEquipment } from "./equipment.mjs";
import { getInfluentialFriend } from "./influential-friends.mjs";

// Never renumber these IDs: actor links and compendium references must survive updates.
export const RACE_DOCUMENT_IDS = {
  human: "race000000000001",
  elf: "race000000000002",
  dwarf: "race000000000003",
  witcher: "race000000000004"
};

export const ABILITY_DOCUMENT_IDS = {
  "human.trust": "abil000000000001",
  "human.ingenuity": "abil000000000002",
  "human.stubbornness": "abil000000000003",
  "elf.artistic-talent": "abil000000000004",
  "elf.marksman": "abil000000000005",
  "elf.one-with-nature": "abil000000000006",
  "dwarf.tough": "abil000000000007",
  "dwarf.strong": "abil000000000008",
  "dwarf.shrewd": "abil000000000009",
  "witcher.enhanced-senses": "abil000000000010",
  "witcher.mutant-resilience": "abil000000000011",
  "witcher.dulled-emotions": "abil000000000012",
  "witcher.lightning-reflexes": "abil000000000013"
};

export function raceUuid(id) {
  const documentId = RACE_DOCUMENT_IDS[id];
  return documentId ? `Compendium.${SYSTEM_ID}.races.Item.${documentId}` : null;
}

export function abilityUuid(id) {
  const documentId = ABILITY_DOCUMENT_IDS[id];
  return documentId ? `Compendium.${SYSTEM_ID}.abilities.Item.${documentId}` : null;
}

export function originUuid(id) {
  const documentId = getOrigin(id)?.documentId;
  return documentId ? `Compendium.${SYSTEM_ID}.origins.Item.${documentId}` : null;
}

export function familyStatusUuid(id) {
  const documentId = getFamilyStatus(id)?.documentId;
  return documentId ? `Compendium.${SYSTEM_ID}.family-statuses.Item.${documentId}` : null;
}

export function equipmentUuid(id) {
  const documentId = getEquipment(id)?.documentId;
  return documentId ? `Compendium.${SYSTEM_ID}.equipment.Item.${documentId}` : null;
}

export function influentialFriendUuid(id) {
  const documentId = getInfluentialFriend(id)?.documentId;
  return documentId ? `Compendium.${SYSTEM_ID}.influential-friends.Item.${documentId}` : null;
}
