import type { PartnerRecord } from "../types";

export function formatPartnerName(partner: Pick<PartnerRecord, "name" | "first_name" | "middle_name" | "last_name">): string {
  const firstName = partner.first_name?.trim();
  const middleName = partner.middle_name?.trim();
  const lastName = partner.last_name?.trim();

  if (!firstName || !lastName) {
    return partner.name;
  }

  return `${lastName}, ${firstName}${middleName ? ` ${middleName}` : ""}`;
}
