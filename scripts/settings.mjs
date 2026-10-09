import { SYSTEM_ID } from "./config.mjs";

let languageLoad=Promise.resolve(null),languageData;
export function registerSystemSettings() {
  game.settings.register(SYSTEM_ID,"automaticCriticalDice",{
    name:"WITCHER.Settings.AutomaticCriticalDice",hint:"WITCHER.Settings.AutomaticCriticalDiceHint",
    scope:"world",config:true,type:Boolean,default:true
  });
  game.settings.register(SYSTEM_ID,"concealAttackRolls",{
    name:"WITCHER.Settings.ConcealAttackRolls",hint:"WITCHER.Settings.ConcealAttackRollsHint",
    scope:"world",config:true,type:Boolean,default:true
  });
  game.settings.register(SYSTEM_ID,"concealCreatureDetails",{
    name:"WITCHER.Settings.ConcealCreatureDetails",hint:"WITCHER.Settings.ConcealCreatureDetailsHint",
    scope:"world",config:true,type:Boolean,default:true
  });
  game.settings.register(SYSTEM_ID,"waitDiceAnimation",{
    name:"WITCHER.Settings.WaitDiceAnimation",hint:"WITCHER.Settings.WaitDiceAnimationHint",
    scope:"client",config:true,type:Boolean,default:true
  });
  game.settings.register(SYSTEM_ID,"combatEffects",{
    name:"WITCHER.Settings.CombatEffects",hint:"WITCHER.Settings.CombatEffectsHint",
    scope:"client",config:true,type:Boolean,default:true
  });
  game.settings.register(SYSTEM_ID,"combatBlood",{
    name:"WITCHER.Settings.CombatBlood",hint:"WITCHER.Settings.CombatBloodHint",
    scope:"client",config:true,type:Boolean,default:true
  });
  // Hidden: the GM's broom bumps it so every client wipes blood and other combat leftovers.
  game.settings.register(SYSTEM_ID,"combatEffectsCleanup",{scope:"world",config:false,type:Number,default:0});
  game.settings.register(SYSTEM_ID,"spellAreaLifetime",{
    name:"WITCHER.Settings.SpellAreaLifetime",hint:"WITCHER.Settings.SpellAreaLifetimeHint",
    scope:"world",config:true,type:Number,default:60,range:{min:0,max:600,step:10}
  });
  game.settings.register(SYSTEM_ID,"automaticFumbleRolls",{
    name:"WITCHER.Settings.AutomaticFumbleRolls",hint:"WITCHER.Settings.AutomaticFumbleRollsHint",
    scope:"world",config:true,type:Boolean,default:false
  });
  game.settings.register(SYSTEM_ID,"systemLanguage",{
    name:"WITCHER.Settings.Language",hint:"WITCHER.Settings.LanguageHint",scope:"client",config:true,
    type:String,default:"",choices:{"":"WITCHER.Settings.FoundryLanguage",ru:"Русский",en:"English"},requiresReload:true
  });
  const language=game.settings.get(SYSTEM_ID,"systemLanguage");
  if(["ru","en"].includes(language))languageLoad=fetch(`systems/${SYSTEM_ID}/lang/${language}.json`)
    .then(response=>{if(!response.ok)throw new Error(`Language HTTP ${response.status}`);return response.json();})
    .then(data=>{languageData=data;return data;}).catch(error=>{console.error(`${SYSTEM_ID} | Language`,error);return null;});
}
export function applyLoadedLanguage() {
  if(languageData)foundry.utils.mergeObject(game.i18n.translations,languageData,{inplace:true});
}
export async function ensureSystemLanguage() {await languageLoad;applyLoadedLanguage();}
export function automaticCriticalDice() {
  // Core schema tests and rolls evaluated before init keep the established automatic behavior.
  try{return globalThis.game?.settings?.get(SYSTEM_ID,"automaticCriticalDice")!==false;}catch{return true;}
}
