/**
 * One-shot: reprice all existing boarding invoices for current peak/off-peak calendar.
 *
 * Usage (from repo root, requires .env with VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx scripts/reprice-boarding-invoices.ts
 */
import { config as loadEnv } from "dotenv";
import process from "node:process";

loadEnv();
loadEnv({ path: ".env.test", override: false });

async function main() {
  const { getServiceRoleClient } = await import("../tests/helpers/supabaseTestClient.ts");
  const { setSupabaseClient } = await import("../src/lib/supabaseRuntime.ts");
  setSupabaseClient(getServiceRoleClient());

  const { repriceAllBoardingInvoices } = await import("../src/lib/boardingInvoiceSync.ts");

  let lastDone = 0;
  let lastTotal = 0;
  const result = await repriceAllBoardingInvoices({
    onProgress: (done, total) => {
      if (done !== lastDone || total !== lastTotal) {
        lastDone = done;
        lastTotal = total;
        process.stdout.write(`\rRepricing ${done}/${total}…`);
      }
    },
  });

  process.stdout.write("\n");
  console.log(JSON.stringify(result, null, 2));

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
