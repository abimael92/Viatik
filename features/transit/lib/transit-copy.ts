import type { TransitMode, TransitStatusState } from "@/features/transit/domain/transit-types";
import type { TranslationKey } from "@/lib/i18n/translations";

export const TRANSIT_MODE_COPY: Record<TransitMode, TranslationKey> = {
  flight: "copy.transitModePlane",
  train: "copy.transitModeTrain",
  car: "copy.transitModeCar",
  carpool: "copy.transitModeCarpool",
  taxi: "copy.transitModeTaxi",
  rideshare: "copy.transitModeRideshare",
  bus: "copy.transitModeBus",
  ship: "copy.transitModeShip",
  ferry: "copy.transitModeFerry",
  bike: "copy.transitModeBike",
  walk: "copy.transitModeWalk",
};

export const TRANSIT_STATUS_COPY: Record<TransitStatusState, TranslationKey> = {
  scheduled: "copy.transitStatusScheduled",
  boarding: "copy.transitStatusBoarding",
  delayed: "copy.transitStatusDelayed",
  cancelled: "copy.transitStatusCancelled",
  departed: "copy.transitStatusDeparted",
  landed: "copy.transitStatusLanded",
  arrived: "copy.transitStatusArrived",
};
