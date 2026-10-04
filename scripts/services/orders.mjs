import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { serviceQuote, crowns } from "./quotes.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

const sending = new Map(), resolving = new Map();
export const serviceOrder = message => message?.flags?.[SYSTEM_ID]?.serviceOrder;
export const canResolveServices = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
export const ORDER_STATES = {pending:"Ожидает мастера",accepted:"Принят и оплачен",rejected:"Отклонён"};

function verifyCustomer(actor, user) {
  if(!actor || !COMBAT_ACTOR_TYPES.includes(actor.type) || !actor.testUserPermission(user,"OWNER"))throw new Error("Выберите своего персонажа для оплаты услуги.");
}
function verifyProvider(provider, user) {
  if(provider?.type!=="services" || !provider.testUserPermission(user,"OBSERVER"))throw new Error("Нет доступа к этому заведению.");
  if(provider.system.closed)throw new Error("Заведение сейчас закрыто.");
}
export function orderCard(order) {
  return `<section class="witcher-service-receipt"><header><i class="fa-solid fa-bell-concierge" aria-hidden="true"></i> Заказ услуги</header><h3>${esc(order.serviceName)}</h3><p>${esc(order.providerName)} · ${esc(order.customerName)}</p><p>${esc(order.detail)}</p>${order.note?`<p class="witcher-service-order-note">${esc(order.note)}</p>`:""}<footer><strong>${crowns(order.total)}</strong><span>${ORDER_STATES[order.status]??"Неизвестный статус"}</span></footer></section>`;
}

async function saveOrder(message, order) {
  const saved = await message.update({content:orderCard(order),[`flags.${SYSTEM_ID}.serviceOrder`]:order});
  if(!saved)throw new Error("Не удалось сохранить статус заказа. Повторите обработку; повторной оплаты не будет.");
  return saved;
}

/** A private persistent chat request is the transport; players never write to the provider Actor. */
export function requestService(provider, customer, serviceId, parameters, note="") {
  const key=`${provider.uuid}:${customer?.uuid}:${serviceId}`;
  if(sending.has(key))return sending.get(key);
  const work=Promise.resolve().then(async()=>{
    verifyCustomer(customer,game.user); verifyProvider(provider,game.user);
    const service=provider.system.services.find(entry=>entry.id===serviceId);
    const quote=serviceQuote(service,parameters);
    if(Number(customer.system.crowns)<quote.total)throw new Error("Недостаточно крон для этого заказа.");
    const gms=game.users.filter(user=>user.isGM).map(user=>user.id);
    if(!gms.length)throw new Error("В мире нет мастера, которому можно отправить заказ.");
    const order={providerUuid:provider.uuid,customerUuid:customer.uuid,serviceId,
      providerName:provider.name,customerName:customer.name,serviceName:service.name,
      parameters:quote.parameters,total:quote.total,detail:quote.detail,fingerprint:quote.fingerprint,
      note:String(note).trim().slice(0,1000),status:"pending"};
    const message = await foundry.documents.ChatMessage.implementation.create({
      author:game.user.id,whisper:[...new Set([...gms,game.user.id])],
      speaker:foundry.documents.ChatMessage.getSpeaker({actor:customer}),
      style:CONST.CHAT_MESSAGE_STYLES.OTHER,content:orderCard(order),
      flags:{[SYSTEM_ID]:{skipLuck:true,serviceOrder:order}}
    });
    if(!message)throw new Error("Не удалось отправить заказ мастеру.");
    return message;
  });
  sending.set(key,work);
  const clear=()=>{if(sending.get(key)===work)sending.delete(key);};
  work.then(clear,clear);return work;
}

