import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LanguageSwitcher } from "@/components/app-shell/language-switcher";
import { I18nProvider, STORAGE_KEY, useI18n } from "@/lib/i18n/i18n-provider";
import { translate } from "@/lib/i18n/translations";

function Probe() {
  const { t } = useI18n();
  return <p>{t("navigation.home")}</p>;
}

describe("I18nProvider", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        clear: () => storage.clear(),
      },
    });
  });

  afterEach(() => {
    storage.clear();
    document.documentElement.lang = "en";
  });

  it("changes translated content immediately and persists the locale", () => {
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("Home")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "es" } });

    expect(screen.getByText("Inicio")).toBeTruthy();
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });

  it("restores a persisted locale before rendering translated content", () => {
    globalThis.localStorage.setItem(STORAGE_KEY, "es");
    document.documentElement.lang = "es";

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("Inicio")).toBeTruthy();
  });

  it("localizes activity Must-do terminology without changing readiness checklist copy", () => {
    expect(translate("en", "common.activityMustDo")).toBe("Must-do");
    expect(translate("en", "common.activityAttachments")).toBe("Attachments");
    expect(translate("es", "common.activityAttachments")).toBe("Adjuntos");
    expect(translate("en", "common.activityMustDos")).toBe("Must-dos");
    expect(translate("es", "common.activityMustDo")).toBe("Imprescindible");
    expect(translate("es", "common.activityMustDos")).toBe("Imprescindibles");
    expect(translate("es", "common.activityMustDosProgress", { completed: 1, total: 2 }))
      .toBe("1/2 Imprescindibles completados");
    expect(translate("en", "common.viewChecklist")).toBe("View checklist");
  });

  it("localizes activity form labels into Spanish", () => {
    expect(translate("en", "common.title")).toBe("Title");
    expect(translate("es", "common.title")).toBe("Título");
    expect(translate("es", "common.description")).toBe("Descripción");
    expect(translate("es", "common.exactTime")).toBe("Hora exacta");
    expect(translate("es", "common.startTime")).toBe("Hora de inicio");
    expect(translate("es", "common.endTime")).toBe("Hora de fin");
    expect(translate("es", "common.participants")).toBe("Participantes");
    expect(translate("es", "common.activityStopCosts")).toBe("Costos de esta parada");
    expect(translate("es", "copy.emergencyCenter")).toBe("Centro de emergencias");
    expect(translate("es", "copy.shareTrip")).toBe("Compartir viaje");
    expect(translate("es", "copy.notificationsTitle")).toBe("Notificaciones");
    expect(translate("es", "copy.vault")).toBe("Bóveda");
    expect(translate("es", "copy.travelJournal")).toBe("Diario de viaje");
    expect(translate("en", "copy.emergencyCenter")).toBe("Emergency Center");
    expect(translate("es", "copy.tripPlannerHeading")).toBe("Quiero viajar a");
    expect(translate("es", "copy.tripIdeaDraftButton")).toBe("Crear borrador");
    expect(translate("es", "copy.tripIdeaAdultRange")).toBe("Indica entre 1 y 20 adultos.");
    expect(translate("es", "copy.tripSavingsSuggestedWeekly", { amount: "$25.00" }))
      .toBe("Aportación sugerida: $25.00 / semana");
    expect(translate("en", "copy.tripIdeaDraftButton")).toBe("Draft idea");
  });

  it("localizes the latest screens (Gemini, vault, weather, transit, health) into Spanish", () => {
    expect(translate("en", "copy.geminiAskTitle")).toBe("Ask Gemini");
    expect(translate("es", "copy.geminiAskTitle")).toBe("Pregunta a Gemini");
    expect(translate("es", "copy.geminiPageEyebrow")).toBe("Laboratorio de IA");
    expect(translate("es", "errors.geminiFailed")).toBe("Gemini no pudo responder ahora. Inténtalo de nuevo.");
    expect(translate("es", "copy.vaultUnlockHelp")).toBe(
      "Desbloquea con tu frase de contraseña para ver tus entradas privadas."
    );
    expect(translate("es", "copy.warningExtremeHeat")).toBe("Calor extremo");
    expect(translate("es", "copy.warningExtremeHeatMessage", { value: 36, unit: "°C" })).toBe(
      "Se esperan máximas de 36°C. Mantente hidratado y limita la actividad intensa al aire libre."
    );
    expect(translate("es", "copy.transitModeRideshare")).toBe("Uber o app de transporte");
    expect(translate("es", "copy.transitStatusBoarding")).toBe("Embarcando");
    expect(translate("es", "copy.readinessAlmostReady")).toBe("Casi listo");
    expect(translate("es", "copy.docTypePassport")).toBe("Pasaporte");
    expect(translate("es", "copy.passportBoardingDenied", { rule: "válido 6 meses después del viaje" })).toBe(
      "Podrían denegarte el embarque: el pasaporte debe ser válido 6 meses después del viaje."
    );
    expect(translate("es", "copy.travelerMany", { count: 3 })).toBe("3 viajeros");
    expect(translate("en", "copy.travelerMany", { count: 3 })).toBe("3 travelers");
  });

  it("localizes every Scout wizard and idea-detail string into Spanish", () => {
    expect(translate("en", "copy.scoutWizardTrigger")).toBe("Ask Scout for ideas");
    expect(translate("es", "copy.scoutWizardTrigger")).toBe("Pide ideas a Scout");
    expect(translate("en", "copy.scoutWizardTitle")).toBe("Let's find your kind of trip");
    expect(translate("es", "copy.scoutWizardTitle")).toBe("Encontremos tu tipo de viaje");
    expect(
      translate("es", "copy.scoutWizardStepProgress", {
        current: 5,
        total: 5,
        step: "Fechas",
      })
    ).toBe("Paso 5 de 5 · Fechas");
    expect(translate("es", "copy.scoutWizardVibeQuestion")).toBe(
      "Imagínate tu próxima escapada. ¿Qué es lo primero que se te antoja sentir?"
    );
    expect(translate("es", "copy.scoutWizardFind")).toBe("Ver mis ideas de viaje");
    expect(translate("es", "copy.scoutWizardCrewPartner")).toBe("En pareja o con un acompañante");
    expect(translate("es", "copy.scoutWizardSavingsLabel", { currency: "MXN" })).toBe(
      "Cantidad cómoda de ahorro (MXN)"
    );
    expect(translate("es", "copy.scoutIdeaViewDetails")).toBe("Ver detalles");
    expect(
      translate("es", "copy.scoutIdeaBudgetDailyDetail", {
        amount: "$10.00",
        days: 7,
        travelers: 2,
      })
    ).toBe("$10.00 × 7 días × 2 viajeros");
    expect(translate("es", "copy.scoutIdeaStayHeading")).toBe("Hotel o Airbnb");
    expect(translate("es", "copy.scoutWizardBestMatch")).toBe("La mejor opción para ti");
    expect(translate("es", "copy.scoutWizardOptionsHeading", { count: 7 })).toBe(
      "Tus 7 opciones más cercanas"
    );
    expect(translate("es", "copy.scoutWizardAddMore")).toBe("Añadir 2 opciones más");
    expect(translate("es", "copy.scoutWizardNoMore")).toBe(
      "Son todas las opciones que Scout conoce para este estilo."
    );
    expect(translate("es", "copy.scoutIdeaRank", { rank: 3 })).toBe("Opción 3");
    expect(translate("en", "copy.scoutIdeaBadgeEasiest")).toBe("Easiest to reach");
    expect(translate("es", "copy.scoutIdeaBadgeEasiest")).toBe("Más fácil de alcanzar");
    expect(translate("es", "copy.scoutWizardOriginQuestion")).toBe("¿Desde dónde despegas?");
    expect(translate("es", "copy.scoutWizardOriginLabel")).toBe(
      "Ciudad o aeropuerto de salida"
    );
    expect(translate("es", "copy.scoutWizardTimingCheapest")).toBe("Cuando sea más barato");
    expect(translate("es", "copy.scoutWizardExactDays")).toBe("O un número exacto de días");
    expect(translate("es", "copy.scoutWizardSavingsOptional")).toBe(
      "Tu ritmo semanal o mensual, sin juicios."
    );
    expect(translate("en", "copy.scoutWizardStepCrew")).toBe("The Crew");
    expect(translate("es", "copy.scoutWizardStepDeparture")).toBe("Despegue");
    expect(translate("es", "copy.scoutWizardCrewSoloSubtitle")).toBe("A mi ritmo y sin prisas");
    expect(translate("en", "copy.scoutWizardCrewSoloReaction")).toBe(
      "Solo trips are the best for recharging."
    );
    expect(translate("es", "copy.scoutWizardVibeNatureReaction")).toBe(
      "La montaña le hace bien a la cabeza."
    );
    expect(translate("en", "copy.scoutWizardThinking")).toBe(
      "Scout is matching routes, stays, and vibes..."
    );
    expect(translate("en", "copy.scoutWizardBudgetPresets")).toBe("Pick a starting point");
    expect(translate("es", "copy.scoutIdeaStatStayDetail", { nights: 6 })).toBe(
      "6 noches, todo el grupo"
    );
    expect(translate("es", "copy.scoutWizardRequired")).toBe("Obligatorio");
    expect(translate("en", "copy.scoutWizardOptional")).toBe("Optional");
    expect(translate("es", "copy.scoutWizardVibeRequired")).toBe(
      "Cuéntale a Scout tu ambiente en pocas palabras."
    );
    expect(translate("es", "copy.scoutWizardMonthRequired")).toBe(
      "Elige un mes o cambia la opción de fechas."
    );
    expect(translate("en", "copy.scoutIdeaNoSavingsPace")).toBe(
      "Add a savings pace to see when you could go."
    );
    expect(
      translate("en", "copy.scoutWizardFewerResults", { count: 3, expected: 5 })
    ).toBe("Scout found 3 of 5 matches for this vibe.");
    expect(translate("es", "copy.scoutIdeaFromOrigin", { origin: "Madrid" })).toBe(
      "Desde Madrid"
    );
    expect(translate("es", "copy.scoutIdeaSearchHeading")).toBe("Tu búsqueda");
    expect(translate("es", "copy.scoutIdeaSearchCabinEconomy")).toBe("Económica");
    expect(translate("es", "copy.scoutIdeaSearchStopsNonstop")).toBe("Solo directos");
    expect(translate("es", "copy.scoutIdeaSearchFlightsCta")).toBe("Buscar estos vuelos");
    expect(translate("en", "copy.scoutIdeaSearchStayCta")).toBe("Search these stays");
    expect(translate("es", "copy.scoutIdeaWhyHeading")).toBe("Por qué esta opción");
    expect(translate("es", "copy.scoutIdeaFlightsHeading")).toBe(
      "Mejor momento para reservar vuelos"
    );
    expect(
      translate("es", "copy.scoutIdeaSummaryWeekly", {
        periods: 23,
        ready: "1 jul 2027",
        bookBy: "6 may 2027",
      })
    ).toBe(
      "Unas 23 semanas de ahorro · listo el 1 jul 2027 · reserva vuelos antes del 6 may 2027"
    );
  });
});
