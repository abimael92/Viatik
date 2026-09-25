export const FAMILY_ROLES = [
  "wife",
  "husband",
  "partner",
  "mother",
  "father",
  "sister",
  "brother",
  "daughter",
  "son",
  "grandmother",
  "grandfather",
  "aunt",
  "uncle",
  "cousin",
  "niece",
  "nephew",
  "other",
] as const;

export type FamilyRole = (typeof FAMILY_ROLES)[number];

export function isFamilyRole(value: string): value is FamilyRole {
  return (FAMILY_ROLES as readonly string[]).includes(value);
}

export const FAMILY_ROLE_LABELS = {
  wife: "copy.roleWife",
  husband: "copy.roleHusband",
  partner: "copy.rolePartner",
  mother: "copy.roleMother",
  father: "copy.roleFather",
  sister: "copy.roleSister",
  brother: "copy.roleBrother",
  daughter: "copy.roleDaughter",
  son: "copy.roleSon",
  grandmother: "copy.roleGrandmother",
  grandfather: "copy.roleGrandfather",
  aunt: "copy.roleAunt",
  uncle: "copy.roleUncle",
  cousin: "copy.roleCousin",
  niece: "copy.roleNiece",
  nephew: "copy.roleNephew",
  other: "copy.roleOtherFamily",
} as const;
