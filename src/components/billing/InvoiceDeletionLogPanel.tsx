import { format, parseISO } from "date-fns";
import { useInvoiceDeletionLog } from "@/hooks/useInvoices";
import { formatAed } from "@/hooks/useBilling";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function InvoiceDeletionLogPanel() {
  const { data: rows = [], isLoading, error } = useInvoiceDeletionLog();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invoice deletion log</CardTitle>
        <p className="text-sm text-muted-foreground">
          Audit trail when an invoice is deleted from the system.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">Could not load deletion log.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No deletions recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Invoice ID</TableHead>
                <TableHead>Owner name</TableHead>
                <TableHead className="text-right">Total amount</TableHead>
                <TableHead>Deleted by</TableHead>
                <TableHead>Deleted at</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.invoice_id ?? "—"}</TableCell>
                  <TableCell>{r.owner_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.total_amount != null ? formatAed(r.total_amount) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate text-xs" title={r.deleted_by ?? undefined}>
                    {r.deleted_by ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {r.deleted_at ? format(parseISO(r.deleted_at), "d MMM yyyy HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {r.reason?.trim() ? r.reason : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
