import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatWalletAed, roundAed } from "@/lib/money";

interface WalletBalanceDisplayProps {
  /** SOA closing K — when set, uses SOA display rules. */
  accountBalance?: number;
  /** Fallback when ledger K is unavailable (pre-migration). */
  walletBalance?: number;
  size?: "default" | "compact";
  amountClassName?: string;
  /** No-op in woof (no voucher sub-ledger). */
  showVoucherHint?: boolean;
  className?: string;
}

const outstandingBadgeClass =
  "mt-2 border-red-300 bg-red-50 text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 uppercase tracking-wide text-[10px] font-semibold tabular-nums";

export function OutstandingAmountBadge({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(outstandingBadgeClass, className)}>
      {formatWalletAed(amount)} outstanding
    </Badge>
  );
}

export function WalletBalanceDisplay({
  accountBalance,
  walletBalance = 0,
  size = "default",
  amountClassName,
  className,
}: WalletBalanceDisplayProps) {
  const fromSoa = accountBalance != null;
  const K = fromSoa ? accountBalance : walletBalance;

  const displayAmount = fromSoa
    ? roundAed(Math.max(0, K))
    : roundAed(Math.max(0, walletBalance));

  const walletOutstanding = fromSoa
    ? K < 0
      ? roundAed(Math.abs(K))
      : 0
    : 0;

  const showOutstandingBadge = fromSoa && K < 0;

  const sizeClass = size === "compact" ? "text-2xl" : "text-3xl";

  return (
    <div className={className}>
      <p
        className={cn(
          "font-bold tabular-nums mt-1",
          sizeClass,
          amountClassName,
          showOutstandingBadge && !amountClassName && "text-red-600 dark:text-red-400",
        )}
      >
        {formatWalletAed(displayAmount)}
      </p>
      {showOutstandingBadge && walletOutstanding > 0 && (
        <OutstandingAmountBadge amount={walletOutstanding} />
      )}
    </div>
  );
}
