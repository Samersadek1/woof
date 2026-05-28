import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Receipt, ScrollText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type BillingWorkspaceTab = "wallet" | "invoices" | "pricing" | "deletion-log";

type BillingWorkspaceTabsProps = {
  activeTab: BillingWorkspaceTab;
  onTabChange: (tab: BillingWorkspaceTab) => void;
  showInvoicesTab: boolean;
  invoicesListLabel?: string;
  walletContent: ReactNode;
  invoicesContent?: ReactNode;
  pricingContent: ReactNode;
  deletionLogContent: ReactNode;
};

export function BillingWorkspaceTabs({
  activeTab,
  onTabChange,
  showInvoicesTab,
  invoicesListLabel = "Invoices list",
  walletContent,
  invoicesContent,
  pricingContent,
  deletionLogContent,
}: BillingWorkspaceTabsProps) {
  const navigate = useNavigate();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as BillingWorkspaceTab)}
      data-testid="billing-workspace-tabs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <TabsList>
          <TabsTrigger value="wallet" data-testid="billing-tab-wallet">
            <Wallet className="mr-1.5 h-4 w-4" /> Wallet
          </TabsTrigger>
          {showInvoicesTab ? (
            <TabsTrigger value="invoices" data-testid="billing-tab-invoices">
              <FileText className="mr-1.5 h-4 w-4" /> Invoices
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="pricing" data-testid="billing-tab-pricing">
            <Receipt className="mr-1.5 h-4 w-4" /> Pricing
          </TabsTrigger>
          <TabsTrigger value="deletion-log" data-testid="billing-tab-deletion-log">
            <ScrollText className="mr-1.5 h-4 w-4" /> Deletion log
          </TabsTrigger>
        </TabsList>
        <Button size="sm" variant="outline" onClick={() => navigate("/billing/invoices")}>
          <FileText className="mr-1.5 h-4 w-4" /> {invoicesListLabel}
        </Button>
      </div>
      <TabsContent value="wallet" className="mt-6 space-y-6">
        {walletContent}
      </TabsContent>
      {showInvoicesTab && invoicesContent ? (
        <TabsContent value="invoices" className="mt-6 space-y-6">
          {invoicesContent}
        </TabsContent>
      ) : null}
      <TabsContent value="pricing" className="mt-6">
        {pricingContent}
      </TabsContent>
      <TabsContent value="deletion-log" className="mt-6">
        {deletionLogContent}
      </TabsContent>
    </Tabs>
  );
}
