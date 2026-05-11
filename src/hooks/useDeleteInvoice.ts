import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteInvoiceWithLog, type DeleteInvoiceWithLogInput } from "@/lib/deleteInvoice";

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteInvoiceWithLogInput) => deleteInvoiceWithLog(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", variables.invoiceUuid] });
    },
  });
}
