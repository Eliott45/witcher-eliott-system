import { SYSTEM_ID } from "../config.mjs";

// An explicitly priced custom copy may be sold even when its source has no market price.
export const hasMarketPrice = item => !item.flags?.[SYSTEM_ID]?.priceUnavailable || Number(item.system.price) > 0;
