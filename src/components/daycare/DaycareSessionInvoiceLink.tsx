import { useNavigate } from "react-router-dom";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

type DaycareSessionInvoiceLinkProps = {
  invoiceId: string;
  className?: string;
  testId?: string;
};

export function DaycareSessionInvoiceLink({
  invoiceId,
  className = "w-full h-8 text-xs",
  testId = "daycare-view-invoice-btn",
}: DaycareSessionInvoiceLinkProps) {
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      data-testid={testId}
      onClick={() => navigate(`/billing/invoices/${invoiceId}`)}
    >
      <FileText className="mr-1.5 h-3.5 w-3.5" />
      View invoice
      <ExternalLink className="ml-1.5 h-3 w-3 opacity-60" />
    </Button>
  );
}
