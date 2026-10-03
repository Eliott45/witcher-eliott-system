export const EQUIPMENT_FOLDERS = {
  family: { id: "gearFolderFamily", label: "WITCHER.EquipmentSources.Family" },
  friend: { id: "gearFolderFriend", label: "WITCHER.EquipmentSources.Friend" }
};

// Keep existing document IDs: the family reference links must survive categorization.
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
].map(entry => ({ ...entry, source: "family", description: `${entry.label}Description` }));

const gift = (number, id, key) => ({
  id, documentId: `gear${String(number).padStart(12, "0")}`, source: "friend",
  label: `WITCHER.FriendEquipment.${key}`
});

EQUIPMENT.push(
  gift(11, "sacred-text", "SacredText"),
  gift(12, "handmade-souvenir", "HandmadeSouvenir"),
  gift(13, "silver-ring", "SilverRing"),
  gift(14, "pendant", "Pendant"),
  gift(15, "black-magic-doll", "BlackMagicDoll"),
  gift(16, "carved-totem", "CarvedTotem"),
  gift(17, "poster", "Poster"),
  gift(18, "ticket", "Ticket"),
  gift(19, "earned-coin", "EarnedCoin"),
  gift(20, "mask", "Mask"),
  gift(21, "battle-trophy", "BattleTrophy"),
  gift(22, "ceremonial-mask", "CeremonialMask"),
  gift(23, "colorful-badge", "ColorfulBadge"),
  gift(24, "silver-necklace", "SilverNecklace"),
  gift(25, "emblem", "Emblem"),
  gift(26, "magnifying-glass", "MagnifyingGlass"),
  gift(27, "dimeritium-ring", "DimeritiumRing"),
  gift(28, "handmade-trinket", "HandmadeTrinket"),
  gift(29, "strange-totem", "StrangeTotem"),
  gift(30, "admirer-gift", "AdmirerGift"),
  gift(31, "straw-doll", "StrawDoll"),
  gift(32, "small-handmade-souvenir", "SmallHandmadeSouvenir"),
  gift(33, "battle-keepsake", "BattleKeepsake"),
  gift(34, "signet-ring", "SignetRing"),
  gift(35, "shoulder-bag", "ShoulderBag"),
  gift(36, "storybook", "Storybook"),
  gift(37, "hunting-trophy", "HuntingTrophy"),
  gift(38, "peasant-shovel", "PeasantShovel")
);

export function getEquipment(id) {
  return EQUIPMENT.find(entry => entry.id === id) ?? null;
}
