import { supabase } from "@/integrations/supabase/client";

/** Delete all rows in `table` where `column` equals `value`. */
export async function deleteChildRows(
  table: string,
  column: string,
  value: string,
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) throw error;
}

/** Throw if any child rows remain (e.g. RLS blocked the delete). */
export async function assertNoChildRows(
  table: string,
  column: string,
  value: string,
  errorMessage: string,
): Promise<void> {
  const { data, error } = await supabase.from(table).select("id").eq(column, value).limit(1);
  if (error) throw error;
  if (data && data.length > 0) {
    throw new Error(errorMessage);
  }
}
