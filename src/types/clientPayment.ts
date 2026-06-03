export interface ClientPaymentSummary {
  owner: {
    owner_id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    pets: { id: string; name: string | null }[];
  };
  wallet_credit: number;
  due_now: number;
  in_progress: number;
  net_position: number;
  aging: { current: number; d30: number; d60: number; d90plus: number };
  service_breakdown: {
    service_type: string;
    is_draft: boolean;
    total_balance: number;
    invoices: {
      id: string;
      invoice_number: string | null;
      status: string;
      balance: number;
      due_date: string | null;
      days_overdue: number;
    }[];
  }[];
  last_reminder: {
    channel: string;
    amount_at_time: number;
    sent_by: string;
    sent_at: string;
    notes: string | null;
  } | null;
  recent_payments: {
    amount: number;
    payment_method: string;
    created_at: string;
    recorded_by: string | null;
    invoice_number: string | null;
  }[];
}
