import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

export function generateCreatureLoot(actor) {
  return inventoryWrite(actor,async()=>{
    if(!game.user.isGM||actor.system.creature.lootGenerated)return;
    const display=trackRollDisplay(),mode=game.settings.get("core","messageMode");
    try {
      const results=[];
      for(const row of actor.system.creature.loot){
        const roll=await new foundry.dice.Roll(row.formula||"1").evaluate({allowInteractive:mode!=="blind"});
        results.push({row,roll,quantity:Math.max(0,Math.floor(roll.total))});
      }
      const items=[],report=[];let crowns=actor.system.crowns;
      const harvest=actor.system.harvest.map(row=>({...row}));
      for(const row of harvest.filter(row=>row.formula)){
        const roll=await new foundry.dice.Roll(row.formula).evaluate({allowInteractive:mode!=="blind"});
        row.quantity=Math.max(0,Math.floor(roll.total));
        const material=await foundry.utils.fromUuid(row.uuid);
        report.push(`${material?.name??"Реагент"}: ${row.quantity}`);
        results.push({row:{name:material?.name??"Реагент",harvest:true},roll,quantity:row.quantity});
      }
      for(const {row,quantity} of results){
        if(row.harvest)continue;
        report.push(`${row.name}: ${quantity}`);
        if(row.currency){crowns+=quantity;continue;}
        if(!quantity)continue;
        items.push({_id:foundry.utils.randomID(),name:row.name,type:"equipment",img:"icons/svg/item-bag.svg",
          system:{description:"<p>Добыча. Конкретные обычные предметы выбирает ведущий.</p>",quantity}});
      }
      const message=await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),
        rolls:results.filter(result=>result.roll.dice.length).map(result=>result.roll),content:`<h3>Добыча: ${esc(actor.name)}</h3><ul>${report.map(line=>`<li>${esc(line)}</li>`).join("")}</ul>`,
        flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],skipLuck:true}}},mode));
      if(!message)return;
      await display.wait(message);
      await actor.update({"system.crowns":crowns,"system.creature.lootGenerated":true,"system.harvest":harvest,items:[...actor.items.map(item=>item.toObject()),...items]});
    } finally {display.close();}
  });
}
