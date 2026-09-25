import { normalizePackingName } from "@/features/packing/domain/packing-types";
import type { TranslationKey } from "@/lib/i18n/translations";

/** Canonical generator names mapped to catalog keys. Custom names fall through. */
const PACKING_ITEM_KEYS: Record<string, TranslationKey> = {
  "passport / id": "common.packingItemPassport",
  "visa / travel authorization": "common.packingItemVisa",
  "travel insurance": "common.packingItemInsurance",
  "booking confirmations": "common.packingItemBookings",
  "driver's license": "common.packingItemLicense",
  "credit / debit cards": "common.packingItemCards",
  cash: "common.packingItemCash",
  "document copies": "common.packingItemDocumentCopies",
  phone: "common.packingItemPhone",
  "phone charger": "common.packingItemPhoneCharger",
  "charging cable": "common.packingItemChargingCable",
  "power bank": "common.packingItemPowerBank",
  "headphones / earbuds": "common.packingItemHeadphones",
  "travel adapter": "common.packingItemTravelAdapter",
  "laptop + charger": "common.packingItemLaptop",
  toothbrush: "common.packingItemToothbrush",
  toothpaste: "common.packingItemToothpaste",
  deodorant: "common.packingItemDeodorant",
  shampoo: "common.packingItemShampoo",
  "body wash": "common.packingItemBodyWash",
  "face wash": "common.packingItemFaceWash",
  razor: "common.packingItemRazor",
  sunscreen: "common.packingItemSunscreen",
  "perfume / cologne": "common.packingItemPerfume",
  "personal medications": "common.packingItemMedications",
  "pain relievers": "common.packingItemPainRelievers",
  "basic first aid": "common.packingItemFirstAid",
  "toiletry kit": "common.packingItemToiletryKit",
  "hand sanitizer": "common.packingItemHandSanitizer",
  hairbrush: "common.packingItemHairbrush",
  "backpack / daypack": "common.packingItemBackpack",
  "water bottle": "common.packingItemWaterBottle",
  sunglasses: "common.packingItemSunglasses",
  "travel pillow": "common.packingItemTravelPillow",
  "laundry bag": "common.packingItemLaundryBag",
  "packing cubes": "common.packingItemPackingCubes",
  earplugs: "common.packingItemEarplugs",
  "sleep mask": "common.packingItemSleepMask",
  "insect repellent": "common.packingItemInsectRepellent",
  "luggage lock": "common.packingItemLuggageLock",
  "rain jacket": "common.packingItemRainJacket",
  umbrella: "common.packingItemUmbrella",
  "reusable water bottle": "common.packingItemReusableBottle",
  underwear: "common.packingItemUnderwear",
  socks: "common.packingItemSocks",
  "shirts / tops": "common.packingItemShirts",
  "pants / bottoms": "common.packingItemPants",
  sleepwear: "common.packingItemSleepwear",
  "casual shoes": "common.packingItemCasualShoes",
  sandals: "common.packingItemSandals",
  "light jacket": "common.packingItemLightJacket",
  "heavy jacket / coat": "common.packingItemHeavyJacket",
  "warm layers": "common.packingItemWarmLayers",
  gloves: "common.packingItemGloves",
  "beanie / hat": "common.packingItemBeanie",
  "sun hat": "common.packingItemSunHat",
  "light, breathable clothes": "common.packingItemBreathableClothes",
  swimwear: "common.packingItemSwimwear",
  "walking shoes": "common.packingItemWalkingShoes",
  "formal / nice outfit": "common.packingItemFormalOutfit",
  "thermal top": "common.packingItemThermalTop",
  "warm scarf": "common.packingItemScarf",
  "hiking gear": "common.packingItemHikingGear",
  "hiking shoes": "common.packingItemHikingShoes",
  "camping gear": "common.packingItemCampingGear",
  "beach gear": "common.packingItemBeachGear",
  "beach towel": "common.packingItemBeachTowel",
  "sports gear": "common.packingItemSportsGear",
};

export function packingItemLabel(
  name: string,
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string,
): string {
  const key = PACKING_ITEM_KEYS[normalizePackingName(name)];
  return key ? t(key) : name;
}

/** Extra suggestions beyond the can't-go-without essentials. Not the full catalog. */
const SUGGESTION_BADGE_NAMES = new Set([
  "travel adapter",
  "power bank",
  "charging cable",
  "toiletry kit",
  "personal medications",
  "pain relievers",
  "basic first aid",
  "deodorant",
  "sunscreen",
  "light jacket",
  "heavy jacket / coat",
  "water bottle",
  "sunglasses",
]);

/**
 * Suggested badge for untouched rows that are either trip essentials
 * (`suggestedReason === "always"`) or one of the extra catalog names above.
 */
export function isUntouchedSuggestion(
  item: { name: string; isSuggested: boolean; isPacked: boolean; quantity: number; suggestedReason?: string | null },
  draftQuantity: number | undefined,
): boolean {
  if (!item.isSuggested || item.isPacked) return false;
  const essential = item.suggestedReason === "always";
  const extra = SUGGESTION_BADGE_NAMES.has(normalizePackingName(item.name));
  if (!essential && !extra) return false;
  if (draftQuantity != null && item.quantity !== draftQuantity) return false;
  return true;
}
