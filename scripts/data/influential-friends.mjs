// A descriptive, optional part of the lifepath; it grants no automated bonuses or items.
const friend = (number, group, id, roll, key, equipment) => ({
  id: `${group}.${id}`, documentId: `infl${String(number).padStart(12, "0")}`, group, roll: String(roll),
  label: `WITCHER.Friends.${key}.Name`, description: `WITCHER.Friends.${key}.Description`,
  equipment
});

export const INFLUENTIAL_FRIENDS = [
  friend(1, "north", "church", 1, "Church", ["sacred-text"]),
  friend(2, "north", "artisan", 2, "NorthArtisan", ["handmade-souvenir"]),
  friend(3, "north", "count", 3, "NorthCount", ["silver-ring"]),
  friend(4, "north", "mage", 4, "NorthMage", ["pendant"]),
  friend(5, "north", "witch", 5, "Witch", ["black-magic-doll"]),
  friend(6, "north", "cursed", 6, "Cursed", ["carved-totem"]),
  friend(7, "north", "performer", 7, "NorthPerformer", ["poster", "ticket"]),
  friend(8, "north", "merchant", 8, "Merchant", ["earned-coin"]),
  friend(9, "north", "criminal", 9, "NorthCriminal", ["mask"]),
  friend(10, "north", "warrior", 10, "NorthWarrior", ["battle-trophy"]),
  friend(11, "nilfgaard", "great-sun", 1, "GreatSun", ["ceremonial-mask"]),
  friend(12, "nilfgaard", "exile", 2, "Exile", ["colorful-badge"]),
  friend(13, "nilfgaard", "count", 3, "NilfgaardCount", ["silver-necklace"]),
  friend(14, "nilfgaard", "mage", 4, "NilfgaardMage", ["emblem"]),
  friend(15, "nilfgaard", "investigator", 5, "Investigator", ["magnifying-glass"]),
  friend(16, "nilfgaard", "mage-hunter", 6, "MageHunter", ["dimeritium-ring"]),
  friend(17, "nilfgaard", "warrior", 7, "NilfgaardWarrior", ["battle-trophy"]),
  friend(18, "nilfgaard", "artisan", 8, "NilfgaardArtisan", ["handmade-trinket"]),
  friend(19, "nilfgaard", "sentient-monster", 9, "SentientMonster", ["strange-totem"]),
  friend(20, "nilfgaard", "performer", 10, "NilfgaardPerformer", ["admirer-gift"]),
  friend(21, "elder", "human", 1, "Human", ["straw-doll"]),
  friend(22, "elder", "artisan", 2, "ElderArtisan", ["small-handmade-souvenir"]),
  friend(23, "elder", "noble-warrior", 3, "NobleWarrior", ["battle-keepsake"]),
  friend(24, "elder", "high-born", 4, "HighBorn", ["signet-ring"]),
  friend(25, "elder", "performer", 5, "ElderPerformer", ["poster", "ticket"]),
  friend(26, "elder", "raider", 6, "Raider", ["shoulder-bag"]),
  friend(27, "elder", "sage", 7, "Sage", ["storybook"]),
  friend(28, "elder", "criminal", 8, "ElderCriminal", ["mask"]),
  friend(29, "elder", "hunter", 9, "Hunter", ["hunting-trophy"]),
  friend(30, "elder", "peasant", 10, "Peasant", ["peasant-shovel"])
];

export const INFLUENTIAL_FRIEND_CHOICES = Object.fromEntries([
  ["", "WITCHER.Sheet.FriendUnset"], ...INFLUENTIAL_FRIENDS.map(entry => [entry.id, entry.label])
]);

export function getInfluentialFriend(id) {
  return INFLUENTIAL_FRIENDS.find(entry => entry.id === id) ?? null;
}
