import type { AddonPricingTier } from "../types";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

export function addonTierLabel(tier: AddonPricingTier): string {
  const price = money.format(Number(tier.price));
  if (tier.billing === "per_day") {
    return tier.to_day == null ? `${price}/day after` : `${price}/day for days ${tier.from_day}-${tier.to_day}`;
  }
  if (tier.to_day != null && tier.from_day === 1) {
    return tier.to_day === 1 ? `${price} for 1 day` : `${price} for ${tier.to_day} days`;
  }
  return tier.to_day == null ? `${price} one-time` : `${price} for days ${tier.from_day}-${tier.to_day}`;
}

export function addonPricingLabel(tiers: AddonPricingTier[]): string {
  return tiers.map(addonTierLabel).join(", ");
}

export function addonChargeLabel(tiers: AddonPricingTier[], rentalDays: number): string {
  return tiers.map(tier => {
    const from = Number(tier.from_day);
    const to = tier.to_day == null ? rentalDays : Math.min(rentalDays, Number(tier.to_day));
    const days = Math.max(0, to - from + 1);
    if (days === 0) return "";
    const price = money.format(Number(tier.price));
    if (tier.billing === "per_day") return `${price}/day × ${days} day${days === 1 ? "" : "s"}`;
    return `${price} one-time for ${days} day${days === 1 ? "" : "s"}`;
  }).filter(Boolean).join(" + ");
}
