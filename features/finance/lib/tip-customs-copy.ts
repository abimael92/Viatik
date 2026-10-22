import type { TranslationKey } from "@/lib/i18n/translations";

export interface TipCustomsCopy {
  destination: TranslationKey;
  guide: TranslationKey;
  tax: TranslationKey;
  rounding: TranslationKey;
}

const TIP_CUSTOMS_COPY: Record<string, TipCustomsCopy> = {
  "United States": {
    destination: "copy.tipDestUnitedStates",
    guide: "copy.tipGuideUnitedStates",
    tax: "copy.tipTaxUnitedStates",
    rounding: "copy.tipRoundUnitedStates",
  },
  Canada: {
    destination: "copy.tipDestCanada",
    guide: "copy.tipGuideCanada",
    tax: "copy.tipTaxCanada",
    rounding: "copy.tipRoundCanada",
  },
  Mexico: {
    destination: "copy.tipDestMexico",
    guide: "copy.tipGuideMexico",
    tax: "copy.tipTaxMexico",
    rounding: "copy.tipRoundMexico",
  },
  "United Kingdom": {
    destination: "copy.tipDestUnitedKingdom",
    guide: "copy.tipGuideUnitedKingdom",
    tax: "copy.tipTaxUnitedKingdom",
    rounding: "copy.tipRoundUnitedKingdom",
  },
  Europe: {
    destination: "copy.tipDestEurope",
    guide: "copy.tipGuideEurope",
    tax: "copy.tipTaxEurope",
    rounding: "copy.tipRoundEurope",
  },
  Japan: {
    destination: "copy.tipDestJapan",
    guide: "copy.tipGuideJapan",
    tax: "copy.tipTaxJapan",
    rounding: "copy.tipRoundJapan",
  },
  Thailand: {
    destination: "copy.tipDestThailand",
    guide: "copy.tipGuideThailand",
    tax: "copy.tipTaxThailand",
    rounding: "copy.tipRoundThailand",
  },
  India: {
    destination: "copy.tipDestIndia",
    guide: "copy.tipGuideIndia",
    tax: "copy.tipTaxIndia",
    rounding: "copy.tipRoundIndia",
  },
  Brazil: {
    destination: "copy.tipDestBrazil",
    guide: "copy.tipGuideBrazil",
    tax: "copy.tipTaxBrazil",
    rounding: "copy.tipRoundBrazil",
  },
  "Australia / New Zealand": {
    destination: "copy.tipDestAustraliaNz",
    guide: "copy.tipGuideAustraliaNz",
    tax: "copy.tipTaxAustraliaNz",
    rounding: "copy.tipRoundAustraliaNz",
  },
  China: {
    destination: "copy.tipDestChina",
    guide: "copy.tipGuideChina",
    tax: "copy.tipTaxChina",
    rounding: "copy.tipRoundChina",
  },
  General: {
    destination: "copy.tipDestGeneral",
    guide: "copy.tipGuideGeneral",
    tax: "copy.tipTaxGeneral",
    rounding: "copy.tipRoundGeneral",
  },
};

export function tipCustomsCopy(destination: string): TipCustomsCopy {
  return TIP_CUSTOMS_COPY[destination] ?? TIP_CUSTOMS_COPY.General;
}
