import "./env";
import { runBilling } from "../src/domain/invoices";
import { pool } from "../src/lib/db";
async function run() {
  const result = await runBilling(null);
  console.log(JSON.stringify(result));
}
await run();
if (process.argv.includes("--watch")) {
  console.log(
    "Local billing worker checks due cycles every 60 seconds. Keep this process running.",
  );
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await run();
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Billing failed");
    } finally {
      running = false;
    }
  }, 60000);
} else await pool.end();
