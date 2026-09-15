"use client";

import { AlertTriangle, BadgeCheck, FileText, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { healthRepository } from "@/features/health/data/dexie-health-repository";
import {
  TRAVEL_DOCUMENT_TYPE_LABELS,
  TRAVEL_DOCUMENT_TYPES,
  type TravelDocument,
  type TravelDocumentType,
} from "@/features/health/domain/health-types";
import {
  formatCountdown,
  validateDocument,
  type DocumentValidationResult,
} from "@/features/health/lib/document-validator";
import { cn } from "@/lib/utils";

type StatusStyle = { badge: string; dot: string; icon: typeof FileText };

const STATUS_STYLES: Record<DocumentValidationResult["status"], StatusStyle> = {
  valid: { badge: "bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500", icon: BadgeCheck },
  warning: { badge: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500", icon: AlertTriangle },
  invalid: { badge: "bg-destructive/10 text-destructive", dot: "bg-destructive", icon: XCircle },
};

const STATUS_LABELS: Record<DocumentValidationResult["status"], string> = {
  valid: "Valid",
  warning: "Expiring soon",
  invalid: "Action needed",
};

interface DocumentFormState {
  type: TravelDocumentType;
  documentNumber: string;
  countryOfIssue: string;
  issuedOn: string;
  expiresOn: string;
  countries: string;
  notes: string;
}

const EMPTY_FORM: DocumentFormState = {
  type: "passport",
  documentNumber: "",
  countryOfIssue: "",
  issuedOn: "",
  expiresOn: "",
  countries: "",
  notes: "",
};

function toForm(document: TravelDocument): DocumentFormState {
  return {
    type: document.type,
    documentNumber: document.documentNumber ?? "",
    countryOfIssue: document.countryOfIssue ?? "",
    issuedOn: document.issuedOn ?? "",
    expiresOn: document.expiryDate,
    countries: document.countries.join(", "),
    notes: document.notes ?? "",
  };
}

/**
 * Travel Health & Document Expiry Tracker. Shows personal identity documents
 * (passport, visa, insurance, vaccination) as color-coded status cards with
 * countdowns, and audits them against the destination's entry requirements so
 * travelers catch boarding risks early. Local-first via Dexie.
 */
export function DocumentTrackerView({
  userId,
  destination,
  travelDate,
}: {
  userId: string;
  destination?: string | null;
  travelDate?: string | null;
}) {
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [dialog, setDialog] = useState<{ open: boolean; editing: TravelDocument | null }>({ open: false, editing: null });

  useEffect(() => healthRepository.watchByUser(userId, setDocuments), [userId]);

  const summary = useMemo(() => {
    const counts = { valid: 0, warning: 0, invalid: 0 };
    for (const document of documents) {
      counts[validateDocument(document, { destination, travelDate }).status] += 1;
    }
    return counts;
  }, [documents, destination, travelDate]);

  const openAdd = () => setDialog({ open: true, editing: null });
  const openEdit = (document: TravelDocument) => setDialog({ open: true, editing: document });

  return (
    <section aria-labelledby="health-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" aria-hidden />
          </span>
          <div>
            <Heading level={2} id="health-heading" className="text-xl font-bold">
              Documents & health
            </Heading>
            <p className="text-sm text-muted-foreground">
              Passports, visas, and records checked against this trip’s entry rules.
            </p>
          </div>
        </div>
        <Button type="button" variant="primary" onClick={openAdd}>
          <Plus className="size-4" /> Add document
        </Button>
      </div>

      {documents.length > 0 && (
        <div className="flex flex-wrap gap-2" role="status" aria-live="polite">
          <SummaryChip label="Valid" count={summary.valid} className="bg-emerald-500/10 text-emerald-600" />
          <SummaryChip label="Expiring soon" count={summary.warning} className="bg-amber-500/10 text-amber-600" />
          <SummaryChip label="Action needed" count={summary.invalid} className="bg-destructive/10 text-destructive" />
        </div>
      )}

      {documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <Heading level={3} className="mt-3 text-base font-semibold">
            No documents tracked
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your passport, visa, insurance, or vaccination record to get expiry alerts before you fly.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {documents.map((document) => {
            const result = validateDocument(document, { destination, travelDate });
            const style = STATUS_STYLES[result.status];
            const Icon = style.icon;
            return (
              <div key={document.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", style.badge)}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{TRAVEL_DOCUMENT_TYPE_LABELS[document.type]}</p>
                      {document.documentNumber && (
                        <p className="text-xs text-muted-foreground font-mono">{document.documentNumber}</p>
                      )}
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", style.badge)}>
                    {STATUS_LABELS[result.status]}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <p className={cn("flex items-center gap-2 font-semibold", result.status !== "valid" && "text-foreground")}>
                    <span className={cn("size-2 rounded-full", style.dot)} aria-hidden />
                    {formatCountdown(result.daysRemaining)}
                  </p>
                  <p className="text-xs">{result.message}</p>
                  <p className="text-xs">Expires {document.expiryDate}</p>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEdit(document)}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void healthRepository.remove(document.id)}
                  >
                    <Trash2 className="size-4" /> Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DocumentDialog
        userId={userId}
        destination={destination}
        open={dialog.open}
        editing={dialog.editing}
        onOpenChange={(open) => setDialog({ open, editing: dialog.editing })}
        onSaved={() => setDialog({ open: false, editing: null })}
      />
    </section>
  );
}

function SummaryChip({ label, count, className }: { label: string; count: number; className: string }) {
  if (count === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", className)}>
      {count} {label}
    </span>
  );
}

function DocumentDialog({
  userId,
  destination,
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  userId: string;
  destination?: string | null;
  open: boolean;
  editing: TravelDocument | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DocumentFormDialog
          key={editing?.id ?? "new"}
          userId={userId}
          destination={destination}
          initial={editing}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

/**
 * Rendered as a keyed child of the Dialog so it remounts fresh for each open
 * target — initial state derives from props instead of being reset in an
 * effect (avoids a cascading setState-in-effect warning).
 */
function DocumentFormDialog({
  userId,
  destination,
  initial,
  onClose,
  onSaved,
}: {
  userId: string;
  destination?: string | null;
  initial: TravelDocument | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<DocumentFormState>(() => (initial ? toForm(initial) : EMPTY_FORM));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof DocumentFormState>(key: K, value: DocumentFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.expiresOn) {
      setError("Expiry date is required.");
      return;
    }
    const now = new Date().toISOString();
    const document: TravelDocument = {
      id: initial?.id ?? crypto.randomUUID(),
      userId,
      type: form.type,
      documentNumber: form.documentNumber.trim() || null,
      countryOfIssue: form.countryOfIssue.trim() || null,
      issuedOn: form.issuedOn || null,
      expiryDate: form.expiresOn,
      countries: form.countries
        .split(",")
        .map((country) => country.trim())
        .filter(Boolean),
      notes: form.notes.trim() || null,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    setSaving(true);
    setError(null);
    try {
      await healthRepository.upsert(document);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save document.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit document" : "Add a document"}</DialogTitle>
        <DialogDescription>
          {initial
            ? "Update this document’s details."
            : destination
              ? "Checked against this trip’s entry rules."
              : "Enter the details to track it against your trips."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="doc-type">Type</Label>
            <select
              id="doc-type"
              value={form.type}
              onChange={(event) => set("type", event.target.value as TravelDocumentType)}
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TRAVEL_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TRAVEL_DOCUMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="doc-number">Document number</Label>
            <Input
              id="doc-number"
              value={form.documentNumber}
              onChange={(event) => set("documentNumber", event.target.value)}
              placeholder="e.g. AB1234567"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="doc-issued">Issue date</Label>
            <Input id="doc-issued" type="date" value={form.issuedOn} onChange={(event) => set("issuedOn", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="doc-expires">
              Expiry date <span className="text-destructive">*</span>
            </Label>
            <Input id="doc-expires" type="date" required value={form.expiresOn} onChange={(event) => set("expiresOn", event.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="doc-country">Country of issue</Label>
          <Input id="doc-country" value={form.countryOfIssue} onChange={(event) => set("countryOfIssue", event.target.value)} placeholder="e.g. United States" />
        </div>

        <div>
          <Label htmlFor="doc-countries">Applies in (comma-separated)</Label>
          <Input id="doc-countries" value={form.countries} onChange={(event) => set("countries", event.target.value)} placeholder="e.g. United States, Canada" />
        </div>

        <div>
          <Label htmlFor="doc-notes">Notes</Label>
          <Input id="doc-notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Optional" />
        </div>

        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add document"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
