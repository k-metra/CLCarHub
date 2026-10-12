import type { DiscountStructure } from "../types";

export function discountPercent(structures: DiscountStructure[] | undefined, vehicleType: string | undefined, rentalDays: number): number {
  if (!vehicleType) return 0;
  return structures
    ?.filter(structure => structure.vehicle_types.includes(vehicleType))
    .flatMap(structure => structure.milestones)
    .filter(milestone => milestone.days <= rentalDays)
    .sort((a, b) => b.days - a.days)[0]?.discount_percent ?? 0;
}

export function discountedRental(baseRental: number, percent: number): number {
  return Math.max(0, baseRental * (1 - percent / 100));
}
