"use client";

import {
  FileText,
  HeartHandshake,
  Mail,
  Pencil,
  Plane,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { Contact } from "@/features/domain/entities";

export function ContactDetailsDialog({
  open,
  contact,
  onOpenChange,
  onEdit,
}: {
  open: boolean;
  contact: Contact | null;
  onOpenChange: (open: boolean) => void;
  onEdit?: (contact: Contact) => void;
}) {
  if (!contact) return null;

  const isLinkedToViatik = Boolean(contact.linkedProfileId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-xl overflow-y-auto p-0">
        <DialogHeader className="border-b bg-muted/30 px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6 text-left">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <UserAvatar
              seed={contact.avatarSeed}
              src={contact.linkedAvatarUrl ?? contact.avatarUrl}
              name={contact.fullName}
              size="lg"
              className="size-14 sm:size-16 shrink-0 ring-2 ring-border/60 shadow-xs"
            />
            <div className="min-w-0 flex-1 space-y-1 sm:space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <DialogTitle className="text-lg sm:text-xl font-bold truncate">{contact.fullName}</DialogTitle>
                {isLinkedToViatik ? (
                  <Badge variant="default" className="gap-1 border-primary/30 bg-primary/10 text-primary text-[10px] font-semibold py-0.5 px-2">
                    <Sparkles className="size-3" />
                    {contact.linkedHandle ? `@${contact.linkedHandle}` : "Viatik"}
                  </Badge>
                ) : (
                  <Badge variant="muted" className="text-[10px] font-medium text-muted-foreground py-0.5 px-2">
                    Manual Contact
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <Badge variant="outline" className="text-[10px] capitalize font-medium py-0.5 px-2">
                  {contact.relationship}
                </Badge>
                <Badge variant="muted" className="text-[10px] capitalize font-medium py-0.5 px-2">
                  {contact.travelerType}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Read-only view of contact and travel preferences.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          {/* Identity & Account Info */}
          <Section icon={<User className="size-4" />} title="Identity & Account">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <DetailItem label="Full name" value={contact.fullName} />
              <DetailItem
                label="Account type"
                value={isLinkedToViatik ? "Linked Viatik Profile" : "Manual Contact"}
              />
              <DetailItem label="Relationship" value={contact.relationship} capitalize />
              <DetailItem label="Traveler type" value={contact.travelerType} capitalize />
            </div>
          </Section>

          {/* Contact Details */}
          <Section icon={<Mail className="size-4" />} title="Contact Details">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <DetailItem label="Email" value={contact.email} />
              <DetailItem label="Phone" value={contact.phone} />
            </div>
          </Section>

          {/* Emergency Contact */}
          {(contact.emergencyContactName ||
            contact.emergencyContactPhone ||
            contact.emergencyContactRelationship) && (
            <Section icon={<HeartHandshake className="size-4" />} title="Emergency Contact">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <DetailItem label="Contact name" value={contact.emergencyContactName} />
                <DetailItem
                  label="Relationship"
                  value={contact.emergencyContactRelationship}
                />
                <DetailItem
                  label="Emergency phone"
                  value={contact.emergencyContactPhone}
                  className="sm:col-span-2"
                />
              </div>
            </Section>
          )}

          {/* Travel & Preferences */}
          <Section icon={<Plane className="size-4" />} title="Travel & Logistics">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <DetailItem label="Date of birth" value={contact.birthDate} />
              <DetailItem label="Preferred language" value={contact.preferredLanguage} />
              <DetailItem label="Preferred currency" value={contact.preferredCurrency} />
              <DetailItem
                label="Dietary restrictions"
                value={
                  contact.dietaryRestrictions?.length
                    ? contact.dietaryRestrictions.join(", ")
                    : null
                }
              />
              <DetailItem
                label="Allergies"
                value={contact.allergies?.length ? contact.allergies.join(", ") : null}
              />
              <DetailItem
                label="Passport country"
                value={contact.passportIssuingCountry}
              />
              <DetailItem
                label="Passport expiration"
                value={contact.passportExpiresOn}
              />
            </div>
          </Section>

          {/* Notes */}
          {contact.notes && (
            <Section icon={<FileText className="size-4" />} title="Notes">
              <p className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                {contact.notes}
              </p>
            </Section>
          )}

          {isLinkedToViatik && (
            <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-primary" />
              <span>
                Name and avatar are verified and managed by their Viatik registration account.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 border-t bg-muted/20 px-4 py-3 sm:px-6 sm:py-4">
          <Button type="button" variant="outline" className="w-full sm:w-auto min-h-10" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onEdit && (
            <Button
              type="button"
              variant="primary"
              className="w-full sm:w-auto min-h-10"
              onClick={() => {
                onOpenChange(false);
                onEdit(contact);
              }}
            >
              <Pencil className="size-4" /> Edit Contact
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3.5 sm:p-4">
      <div className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-foreground">{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function DetailItem({
  label,
  value,
  capitalize,
  className,
}: {
  label: string;
  value?: string | null;
  capitalize?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-medium wrap-break-word ${value ? "text-foreground" : "text-muted-foreground/60"} ${capitalize ? "capitalize" : ""}`}>
        {value || "Not specified"}
      </p>
    </div>
  );
}
