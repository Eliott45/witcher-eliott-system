/**
 * Race and ability IDs are persistent identifiers, independent of translations.
 * Descriptions and numeric rules share IDs without parsing text. Sheet counters
 * and background-modifiers.mjs use these IDs independently of the selected race.
 */
export const RACES = [
  {
    id: "human",
    label: "WITCHER.Races.Human.Name",
    note: "",
    abilities: [
      { id: "human.trust", label: "WITCHER.Races.Human.Trust.Name", description: "WITCHER.Races.Human.Trust.Description" },
      { id: "human.ingenuity", label: "WITCHER.Races.Human.Ingenuity.Name", description: "WITCHER.Races.Human.Ingenuity.Description" },
      { id: "human.stubbornness", label: "WITCHER.Races.Human.Stubbornness.Name", description: "WITCHER.Races.Human.Stubbornness.Description" }
    ]
  },
  {
    id: "elf",
    label: "WITCHER.Races.Elf.Name",
    note: "",
    abilities: [
      { id: "elf.artistic-talent", label: "WITCHER.Races.Elf.ArtisticTalent.Name", description: "WITCHER.Races.Elf.ArtisticTalent.Description" },
      { id: "elf.marksman", label: "WITCHER.Races.Elf.Marksman.Name", description: "WITCHER.Races.Elf.Marksman.Description" },
      { id: "elf.one-with-nature", label: "WITCHER.Races.Elf.OneWithNature.Name", description: "WITCHER.Races.Elf.OneWithNature.Description" }
    ]
  },
  {
    id: "dwarf",
    label: "WITCHER.Races.Dwarf.Name",
    note: "",
    abilities: [
      { id: "dwarf.tough", label: "WITCHER.Races.Dwarf.Tough.Name", description: "WITCHER.Races.Dwarf.Tough.Description" },
      { id: "dwarf.strong", label: "WITCHER.Races.Dwarf.Strong.Name", description: "WITCHER.Races.Dwarf.Strong.Description" },
      { id: "dwarf.shrewd", label: "WITCHER.Races.Dwarf.Shrewd.Name", description: "WITCHER.Races.Dwarf.Shrewd.Description" }
    ]
  },
  {
    id: "witcher",
    label: "WITCHER.Races.Witcher.Name",
    note: "WITCHER.Races.Witcher.Note",
    abilities: [
      { id: "witcher.enhanced-senses", label: "WITCHER.Races.Witcher.EnhancedSenses.Name", description: "WITCHER.Races.Witcher.EnhancedSenses.Description" },
      { id: "witcher.mutant-resilience", label: "WITCHER.Races.Witcher.MutantResilience.Name", description: "WITCHER.Races.Witcher.MutantResilience.Description" },
      { id: "witcher.dulled-emotions", label: "WITCHER.Races.Witcher.DulledEmotions.Name", description: "WITCHER.Races.Witcher.DulledEmotions.Description" },
      { id: "witcher.lightning-reflexes", label: "WITCHER.Races.Witcher.LightningReflexes.Name", description: "WITCHER.Races.Witcher.LightningReflexes.Description" }
    ]
  }
];

export const RACE_CHOICES = Object.fromEntries([
  ["", "WITCHER.Sheet.RaceUnset"],
  ...RACES.map(race => [race.id, race.label])
]);

export function getRace(id) {
  return RACES.find(race => race.id === id) ?? null;
}
