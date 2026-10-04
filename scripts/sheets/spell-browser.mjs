import { SYSTEM_ID } from "../config.mjs";
import { MAGIC_CATEGORIES,SPELL_ELEMENTS,SPELL_GRADES } from "../data/spells.mjs";
import { spellEntry,bindSpellFilters } from "./magic-context.mjs";
import { learnedSpell } from "../magic/rules.mjs";
import { learnSpell } from "../magic/casting.mjs";

export async function browseSpells(actor) {
  const pack=game.packs.get(`${SYSTEM_ID}.spells`);
  if(!pack)throw new Error("После установки вкладки магии перезапустите мир Foundry, чтобы загрузить новый компендиум.");
  const documents=[...await pack.getDocuments(),...game.items].filter(item=>item.type==="spell"&&item.testUserPermission(game.user,"OBSERVER"));
  const byId=new Map(documents.map(item=>[item.uuid,item]));
  const spells=await Promise.all(documents.map(async item=>({...spellEntry(item),id:item.uuid,
    description:await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description,{secrets:false,relativeTo:item})})));
  const content=await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/spell-browser.hbs`,{
    spells,actorName:actor.name,traditions:Object.entries(MAGIC_CATEGORIES).map(([id,label])=>({id,label})),elements:Object.entries(SPELL_ELEMENTS).map(([id,label])=>({id,label})),grades:Object.entries(SPELL_GRADES).map(([id,label])=>({id,label}))});
  const subscriptions=[];
  try {return await foundry.applications.api.DialogV2.wait({classes:["witcher-picker","witcher-spell-browser"],window:{title:"Каталог магии",resizable:true},position:{width:840,height:700},content,
    buttons:[{action:"close",label:"Закрыть"}],render:(_event,dialog)=>{
      const root=dialog.element;let busy=false;
      const refresh=()=>{
        for(const row of root.querySelectorAll("[data-spell-row]")) {
          const button=row.querySelector("[data-learn-spell]"),known=learnedSpell(actor,byId.get(row.dataset.spellRow));
          button.disabled=busy||!actor.isOwner||Boolean(known);button.textContent=known?"В книге":"Добавить в книгу";
        }
      };
      bindSpellFilters(root);refresh();
      root.addEventListener("click",async event=>{
        const button=event.target.closest("[data-learn-spell], [data-view-spell]");if(!button||button.disabled)return;
        const item=byId.get(button.closest("[data-spell-row]").dataset.spellRow);
        if(button.hasAttribute("data-view-spell")){await item.sheet.render({force:true});return;}
        if(busy)return;busy=true;refresh();
        try {await learnSpell(actor,item);}catch(error){ui.notifications.error(error.message);}finally{busy=false;refresh();}
      });
      root.addEventListener("dragstart",event=>{
        const row=event.target.closest("[data-spell-row]");if(row)event.dataTransfer.setData("text/plain",JSON.stringify({type:"Item",uuid:row.dataset.spellRow}));
      });
      for(const event of ["createItem","deleteItem"])subscriptions.push([event,Hooks.on(event,item=>{if(item.parent?.uuid===actor.uuid)refresh();})]);
    }});
  }finally {for(const [event,id] of subscriptions)Hooks.off(event,id);}
}
