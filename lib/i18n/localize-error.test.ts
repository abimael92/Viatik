import { describe, expect, it } from "vitest";

import { localizeThrownError, localizeUserError } from "@/lib/i18n/localize-error";
import { translate } from "@/lib/i18n/translations";

const t = ((key: Parameters<typeof translate>[1], variables?: Record<string, string | number>) =>
  translate("es", key, variables)) as Parameters<typeof localizeUserError>[1];

describe("localizeUserError", () => {
  it("maps known action failures and backend payloads to Spanish", () => {
    expect(localizeUserError("Incorrect email or password.", t, "errors.unexpected")).toBe(
      "Correo o contraseña incorrectos.",
    );
    expect(localizeUserError("Unable to save trip", t, "errors.unexpected")).toBe("No se pudo guardar el viaje");
    expect(
      localizeUserError(
        "Could not find the function public.sync_activity_cas_upsert in the schema cache",
        t,
        "copy.unableSaveActivity",
      ),
    ).toBe("Esta acción no está disponible hasta aplicar la última actualización. Inténtalo en un momento.");
    expect(localizeUserError("Invalid login credentials", t, "errors.unexpected")).toBe(
      "Correo o contraseña incorrectos.",
    );
    expect(localizeThrownError(new Error("Failed to fetch"), t, "copy.unableSaveTrip")).toBe(
      "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
    );
    expect(localizeUserError("Passkey sign-in did not create a session.", t, "errors.unexpected")).toBe(
      "La clave de acceso no creó una sesión.",
    );
    expect(localizeThrownError(new Error(""), t, "Please try again.")).toBe("Inténtalo de nuevo.");
  });
});
