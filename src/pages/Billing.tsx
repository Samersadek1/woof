import { useState, useRef, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { useOwners } from "@/hooks/useOwners";
import { useOwner } from "@/hooks/useOwners";
import {
  useWalletTransactions,
  useTopUpWallet,
  useDeductWallet,
  type WalletTransaction,
} from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type MemberType = Database["public"]["Enums"]["member_type"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type TransactionType = Database["public"]["Enums"]["transaction_type"];

// ── Constants ─────────────────────────────────────────────────────────────────

const LOW_BALANCE_THRESHOLD = 500;

const MEMBER_BADGE: Record<MemberType, string> = {
  standard: "bg-slate-100 text-slate-700 border-slate-200",
  silver:   "bg-blue-50  text-blue-700  border-blue-200",
  gold:     "bg-amber-50 text-amber-700 border-amber-200",
};

const TX_BADGE: Record<TransactionType, { label: string; className: string }> = {
  top_up:        { label: "Top Up",        className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  deduction:     { label: "Deduction",     className: "bg-red-50    text-red-700     border-red-200"     },
  membership_fee:{ label: "Membership Fee",className: "bg-purple-50 text-purple-700  border-purple-200"  },
  refund:        { label: "Refund",        className: "bg-sky-50    text-sky-700     border-sky-200"     },
  adjustment:    { label: "Adjustment",    className: "bg-gray-100  text-gray-600    border-gray-200"    },
};

// ── WalletModal ───────────────────────────────────────────────────────────────

type ModalMode = "topup" | "deduct";

interface WalletModalProps {
  open: boolean;
  mode: ModalMode;
  ownerId: string;
  onClose: () => void;
}

function WalletModal({ open, mode, ownerId, onClose }: WalletModalProps) {
  const topUp  = useTopUpWallet();
  const deduct = useDeductWallet();

  const [amount, setAmount]    = useState("");
  const [method, setMethod]    = useState<PaymentMethod>("cash");
  const [notes, setNotes]      = useState("");

  const isPending = topUp.isPending || deduct.isPending;

  const reset = () => { setAmount(""); setMethod("cash"); setNotes(""); };

  const handleClose = () => { if (!isPending) { reset(); onClose(); } };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    const payload = {
      owner_id:       ownerId,
      amount:         numAmount,
      payment_method: method,
      notes:          notes.trim() || null,
    };

    const mutation   = mode === "topup" ? topUp : deduct;
    const successMsg = mode === "topup"
      ? `AED ${numAmount.toFixed(2)} added to wallet`
      : `AED ${numAmount.toFixed(2)} deducted from wallet`;

    mutation.mutate(payload, {
      onSuccess: () => { toast.success(successMsg); handleClose(); },
      onError:   (err) => toast.error(err.message || "Transaction failed"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "topup"
              ? <><ArrowUpCircle className="h-5 w-5 text-emerald-600" /> Top Up Wallet</>
              : <><ArrowDownCircle className="h-5 w-5 text-red-500"    /> Deduct from Wallet</>}
          </DialogTitle>
          <DialogDescription>
            {mode === "topup"
              ? "Add funds to the owner's wallet."
              : "Remove funds from the owner's wallet."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="tx_amount">
              Amount (AED) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tx_amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx_method">Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger id="tx_method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx_notes">Notes (optional)</Label>
            <Textarea
              id="tx_notes"
              rows={2}
              placeholder="e.g. monthly top-up"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className={mode === "topup"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-destructive hover:bg-destructive/90"}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "topup" ? "Add Funds" : "Deduct"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── TransactionRow ────────────────────────────────────────────────────────────

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const isCredit = tx.amount > 0;
  const badge    = TX_BADGE[tx.transaction_type] ?? TX_BADGE.adjustment;

  return (
    <TableRow>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {format(parseISO(tx.created_at), "d MMM yyyy, HH:mm")}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={badge.className}>
          {badge.label}
        </Badge>
      </TableCell>
      <TableCell className="text-sm max-w-[200px] truncate" title={tx.notes ?? ""}>
        {tx.notes || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell
        className={`text-sm font-semibold tabular-nums text-right whitespace-nowrap ${
          isCredit ? "text-emerald-600" : "text-red-500"
        }`}
      >
        {isCredit ? "+" : ""}
        {tx.amount.toFixed(2)}
      </TableCell>
      <TableCell className="text-sm tabular-nums text-right whitespace-nowrap text-muted-foreground">
        AED {tx.balance_after.toFixed(2)}
      </TableCell>
    </TableRow>
  );
}

// ── OwnerSearchBar ────────────────────────────────────────────────────────────

interface OwnerSearchBarProps {
  onSelect: (id: string, label: string) => void;
  selectedLabel: string | null;
  selectedOwnerId: string | null;
  onClear: () => void;
}

function OwnerSearchBar({
  onSelect,
  selectedLabel,
  selectedOwnerId,
  onClear,
}: OwnerSearchBarProps) {
  const navigate = useNavigate();
  const [query, setQuery]     = useState("");
  const [open, setOpen]       = useState(false);
  const wrapperRef            = useRef<HTMLDivElement>(null);

  const { data: owners, isLoading } = useOwners(query.length >= 1 ? query : undefined);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selectedLabel && selectedOwnerId) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 max-w-lg">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <button
          type="button"
          className="flex-1 min-w-0 text-left text-sm font-medium hover:underline truncate"
          onClick={() => navigate(`/customers/${selectedOwnerId}`)}
        >
          {selectedLabel}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full p-0.5 hover:bg-muted transition-colors shrink-0"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative max-w-lg">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        className="pl-9"
        placeholder="Search owner by name or phone…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />

      {open && query.length >= 1 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !owners || owners.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No owners found</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y">
              {owners.map((o) => {
                const label = `${o.first_name} ${o.last_name}`;
                return (
                  <li key={o.id} className="flex items-stretch">
                    <button
                      type="button"
                      className="flex-1 min-w-0 flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-muted/60 text-left transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault(); // prevent blur closing before click
                        onSelect(o.id, label);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      <span className="font-medium truncate">{label}</span>
                      <span className="text-muted-foreground text-xs shrink-0">{o.phone}</span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 px-3 flex items-center justify-center border-l hover:bg-muted/80 transition-colors"
                      title="Open profile"
                      aria-label={`Open profile for ${label}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        navigate(`/customers/${o.id}`);
                        setOpen(false);
                      }}
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const BillingPage = () => {
  const navigate = useNavigate();

  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedLabel,   setSelectedLabel]   = useState<string | null>(null);
  const [modalMode,       setModalMode]       = useState<ModalMode | null>(null);

  const { data: owner, isLoading: ownerLoading } = useOwner(selectedOwnerId ?? "");
  const { data: transactions, isLoading: txLoading } = useWalletTransactions(selectedOwnerId ?? "");

  const handleSelect = (id: string, label: string) => {
    setSelectedOwnerId(id);
    setSelectedLabel(label);
  };

  const handleClear = () => {
    setSelectedOwnerId(null);
    setSelectedLabel(null);
  };

  const balance = owner?.wallet_balance ?? 0;
  const isLowBalance = balance < LOW_BALANCE_THRESHOLD;

  return (
    <>
      <TopBar title="Billing & Wallets" />
      <main className="flex-1 overflow-auto p-8 space-y-6">

        {/* Search bar */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Select Owner
          </p>
          <OwnerSearchBar
            onSelect={handleSelect}
            selectedLabel={selectedLabel}
            selectedOwnerId={selectedOwnerId}
            onClear={handleClear}
          />
        </div>

        {/* Empty state */}
        {!selectedOwnerId && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              Search for an owner above to view their wallet
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Type a name or phone number to get started
            </p>
          </div>
        )}

        {/* Owner selected — wallet card + transactions */}
        {selectedOwnerId && (
          <>
            {/* Wallet card */}
            {ownerLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : owner ? (
              <>
                {/* Low balance banner */}
                {isLowBalance && (
                  <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      Low wallet balance — current balance is{" "}
                      <strong>AED {balance.toFixed(2)}</strong>. Consider topping up.
                    </span>
                  </div>
                )}

                <Card>
                  <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
                    {/* Owner info — whole block opens customer profile */}
                    <div
                      role="button"
                      tabIndex={0}
                      className="space-y-1.5 cursor-pointer rounded-lg p-1 -m-1 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => navigate(`/customers/${owner.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/customers/${owner.id}`);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-semibold">
                          {owner.first_name} {owner.last_name}
                        </h2>
                        <Badge
                          variant="outline"
                          className={MEMBER_BADGE[owner.member_type]}
                        >
                          {owner.member_type.charAt(0).toUpperCase() +
                            owner.member_type.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{owner.phone}</p>
                      <p className="flex items-center gap-1 text-xs text-primary">
                        <ExternalLink className="h-3 w-3" />
                        View owner profile
                      </p>
                    </div>

                    {/* Balance + actions */}
                    <div className="flex flex-col items-start gap-4 sm:items-end">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                          <Wallet className="h-3.5 w-3.5" /> Wallet Balance
                        </p>
                        <p
                          className={`mt-1 text-4xl font-bold tabular-nums ${
                            isLowBalance ? "text-amber-600" : ""
                          }`}
                        >
                          AED {balance.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => setModalMode("topup")}
                        >
                          <ArrowUpCircle className="mr-1.5 h-4 w-4" />
                          Top Up
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setModalMode("deduct")}
                        >
                          <ArrowDownCircle className="mr-1.5 h-4 w-4" />
                          Deduct
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <p className="text-muted-foreground">Owner not found.</p>
            )}

            {/* Transaction history */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Transaction History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {txLoading ? (
                  <div className="p-6 space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : !transactions || transactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <Wallet className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">No transactions yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="min-w-[160px]">Date & Time</TableHead>
                        <TableHead className="min-w-[140px]">Type</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right min-w-[100px]">Amount</TableHead>
                        <TableHead className="text-right min-w-[130px]">Balance After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TransactionRow key={tx.id} tx={tx} />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* Top-up / Deduct modal */}
      {selectedOwnerId && modalMode && (
        <WalletModal
          open={!!modalMode}
          mode={modalMode}
          ownerId={selectedOwnerId}
          onClose={() => setModalMode(null)}
        />
      )}
    </>
  );
};

export default BillingPage;
