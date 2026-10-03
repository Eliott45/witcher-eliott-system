// Generic starting equipment named in the supplied family table. No descriptions or effects yet.
export const EQUIPMENT = [
  { id: "noble-charter", documentId: "gear000000000001", label: "WITCHER.Equipment.NobleCharter" },
  { id: "chronicle", documentId: "gear000000000002", label: "WITCHER.Equipment.Chronicle" },
  { id: "personal-crest", documentId: "gear000000000003", label: "WITCHER.Equipment.PersonalCrest" },
  { id: "common-diagram", documentId: "gear000000000004", label: "WITCHER.Equipment.CommonDiagram" },
  { id: "common-formula", documentId: "gear000000000005", label: "WITCHER.Equipment.CommonFormula" },
  { id: "musical-instrument", documentId: "gear000000000006", label: "WITCHER.Equipment.MusicalInstrument" },
  { id: "lucky-charm", documentId: "gear000000000007", label: "WITCHER.Equipment.LuckyCharm" },
  { id: "sacred-symbol", documentId: "gear000000000008", label: "WITCHER.Equipment.SacredSymbol" },
  { id: "trained-bird", documentId: "gear000000000009", label: "WITCHER.Equipment.TrainedBird" },
  { id: "trained-snake", documentId: "gear000000000010", label: "WITCHER.Equipment.TrainedSnake" }
];

export function getEquipment(id) {
  return EQUIPMENT.find(entry => entry.id === id) ?? null;
}
