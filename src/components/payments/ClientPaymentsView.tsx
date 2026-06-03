import { useMemo, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ChevronDown, Loader2, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountPaymentDialog } from "@/components/payments/AccountPaymentDialog";
import { StaffNameSelect } from "@/components/staff/StaffNameSelect";
import {
  useClientPaymentSummary,
  useLogPaymentReminder,
} from "@/hooks/useClientPaymentSummary";
import { useCurrentStaffName } from "@/hooks/useCurrentStaffName";
import { formatAed } from "@/lib/money";
import { buildAccountReminderWhatsAppUrl } from "@/lib/whatsappInvoiceReminder";
import { cn } from "@/lib/utils";
import type { ClientPaymentSummary } from "@/types/clientPayment";

const STATUS_BADGE: Record<string, string> = {
  draft: "border-slate-300 text-slate-700 bg-slate-50",
  finalised: "border-blue-300 text-blue-700 bg-blue-50",
  outstanding: "border-amber-300 text-amber-700 bg-amber-50",
  overdue: "border-red-300 text-red-700 bg-red-50",
  partially_paid: "border-amber-300 text-amber-700 bg-amber-50",
  issued: "border-sky-300 text-sky-700 bg-sky-50",
  paid: "border-emerald-300 text-emerald-700 bg-emerald-50",
};

function ownerDisplayName(summary: ClientPaymentSummary): string {
  return [summary.owner.first_name, summary.owner.last_name].filter(Boolean).join(" ").trim() || "—";
}

