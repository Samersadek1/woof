import { useMemo, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search } from "lucide-react";
import { ClientPaymentsView } from "@/components/payments/ClientPaymentsView";
import TopBar from "@/components/dashboard/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOwnersWithDebt, type OwnerWithCollectableDebt } from "@/hooks/useOwnersWithDebt";
import { formatAed } from "@/lib/money";
import { cn } from "@/lib/utils";

type SortKey = "due_now" | "overdue_now" | "in_progress" | "max_days_overdue";

function displayOwnerName(name: string): string {
  return name.trim() || "—";
}

function SortableHead({
  label,
  columnKey,
  activeKey,
  sortDesc,
  onSort,
  className,
}: {
  label: string;
  columnKey: SortKey;
  activeKey: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === columnKey;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground",
        className,
      )}
      onClick={() => onSort(columnKey)}
      aria-sort={active ? (sortDesc ? "descending" : "ascending") : "none"}
    >
      <span>{label}</span>
      {active ? (
        sortDesc ? (
          <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden />
      )}
    </button>
  );
}

const PaymentsPage = () => {
  const { data: rows = [], isLoading, isError, error } = useOwnersWithDebt();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("due_now");
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  const selectedOwner = useMemo(
    () => rows.find((r) => r.owner_id === selectedOwnerId) ?? null,
    [rows, selectedOwnerId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? rows.filter((r) => displayOwnerName(r.owner_name).toLowerCase().includes(q))
      : [...rows];

    list.sort((a, b) => {
      const av = Number(a[sortKey] ?? 0);
      const bv = Number(b[sortKey] ?? 0);
      return sortDesc ? bv - av : av - bv;
    });
    return list;
  }, [rows, search, sortKey, sortDesc]);

  const totalCollectable = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.due_now ?? 0), 0),
    [rows],
  );
  const totalCollectableOverdue = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.overdue_now ?? 0), 0),
    [rows],
  );
  const totalCollectableInProgress = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.in_progress ?? 0), 0),
    [rows],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const openOwner = (ownerId: string) => setSelectedOwnerId(ownerId);

  return (
    <>
      <TopBar title="Payments" />
      <main className="flex-1 overflow-auto p-8 space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">Total collectable</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-red-600">
                {isLoading ? "…" : formatAed(totalCollectable)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">Total collectable (overdue)</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-red-600">
                {isLoading ? "…" : formatAed(totalCollectableOverdue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">Total collectable (in progress)</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-slate-700">
                {isLoading ? "…" : formatAed(totalCollectableInProgress)}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by client name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="payments-search"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : isError ? (
              <p className="p-6 text-sm text-destructive">
                {error instanceof Error ? error.message : "Could not load payments list."}
              </p>
            ) : filtered.length === 0 ? (
              <p className="p-12 text-center text-sm text-muted-foreground">
                {rows.length === 0 ? "No clients with open balances" : "No clients match your search."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="min-w-[180px]">Client</TableHead>
                    <TableHead className="text-right min-w-[130px]">
                      <SortableHead
                        label="Total collectable"
                        columnKey="due_now"
                        activeKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={toggleSort}
                        className="ml-auto"
                      />
                    </TableHead>
                    <TableHead className="text-right min-w-[130px]">
                      <SortableHead
                        label="Overdue"
                        columnKey="overdue_now"
                        activeKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={toggleSort}
                        className="ml-auto"
                      />
                    </TableHead>
                    <TableHead className="text-right min-w-[130px]">
                      <SortableHead
                        label="In progress"
                        columnKey="in_progress"
                        activeKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={toggleSort}
                        className="ml-auto"
                      />
                    </TableHead>
                    <TableHead className="min-w-[140px]">
                      <SortableHead
                        label="Days overdue"
                        columnKey="max_days_overdue"
                        activeKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={toggleSort}
                      />
                    </TableHead>
                    <TableHead className="min-w-[120px]">Last reminder</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <OwnerDebtRow
                      key={row.owner_id}
                      row={row}
                      onOpen={() => openOwner(row.owner_id)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Sheet
        open={selectedOwnerId != null}
        onOpenChange={(open) => {
          if (!open) setSelectedOwnerId(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
          <SheetHeader className="px-6 pt-6 pb-2 shrink-0">
            <SheetTitle>Client payments</SheetTitle>
            <SheetDescription>
              {selectedOwner
                ? `${displayOwnerName(selectedOwner.owner_name)}${selectedOwner.phone ? ` · ${selectedOwner.phone}` : ""}`
                : "Loading…"}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0 px-6">
            <div className="pb-6 pr-3">
              {selectedOwnerId ? <ClientPaymentsView ownerId={selectedOwnerId} /> : null}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
};

function OwnerDebtRow({
  row,
  onOpen,
}: {
  row: OwnerWithCollectableDebt;
  onOpen: () => void;
}) {
  const draftOnly = row.due_now === 0 && row.in_progress > 0;
  const canCollect = row.due_now > 0;

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/40"
      onClick={onOpen}
      data-testid={`payments-row-${row.owner_id}`}
    >
      <TableCell>
        <div className="font-medium">{displayOwnerName(row.owner_name)}</div>
        {row.phone ? (
          <div className="text-xs text-muted-foreground">{row.phone}</div>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums font-semibold text-red-600">
        {row.due_now > 0 ? formatAed(row.due_now) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums font-semibold text-red-600">
        {row.overdue_now > 0 ? formatAed(row.overdue_now) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {row.in_progress > 0 ? formatAed(row.in_progress) : "—"}
      </TableCell>
      <TableCell>
        {row.max_days_overdue > 0 ? (
          <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">
            {row.max_days_overdue}d overdue
          </Badge>
        ) : draftOnly ? (
          <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50">
            Draft only
          </Badge>
        ) : row.oldest_due_date ? (
          <span className="text-sm tabular-nums">
            {format(parseISO(row.oldest_due_date), "d MMM yyyy")}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.last_reminder_at
          ? formatDistanceToNow(parseISO(row.last_reminder_at), { addSuffix: true })
          : "—"}
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          data-testid={`payments-collect-btn-${row.owner_id}`}
        >
          {canCollect ? "Collect" : "View"}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default PaymentsPage;
