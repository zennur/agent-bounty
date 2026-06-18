import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function effectivePrice(basePriceSats: number, reputation: number): number {
  if (reputation >= 90) return Math.round(basePriceSats * 1.5);
  if (reputation >= 80) return Math.round(basePriceSats * 1.25);
  if (reputation >= 60) return Math.round(basePriceSats * 1.1);
  return basePriceSats;
}

export function reputationPremiumLabel(reputation: number): string | null {
  if (reputation >= 90) return "+50% Premium";
  if (reputation >= 80) return "+25% Premium";
  if (reputation >= 60) return "+10% Premium";
  return null;
}
