// The book lists cost, range, duration and defense for magic, but no target column.
// Who or what each entry affects is read from its effect text; several values mean «or».
export const SPELL_TARGETS = {
  self: "Заклинатель", creature: "Одно существо", creatures: "Несколько существ", area: "Область",
  place: "Место", object: "Предмет", magic: "Действующая магия", knowledge: "Сведения, видение"
};

const groups = {
  self: ["spell.afan-mirror", "spell.glamour", "spell.magic-compass", "spell.adenydd", "spell.teleportation", "spell.polymorphism",
    "sign.quen", "invocation.natures-sight", "invocation.blessing-love", "invocation.holy-light", "invocation.knowledge-vault"],
  creature: ["spell.blinding-dust", "spell.mind-manipulation", "spell.telepathy", "spell.cenlly-graig", "spell.diagnostic-spell",
    "spell.earthen-spike", "spell.magic-healing", "spell.talfryn-prison", "spell.bronwyn-gust", "spell.aenye", "spell.brand-fire",
    "spell.carys-hail", "spell.curse-sedna", "spell.eilhart-technique", "spell.suffocate", "spell.seirff-haul", "spell.anialwch",
    "spell.mental-command", "spell.mirror-effect", "sign.axii", "sign.puppet", "sign.firestream",
    "ritual.cleansing", "ritual.artifact-compression",
    "hex.shadows", "hex.eternal-itch", "hex.devils-luck", "hex.nightmare", "hex.pestas-kiss", "hex.beast",
    "invocation.blood-boil", "invocation.cursed-illness", "invocation.healing-blessing", "invocation.animal-strength",
    "invocation.blessing-fortune", "invocation.cleansing-waters", "invocation.web-lies", "invocation.cleansing-fire",
    "invocation.holy-protection", "invocation.light-truth", "invocation.blessing-death", "invocation.eternal-judgement"],
  creatures: ["spell.alzur-thunder", "spell.tryferi-gaeaf", "invocation.threads-life", "invocation.healing-rest"],
  area: ["spell.korath-breath", "spell.freshen-air", "spell.urien-shelter", "spell.static-storm", "spell.zephyr", "spell.aine-versesos",
    "spell.magic-flare", "spell.tanio-ilchar", "spell.fire-stream", "spell.dormyn-fog", "spell.downpour", "spell.ice-slick",
    "spell.stammelford-tremor", "spell.gwynt-troelli", "spell.flaming-vortex", "spell.merigold-hailstorm", "spell.waves-naglfar",
    "spell.storm", "spell.melgar-fire",
    "sign.yrden", "sign.aard", "sign.igni", "sign.magic-trap", "sign.aard-sweep",
    "ritual.consecration", "ritual.magic-barrier", "ritual.interactive-illusion",
    "invocation.symbol-hidden", "invocation.song-sky", "invocation.freya-courage", "invocation.white-flame"],
  place: ["spell.air-pocket", "spell.raise-flame", "spell.control-water", "spell.illusion", "spell.rhwystr-graig", "spell.demetia-crest",
    "spell.magical-portal", "spell.part-water", "ritual.life", "ritual.magic-circle", "ritual.seance",
    "invocation.natures-gift", "invocation.divine-portal"],
  object: ["spell.summon-staff", "spell.codi-bywyd", "spell.luthien-quill", "spell.telekinesis", "spell.cadfan-grasp", "spell.puro-dwr",
    "spell.elgan-theory", "spell.transmutation", "ritual.magic-message", "ritual.spell-jar", "ritual.telecommunication", "ritual.golem",
    "invocation.control-nature"],
  magic: ["spell.dispel"],
  knowledge: ["ritual.hydromancy", "ritual.pyromancy", "ritual.oneiromancy", "invocation.divine-wisdom"]
};
// Entries that may affect either kind of target.
const either = {
  "spell.rhewi": ["creature", "object"],
  "spell.dervish": ["self", "area"],
  "sign.active-shield": ["self", "creature"],
  "invocation.animal-friend": ["self", "creature"],
  "invocation.divine-fortune": ["self", "creature"]
};

export const SPELL_TARGET_BY_ID = Object.freeze({
  ...Object.fromEntries(Object.entries(groups).flatMap(([target, ids]) => ids.map(id => [id, [target]]))), ...either
});
export const spellTargetLabel = (targets = []) => targets.map(id => SPELL_TARGETS[id]).filter(Boolean).join(" или ");
