import { getOrigin } from "./origins.mjs";

export const FAMILY_GROUPS = {
  north: "WITCHER.Family.Groups.North",
  nilfgaard: "WITCHER.Family.Groups.Nilfgaard",
  elder: "WITCHER.Family.Groups.Elder"
};

// Stable rule and document IDs. Rewards remain descriptive until character creation is automated.
const status = (number, group, id, roll, key, equipment = []) => ({
  id: `${group}.${id}`, documentId: `fami${String(number).padStart(12, "0")}`, group, roll,
  label: `WITCHER.Family.${key}.Name`, description: `WITCHER.Family.${key}.Description`,
  reward: `WITCHER.Family.${key}.Reward`, equipment
});

export const FAMILY_STATUSES = [
  status(1, "north", "aristocracy", "1", "NorthAristocracy", ["noble-charter"]),
  status(2, "north", "mage-ward", "2", "MageWard", ["chronicle"]),
  status(3, "north", "knighthood", "3", "NorthKnighthood", ["personal-crest"]),
  status(4, "north", "merchants", "4", "NorthMerchants"),
  status(5, "north", "artisans", "5", "NorthArtisans", ["common-diagram", "common-formula"]),
  status(6, "north", "performers", "6–7", "NorthPerformers", ["musical-instrument"]),
  status(7, "north", "peasants", "8–10", "NorthPeasants", ["lucky-charm"]),
  status(8, "nilfgaard", "aristocracy", "1", "NilfgaardAristocracy", ["noble-charter"]),
  status(9, "nilfgaard", "high-clergy", "2", "HighClergy", ["sacred-symbol"]),
  status(10, "nilfgaard", "knighthood", "3", "NilfgaardKnighthood", ["personal-crest"]),
  status(11, "nilfgaard", "artisans", "4", "NilfgaardArtisans", ["common-diagram", "common-formula"]),
  status(12, "nilfgaard", "merchants", "5", "NilfgaardMerchants"),
  status(13, "nilfgaard", "slavery", "6–7", "Slavery", ["trained-bird", "trained-snake"]),
  status(14, "nilfgaard", "peasants", "8–10", "NilfgaardPeasants", ["lucky-charm"]),
  status(15, "elder", "aristocracy", "1", "ElderAristocracy", ["noble-charter"]),
  status(16, "elder", "noble-warrior", "2", "NobleWarrior", ["personal-crest"]),
  status(17, "elder", "merchants", "3", "ElderMerchants"),
  status(18, "elder", "scribes", "4", "Scribes", ["chronicle"]),
  status(19, "elder", "performers", "5", "ElderPerformers", ["musical-instrument"]),
  status(20, "elder", "artisans", "6–7", "ElderArtisans", ["common-diagram", "common-formula"]),
  status(21, "elder", "low-born", "8–10", "LowBorn", ["lucky-charm"])
];

export const FAMILY_STATUS_CHOICES = Object.fromEntries([
  ["", "WITCHER.Sheet.FamilyStatusUnset"], ...FAMILY_STATUSES.map(entry => [entry.id, entry.label])
]);

export function getFamilyStatus(id) {
  return FAMILY_STATUSES.find(entry => entry.id === id) ?? null;
}

export function getFamilyReward(race, id) {
  return race === "witcher" ? null : getFamilyStatus(id)?.reward ?? null;
}

/** Suggest a table column; the browser still permits a custom background from another column. */
export function suggestedFamilyGroup(race, origin) {
  if (race === "witcher" || !race) return "";
  if (["elf", "dwarf"].includes(race)) return "elder";
  return getOrigin(origin)?.group === "nilfgaard" ? "nilfgaard" : "north";
}
