import { SYSTEM_ID } from "../config.mjs";

/** Resolve a ritual AFTER native Luck has adjusted its roll, before chat persistence. */
export function prepareMagicResult(message) {
  const cast=message.flags[SYSTEM_ID]?.magicCast;
  if(!cast||cast.kind!=="ritual"||cast.resolved||cast.maintenance)return;
  const result=message.rolls[0]?.total??0;
  const succeeded=!cast.difficulty.target||result>=cast.difficulty.target;
  const difficulty=cast.difficulty;
  const line=difficulty.target?`${result} ${succeeded?"≥":"<"} ${difficulty.target} · СЛ: ${difficulty.base} − ${difficulty.helpers} помощн. = ${difficulty.target}`:"Проверка не требуется";
  message.updateSource({[`flags.${SYSTEM_ID}.magicCast`]:{...cast,result,succeeded,resolved:true},
    flavor:`${message.flavor??""}<p class="witcher-magic-outcome"><strong>${succeeded?"Ритуал удался":"Ритуал не удался"}</strong> · ${line}</p>`});
}