function formatServiceType(serviceType: string): string {
  if (serviceType === "other") return "Other";
  return serviceType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPaymentMethod(method: string): string {
  return method.replace(/_/g, " ");
}

type ServiceGroup = ClientPaymentSummary["service_breakdown"][number];

function ServiceGroupCollapsible({
  group,
  muted,
}: {
  group: ServiceGroup;
  muted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const invoiceCount = group.invoices.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn(muted && "opacity-80")}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/40">
        <span className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
          <span className="font-medium capitalize">{formatServiceType(group.service_type)}</span>
          <Badge variant="outline" className="text-xs tabular-nums">
            {invoiceCount} invoice{invoiceCount !== 1 ? "s" : ""}
          </Badge>
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{formatAed(group.total_balance)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-1.5 pl-1">
        {group.invoices.map((inv) => (
          <Link
            key={inv.id}
            to={`/billing/invoices/${inv.id}`}
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40"
          >
            <span className="min-w-0 space-y-0.5">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs">
                  {inv.invoice_number ?? inv.id.slice(0, 8)}
                </span>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] capitalize", STATUS_BADGE[inv.status] ?? "")}
                >
                  {inv.status.replace(/_/g, " ")}
                </Badge>
              </span>
              {inv.days_overdue > 0 ? (
                <span className="text-xs text-red-600">{inv.days_overdue}d overdue</span>
              ) : null}
            </span>
            <span className="shrink-0 font-medium tabular-nums">{formatAed(inv.balance)}</span>
          </Link>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ClientPaymentsView({ ownerId }: { ownerId: string }) {
  const { data: summary, isLoading, isError, error } = useClientPaymentSummary(ownerId);
  const logReminder = useLogPaymentReminder();
  const { staffName: defaultStaffName } = useCurrentStaffName();

  const [payOpen, setPayOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderStaff, setReminderStaff] = useState("");
  const [recentOpen, setRecentOpen] = useState(false);

  const collectableGroups = useMemo(
    () => summary?.service_breakdown.filter((g) => !g.is_draft) ?? [],
    [summary],
  );

  const inProgressGroups = useMemo(
    () => summary?.service_breakdown.filter((g) => g.is_draft) ?? [],
    [summary],
  );

  const handleOpenReminder = () => {
    setReminderStaff(defaultStaffName);
    setReminderOpen(true);
  };

  const handleSendReminder = async () => {
    if (!summary) return;
    const sentBy = reminderStaff.trim();
    if (!sentBy) {
      toast.error("Staff name is required.");
      return;
    }
    const url = buildAccountReminderWhatsAppUrl({
      phone: summary.owner.phone,
      ownerName: ownerDisplayName(summary),
      totalDueAed: summary.due_now,
    });
    if (!url) {
      toast.error("No phone number on file.");
      return;
    }
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      await logReminder.mutateAsync({
        ownerId,
        amountAtTime: summary.due_now,
        sentBy,
        channel: "whatsapp",
      });
      toast.success("Reminder logged.");
      setReminderOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not log reminder.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load payment summary."}
      </p>
    );
  }

  const name = ownerDisplayName(summary);
  const settled = summary.due_now === 0 && summary.in_progress === 0;
  const canRemind = summary.due_now > 0 && Boolean(summary.owner.phone?.trim());
  const canCollect = summary.due_now > 0;

  return (
    <div className="space-y-6">
      {/* Client header */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{name}</h2>
        {summary.owner.phone ? (
          <p className="text-sm text-muted-foreground">{summary.owner.phone}</p>
        ) : null}
        {summary.owner.pets.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {summary.owner.pets.map((pet) => (
              <Badge key={pet.id} variant="outline">
                {pet.name ?? "Pet"}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {settled ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            All settled — nothing due
          </CardContent>
        </Card>
      ) : null}

      {/* Balance cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Due now</p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums mt-1",
                summary.due_now > 0 && "text-red-600",
              )}
            >
              {formatAed(summary.due_now)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Accruing, not yet due</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-muted-foreground">
              {formatAed(summary.in_progress)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Held separate</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-700">
              {formatAed(summary.wallet_credit)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Wallet credit</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm">
        <span className="text-muted-foreground">Net position </span>
        <span
          className={cn(
            "font-semibold tabular-nums",
            summary.net_position < 0 ? "text-red-600" : "text-emerald-700",
          )}
        >
          {formatAed(summary.net_position)}
        </span>
      </p>

      {/* Aging */}
      {summary.due_now > 0 ? (
        <p className="text-sm text-muted-foreground">
          <span>Current </span>
          <span className="tabular-nums">{formatAed(summary.aging.current)}</span>
          <span> · 30d </span>
          <span
            className={cn(
              "tabular-nums",
              summary.aging.d30 > 0 && "font-semibold text-amber-800",
            )}
          >
            {formatAed(summary.aging.d30)}
          </span>
          <span> · 60d </span>
          <span
            className={cn(
              "tabular-nums",
              summary.aging.d60 > 0 && "font-semibold text-amber-900",
            )}
          >
            {formatAed(summary.aging.d60)}
          </span>
          <span> · 90d+ </span>
          <span
            className={cn(
              "tabular-nums",
              summary.aging.d90plus > 0 && "font-semibold text-red-700",
            )}
          >
            {formatAed(summary.aging.d90plus)}
          </span>
        </p>
      ) : null}

      {/* Service breakdown */}
      {(collectableGroups.length > 0 || inProgressGroups.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">By service</h3>
          <div className="space-y-2">
            {collectableGroups.map((group) => (
              <ServiceGroupCollapsible
                key={`${group.service_type}-collectable-${group.invoices.map((i) => i.id).join("-")}`}
                group={group}
              />
            ))}
          </div>
          {inProgressGroups.length > 0 ? (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                In progress
              </p>
              {inProgressGroups.map((group) => (
                <ServiceGroupCollapsible
                  key={`${group.service_type}-draft-${group.invoices.map((i) => i.id).join("-")}`}
                  group={group}
                  muted
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Last reminder */}
      <p className="text-sm text-muted-foreground">
        {summary.last_reminder ? (
          <>
            Last reminder:{" "}
            {formatDistanceToNow(parseISO(summary.last_reminder.sent_at), { addSuffix: true })} via{" "}
            {summary.last_reminder.channel}
          </>
        ) : (
          "No reminders sent."
        )}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!canCollect} onClick={() => setPayOpen(true)}>
          Collect payment
        </Button>
        <Button
          variant="outline"
          disabled={!canRemind || logReminder.isPending}
          onClick={handleOpenReminder}
        >
          {logReminder.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="mr-2 h-4 w-4" />
          )}
          Send WhatsApp reminder
        </Button>
      </div>

      {/* Recent payments */}
      {summary.recent_payments.length > 0 ? (
        <Collapsible open={recentOpen} onOpenChange={setRecentOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 text-sm font-semibold hover:underline">
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", recentOpen && "rotate-180")}
            />
            Recent payments ({summary.recent_payments.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-1.5">
            {summary.recent_payments.map((p, idx) => (
              <div
                key={`${p.created_at}-${p.amount}-${idx}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground capitalize">
                  {formatPaymentMethod(p.payment_method)}
                  {p.invoice_number ? ` · ${p.invoice_number}` : ""}
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(p.created_at), "d MMM yyyy")}
                  </span>
                  <span className="font-medium">{formatAed(p.amount)}</span>
                </span>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <AccountPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        ownerId={ownerId}
        totalDue={summary.due_now}
        ownerName={name}
        defaultStaffName={defaultStaffName}
      />

      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send WhatsApp reminder</DialogTitle>
            <DialogDescription>
              Opens WhatsApp with a payment reminder for {formatAed(summary.due_now)} outstanding.
            </DialogDescription>
          </DialogHeader>
          <StaffNameSelect value={reminderStaff} onChange={setReminderStaff} label="Sent by" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>
              Cancel
            </Button>
            <Button disabled={logReminder.isPending} onClick={() => void handleSendReminder()}>
              {logReminder.isPending ? "Logging…" : "Open WhatsApp & log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
