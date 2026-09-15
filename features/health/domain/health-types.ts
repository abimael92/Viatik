/**
 * Travel Health & Document Expiry domain entities. Local-only: identity
 * documents are private, per-device records (like `profiles` and packing
 * lists) and never sync to Supabase.
 */

export type TravelDocumentType = "passport" | "visa" | "insurance" | "vaccination";

export const TRAVEL_DOCUMENT_TYPES: TravelDocumentType[] = [
  "passport",
  "visa",
  "insurance",
  "vaccination",
];

export const TRAVEL_DOCUMENT_TYPE_LABELS: Record<TravelDocumentType, string> = {
  passport: "Passport",
  visa: "Visa",
  insurance: "Travel insurance",
  vaccination: "Vaccination record",
};

/**
 * A personal identity / travel document tracked against expiry.
 *
 * - `expiryDate` is the single date that matters for boarding checks.
 * - `countries` lists where the document applies; combined with the trip
 *   destination it drives compliance rules (e.g. Schengen 3-month rule).
 */
export interface TravelDocument {
  id: string;
  userId: string;
  type: TravelDocumentType;
  documentNumber: string | null;
  countryOfIssue: string | null;
  issuedOn: string | null; // ISO yyyy-mm-dd
  expiryDate: string; // ISO yyyy-mm-dd
  /** Country names (or ISO codes) this document is valid in. */
  countries: string[];
  notes: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  deletedAt: string | null;
}

export interface TravelDocumentRepository {
  listByUser(userId: string): Promise<TravelDocument[]>;
  watchByUser(userId: string, onChange: (documents: TravelDocument[]) => void): () => void;
  upsert(document: TravelDocument): Promise<void>;
  remove(id: string): Promise<void>;
}
