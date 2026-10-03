export const ORIGIN_GROUPS = {
  north: "WITCHER.Origins.Groups.North",
  nilfgaard: "WITCHER.Origins.Groups.Nilfgaard",
  elder: "WITCHER.Origins.Groups.Elder"
};

// Descriptions from the supplied reference. No skill modifiers are applied yet.
export const ORIGINS = [
  { id: "redania", documentId: "orig000000000001", group: "north", label: "WITCHER.Origins.Redania.Name", bonus: "WITCHER.Origins.Redania.Bonus" },
  { id: "kaedwen", documentId: "orig000000000002", group: "north", label: "WITCHER.Origins.Kaedwen.Name", bonus: "WITCHER.Origins.Kaedwen.Bonus" },
  { id: "temeria", documentId: "orig000000000003", group: "north", label: "WITCHER.Origins.Temeria.Name", bonus: "WITCHER.Origins.Temeria.Bonus" },
  { id: "aedirn", documentId: "orig000000000004", group: "north", label: "WITCHER.Origins.Aedirn.Name", bonus: "WITCHER.Origins.Aedirn.Bonus" },
  { id: "lyria-rivia", documentId: "orig000000000005", group: "north", label: "WITCHER.Origins.LyriaRivia.Name", bonus: "WITCHER.Origins.LyriaRivia.Bonus" },
  { id: "kovir-poviss", documentId: "orig000000000006", group: "north", label: "WITCHER.Origins.KovirPoviss.Name", bonus: "WITCHER.Origins.KovirPoviss.Bonus" },
  { id: "skellige", documentId: "orig000000000007", group: "north", label: "WITCHER.Origins.Skellige.Name", bonus: "WITCHER.Origins.Skellige.Bonus" },
  { id: "cidaris", documentId: "orig000000000008", group: "north", label: "WITCHER.Origins.Cidaris.Name", bonus: "WITCHER.Origins.Cidaris.Bonus" },
  { id: "verden", documentId: "orig000000000009", group: "north", label: "WITCHER.Origins.Verden.Name", bonus: "WITCHER.Origins.Verden.Bonus" },
  { id: "cintra", documentId: "orig000000000010", group: "north", label: "WITCHER.Origins.Cintra.Name", bonus: "WITCHER.Origins.Cintra.Bonus" },
  { id: "nilfgaard-heartland", documentId: "orig000000000011", group: "nilfgaard", label: "WITCHER.Origins.NilfgaardHeartland.Name", bonus: "WITCHER.Origins.NilfgaardHeartland.Bonus" },
  { id: "vicovaro", documentId: "orig000000000012", group: "nilfgaard", label: "WITCHER.Origins.Vicovaro.Name", bonus: "WITCHER.Origins.Vicovaro.Bonus" },
  { id: "angren", documentId: "orig000000000013", group: "nilfgaard", label: "WITCHER.Origins.Angren.Name", bonus: "WITCHER.Origins.Angren.Bonus" },
  { id: "nazair", documentId: "orig000000000014", group: "nilfgaard", label: "WITCHER.Origins.Nazair.Name", bonus: "WITCHER.Origins.Nazair.Bonus" },
  { id: "metinna", documentId: "orig000000000015", group: "nilfgaard", label: "WITCHER.Origins.Metinna.Name", bonus: "WITCHER.Origins.Metinna.Bonus" },
  { id: "mag-turga", documentId: "orig000000000016", group: "nilfgaard", label: "WITCHER.Origins.MagTurga.Name", bonus: "WITCHER.Origins.MagTurga.Bonus" },
  { id: "geso", documentId: "orig000000000017", group: "nilfgaard", label: "WITCHER.Origins.Geso.Name", bonus: "WITCHER.Origins.Geso.Bonus" },
  { id: "ebbing", documentId: "orig000000000018", group: "nilfgaard", label: "WITCHER.Origins.Ebbing.Name", bonus: "WITCHER.Origins.Ebbing.Bonus" },
  { id: "maecht", documentId: "orig000000000019", group: "nilfgaard", label: "WITCHER.Origins.Maecht.Name", bonus: "WITCHER.Origins.Maecht.Bonus" },
  { id: "gemmera", documentId: "orig000000000020", group: "nilfgaard", label: "WITCHER.Origins.Gemmera.Name", bonus: "WITCHER.Origins.Gemmera.Bonus" },
  { id: "etolia", documentId: "orig000000000021", group: "nilfgaard", label: "WITCHER.Origins.Etolia.Name", bonus: "WITCHER.Origins.Etolia.Bonus" },
  { id: "dol-blathanna", documentId: "orig000000000022", group: "elder", label: "WITCHER.Origins.DolBlathanna.Name", bonus: "WITCHER.Origins.DolBlathanna.Bonus" },
  { id: "mahakam", documentId: "orig000000000023", group: "elder", label: "WITCHER.Origins.Mahakam.Name", bonus: "WITCHER.Origins.Mahakam.Bonus" }
];

export const ORIGIN_CHOICES = Object.fromEntries([
  ["", "WITCHER.Sheet.OriginUnset"], ...ORIGINS.map(origin => [origin.id, origin.label])
]);

export function getOrigin(id) {
  return ORIGINS.find(origin => origin.id === id) ?? null;
}

/** Central eligibility rule for future mechanics as well as reference UI. */
export function getOriginBonus(raceId, originId) {
  return raceId === "witcher" ? null : getOrigin(originId)?.bonus ?? null;
}

