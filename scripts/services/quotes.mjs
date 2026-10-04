import { CRITICAL_WOUND_FEES, SEA_ROUTES, getServiceRule } from "../data/core-services.mjs";

export const crowns = value => `${new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(value)} кр.`;
const number = (value,label,{integer=false,min=0,max=1e9}={}) => {
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<min||parsed>max||(integer&&!Number.isInteger(parsed)))throw new Error(`Некорректное значение: ${label}.`);
  return parsed;
};

/** Reused by preview, request creation and GM approval; never trust a price sent by a player. */
export function serviceQuote(service, parameters={}) {
  if(!service?.enabled)throw new Error("Услуга больше недоступна.");
  const quantity=number(parameters.quantity??1,"количество",{integer:true,min:1,max:100});
  const price=number(service.price,"цена");
  const rule=getServiceRule(service), detail=[], normalized={quantity};
  let subtotal=price*quantity;
  if(service.pricing==="percent") {
    if(quantity!==1||price>100)throw new Error("Для доли выручки количество должно быть 1, ставка — от 0 до 100%.");
    normalized.revenue=number(parameters.revenue??0,"выручка");
    subtotal=normalized.revenue*price/100;
    detail.push(`${price}% от ${crowns(normalized.revenue)}`);
  } else if(service.pricing==="fixed") detail.push(`${quantity} × ${crowns(price)} / ${service.unit}`);
  else throw new Error("Неизвестный способ расчёта цены.");
  if(rule?.rules.extra==="seaRoute") {
    const route=SEA_ROUTES.find(route=>route.id===(parameters.route??"coast"));
    if(!route)throw new Error("Неизвестный морской маршрут.");
    normalized.route=route.id; subtotal*=route.multiplier;
    detail.push(`${route.name}: ×${route.multiplier}`);
  }
  if(rule?.rules.extra==="craftValue") {
    normalized.craftValue=number(parameters.craftValue??0,"стоимость изделия");
    subtotal+=normalized.craftValue*quantity;
    if(normalized.craftValue)detail.push(`Изделия: ${quantity} × ${crowns(normalized.craftValue)}`);
  }
  if(rule?.rules.extra==="criticalWounds") {
    normalized.wounds={};
    let fees=0;
    for(const [key,fee] of Object.entries(CRITICAL_WOUND_FEES)) {
      const count=number(parameters.wounds?.[key]??0,"число критических ранений",{integer:true,max:100});
      normalized.wounds[key]=count; fees+=fee*count;
    }
    subtotal+=fees;
    if(fees)detail.push(`Критические ранения всех пациентов: +${crowns(fees)}`);
  }
  const total=Math.round(subtotal*100)/100;
  if(!Number.isSafeInteger(Math.round(total*100)))throw new Error("Слишком большая сумма заказа.");
  // Price mode, unit and rule identity are included: equal totals do not mean equal offers.
  const fingerprint=JSON.stringify([service.id,service.ruleId,service.name,service.price,service.pricing,service.unit,normalized,total]);
  return {total,quantity,parameters:normalized,detail:detail.join(" · "),fingerprint};
}

export function validateServiceEntries(entries) {
  const ids=new Set();
  for(const entry of entries) {
    if(!entry.id||ids.has(entry.id))throw new Error("У каждой услуги должен быть уникальный ID.");
    ids.add(entry.id);
    if(!entry.name.trim())throw new Error("Укажите название услуги.");
    number(entry.price,"цена",{max:entry.pricing==="percent"?100:1e9});
    if(!["fixed","percent"].includes(entry.pricing))throw new Error("Неизвестный способ расчёта цены.");
  }
  return entries;
}
