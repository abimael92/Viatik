import type { WeatherConflict, WeatherHazardType } from "@/features/weather/domain/weather-conflict-types";
import type { TranslationKey } from "@/lib/i18n/translations";

type Translate = (key: TranslationKey, variables?: Record<string, string | number>) => string;

export const WEATHER_HAZARD_LABEL_KEYS: Record<WeatherHazardType, TranslationKey> = {
  heavyRain: "copy.warningHeavyRain",
  highWind: "copy.warningHighWind",
  extremeHeat: "copy.warningExtremeHeat",
  freezing: "copy.warningFreezing",
};

const INDOOR_SWAP_TITLE_KEYS: Record<string, TranslationKey> = {
  climbingGym: "copy.swapIndoorClimbingGym",
  aquarium: "copy.swapIndoorAquarium",
  museum: "copy.swapIndoorMuseum",
  sportsCenter: "copy.swapIndoorSportsCenter",
  playCenter: "copy.swapIndoorPlayCenter",
  artGallery: "copy.swapIndoorArtGallery",
};

const INDOOR_SWAP_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  climbingGym: "copy.swapIndoorClimbingGymDescription",
  aquarium: "copy.swapIndoorAquariumDescription",
  museum: "copy.swapIndoorMuseumDescription",
  sportsCenter: "copy.swapIndoorSportsCenterDescription",
  playCenter: "copy.swapIndoorPlayCenterDescription",
  artGallery: "copy.swapIndoorArtGalleryDescription",
};

export function indoorSwapTitleKey(id: string | undefined): TranslationKey {
  return INDOOR_SWAP_TITLE_KEYS[id ?? "museum"] ?? "copy.swapIndoorMuseum";
}

export function indoorSwapDescriptionKey(id: string | undefined): TranslationKey {
  return INDOOR_SWAP_DESCRIPTION_KEYS[id ?? "museum"] ?? "copy.swapIndoorMuseumDescription";
}

export function conflictReason(conflict: WeatherConflict, t: Translate): string {
  return t("copy.conflictReason", {
    hazard: t(WEATHER_HAZARD_LABEL_KEYS[conflict.hazard]),
    value: conflict.hazardValue ?? 0,
    unit: conflict.hazardUnit ?? "",
    title: conflict.activityTitle ?? "",
  });
}
