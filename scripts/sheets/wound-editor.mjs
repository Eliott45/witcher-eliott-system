import { SYSTEM_ID } from "../config.mjs";
import { WOUND_STATES, setWoundState } from "../combat/critical-wound-effects.mjs";
import { escapeTooltip as esc } from "./statistics-tooltips.mjs";

export const canEditWound = effect => Boolean(effect?.parent?.isOwner && effect.flags?.[SYSTEM_ID]?.criticalWound
  && effect.flags[SYSTEM_ID].criticalWound.id !== "decapitation");

export async function editWound(effect) {
  if(!canEditWound(effect))return;
  const state=effect.flags[SYSTEM_ID].criticalWound.state??"fresh";
  const answer=await foundry.applications.api.DialogV2.prompt({window:{title:"Редактировать ранение"},position:{width:460},
    content:`<p><strong>${esc(effect.name)}</strong></p><label>Состояние<select name="state">${Object.entries(WOUND_STATES).map(([key,label])=>`<option value="${key}" ${key===state?"selected":""}>${label}</option>`).join("")}</select></label><p class="hint">Состояние меняется без броска. Штрафы и связанные эффекты обновятся автоматически.</p>`,
    ok:{label:"Сохранить",callback:(_event,button)=>button.form.elements.state.value},rejectClose:false});
  if(answer&&canEditWound(effect))await setWoundState(effect,answer);
}
