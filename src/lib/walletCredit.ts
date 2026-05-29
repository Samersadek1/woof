import { roundAed } from "@/lib/money";

export function ownerWalletCredit(walletBalance: number | null | undefined): number {
  return roundAed(Math.max(0, walletBalance ?? 0));
}

export function ownerHasWalletCredit(walletBalance: number | null | undefined): boolean {
  return ownerWalletCredit(walletBalance) > 0;
}