/** Only the active GM charges; receipt and balance change in a single Actor update. */
export function resolveServiceOrder(message, accept) {
  if(!canResolveServices())return Promise.reject(new Error("Заказ обрабатывает активный мастер."));
  if(resolving.has(message.id))return resolving.get(message.id);
  const work=Promise.resolve().then(async()=>{
    const order=serviceOrder(message);
    if(!order || order.status!=="pending")return;
    const customer=await foundry.utils.fromUuid(order.customerUuid);
    if(!customer) {
      if(accept)throw new Error("Персонаж заказа удалён.");
      const rejected={...order,status:"rejected",resolvedBy:game.user.id};
      return saveOrder(message,rejected);
    }
    return inventoryWrite(customer,async()=>{
      if(!canResolveServices())throw new Error("Активный мастер изменился. Повторите обработку заказа.");
      if(serviceOrder(message)?.status!=="pending")return;
      const saved=customer.flags?.[SYSTEM_ID]?.servicePayments?.[message.id];
      // If chat persistence failed after charging, finish the same receipt without another debit.
      if(saved) {
        await saveOrder(message,saved);
        return;
      }
      if(!accept) {
        const rejected={...order,status:"rejected",resolvedBy:game.user.id};
        await saveOrder(message,rejected);
        return;
      }
      const author=game.users.get(message.author?.id??message._source?.author);
      if(!author)throw new Error("Автор заказа больше не существует.");
      verifyCustomer(customer,author);
      const provider=await foundry.utils.fromUuid(order.providerUuid);
      verifyProvider(provider,author);
      const service=provider.system.services.find(entry=>entry.id===order.serviceId);
      const quote=serviceQuote(service,order.parameters);
      if(quote.fingerprint!==order.fingerprint || quote.total!==order.total)throw new Error("Условия или цена изменились. Отклоните заказ; игрок сможет отправить новый.");
      const balance=Number(customer.system.crowns);
      if(!Number.isFinite(balance)||Math.round(balance*100)<Math.round(quote.total*100))throw new Error("У персонажа больше не хватает крон. Заказ остался на рассмотрении.");
      const accepted={...order,status:"accepted",resolvedBy:game.user.id};
      const updated=await customer.update({"system.crowns":Math.round((balance-quote.total)*100)/100,
        [`flags.${SYSTEM_ID}.servicePayments.${message.id}`]:accepted});
      if(!updated)throw new Error("Не удалось сохранить оплату. Заказ не принят.");
      await saveOrder(message,accepted);
    });
  });
  resolving.set(message.id,work);
  const clear=()=>{if(resolving.get(message.id)===work)resolving.delete(message.id);};
  work.then(clear,clear);return work;
}

export function renderServiceOrder(message, html) {
  const order=serviceOrder(message);
  if(!message.isContentVisible || !order)return;
  html.querySelector(".witcher-service-order-actions")?.remove();
  if(order.status!=="pending" || !canResolveServices())return;
  const actions=document.createElement("div");actions.className="witcher-service-order-actions";
  for(const [accept,label] of [[true,"Принять и списать кроны"],[false,"Отклонить"]]) {
    const button=document.createElement("button");button.type="button";button.textContent=label;
    button.addEventListener("click",async()=>{
      for(const control of actions.querySelectorAll("button"))control.disabled=true;
      try {await resolveServiceOrder(message,accept);}
      catch(error){ui.notifications.error(error.message);}
      finally{for(const control of actions.querySelectorAll("button"))control.disabled=false;}
    });actions.append(button);
  }
  html.querySelector(".message-content")?.append(actions);
}

export function registerServiceOrders() {
  Hooks.on("renderChatMessageHTML",renderServiceOrder);
  const refresh=message=>{
    const order=serviceOrder(message);
    if(!order)return;
    foundry.utils.fromUuid(order.providerUuid).then(provider=>{
      if(provider?.sheet.rendered && provider.sheet.tabGroups.services!=="manage")provider.sheet.render();
    }).catch(error=>console.warn(`${SYSTEM_ID} | Service order sheet refresh failed`,error));
  };
  for(const hook of ["createChatMessage","updateChatMessage","deleteChatMessage"])Hooks.on(hook,refresh);
}
