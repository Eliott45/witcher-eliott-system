import { ROUND_SECONDS } from "../config.mjs";
import { durationEditValues, effectDurationUpdate, EFFECT_TIME_UNITS } from "../data/effect-duration.mjs";
import { escapeTooltip as esc } from "./statistics-tooltips.mjs";
import { DYING, DEAD, EXHAUSTED_STUN, UNCONSCIOUS } from "../combat/status-effects.mjs";

export const canEditEffectDuration=effect=>Boolean(effect?.isOwner&&(effect.parent?.documentName!=="Actor"||game.user.isGM||![DYING,DEAD,EXHAUSTED_STUN,UNCONSCIOUS].some(status=>effect.statuses.has(status))));

export async function editEffectDuration(effect) {
  if(!canEditEffectDuration(effect))return;
  const initial=durationEditValues(effect);
  const content=`<div class="witcher-duration-editor"><p><strong>${esc(effect.name)}</strong></p><p>1 раунд = ${ROUND_SECONDS} секунды · 1 минута = ${60/ROUND_SECONDS} раундов</p><div class="witcher-duration-fields"><label>Оставшееся время<input name="value" type="number" min="0" step="any" value="${initial.value}" required></label><label>Единица<select name="units">${Object.entries(EFFECT_TIME_UNITS).map(([key,label])=>`<option value="${key}" ${key===initial.units?"selected":""}>${label}</option>`).join("")}</select></label></div><output class="witcher-duration-preview"></output><p class="hint">Отсчёт начнётся с текущего момента. Спасброски и свойства эффекта сохраняются.</p></div>`;
  const answer=await foundry.applications.api.DialogV2.prompt({window:{title:"Длительность эффекта"},classes:["witcher-duration-dialog"],position:{width:460},content,rejectClose:false,
    ok:{label:"Сохранить",callback:(_event,button)=>({value:Number(button.form.elements.value.value),units:button.form.elements.units.value})},
    render:(_event,dialog)=>{
      const root=dialog.element,input=root.querySelector('[name="value"]'),select=root.querySelector('[name="units"]'),preview=root.querySelector("output");
      const refresh=()=>{
        const unlimited=select.value==="unlimited";input.disabled=unlimited;input.step=select.value==="rounds"?"1":"any";
        try {
          const {duration}=effectDurationUpdate(Number(input.value),select.value,null);
          const seconds=duration.units==="rounds"?duration.value*ROUND_SECONDS:duration.value;
          preview.textContent=unlimited?"Без ограничения":`${new Intl.NumberFormat("ru",{maximumFractionDigits:3}).format(seconds/ROUND_SECONDS)} раунд. = ${new Intl.NumberFormat("ru",{maximumFractionDigits:3}).format(seconds)} сек.`;
          input.setCustomValidity("");
        }catch(error){preview.textContent=error.message;input.setCustomValidity(error.message);}
      };
      input.addEventListener("input",refresh);select.addEventListener("change",refresh);refresh();
    }});
  if(!answer||!canEditEffectDuration(effect))return;
  return effect.update(effectDurationUpdate(answer.value,answer.units,effect.parent?.documentName==="Actor"?foundry.documents.ActiveEffect.getEffectStart():null));
}
