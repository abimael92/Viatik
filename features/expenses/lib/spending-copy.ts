import type { SpendingCategory, SpendingSubcategory } from "@/features/domain/categories";
import type { TranslationKey } from "@/lib/i18n/translations";

export const SPENDING_CATEGORY_COPY: Record<SpendingCategory, TranslationKey> = {
  transport: "copy.spendingCategoryTransport",
  stay: "copy.spendingCategoryStay",
  food: "copy.spendingCategoryFood",
  activities: "copy.spendingCategoryActivities",
  shopping: "copy.spendingCategoryShopping",
  personal: "copy.spendingCategoryPersonal",
};

export const SPENDING_SUBCATEGORY_COPY: Record<SpendingSubcategory, TranslationKey> = {
  flights: "copy.spendingSubFlights",
  uber: "copy.spendingSubUber",
  gas: "copy.spendingSubGas",
  cabs: "copy.spendingSubCabs",
  hotel: "copy.spendingSubHotel",
  airbnb: "copy.spendingSubAirbnb",
  motel: "copy.spendingSubMotel",
  restaurants: "copy.spendingSubRestaurants",
  water: "copy.spendingSubWater",
  snacks: "copy.spendingSubSnacks",
  excursions: "copy.spendingSubExcursions",
  tickets: "copy.spendingSubTickets",
  gifts: "copy.spendingSubGifts",
  markets: "copy.spendingSubMarkets",
  toiletries: "copy.spendingSubToiletries",
  pharmacy: "copy.spendingSubPharmacy",
};
