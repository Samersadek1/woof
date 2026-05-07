const http = require("node:http");
const path = require("node:path");
const dotenv = require("dotenv");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

dotenv.config();

const PORT = Number(process.env.PORT || 3001);
const WEB_CLIENT_ID = process.env.WEB_CLIENT_ID || "admin-essentials-agent";
const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || ".wwebjs_auth";
const CACHE_PATH = process.env.WWEBJS_CACHE_PATH || ".wwebjs_cache";

let readiness = "starting";

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: WEB_CLIENT_ID,
    dataPath: path.resolve(process.cwd(), AUTH_PATH),
  }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
  webVersionCache: {
    type: "local",
    path: path.resolve(process.cwd(), CACHE_PATH),
  },
});

client.on("qr", (qr) => {
  readiness = "awaiting_qr_scan";
  qrcode.generate(qr, { small: true });
  console.log("Scan the QR code above to authenticate this WhatsApp session.");
});

client.on("ready", () => {
  readiness = "ready";
  console.log("WhatsApp client is ready.");
});

client.on("authenticated", () => {
  readiness = "authenticated";
  console.log("WhatsApp session authenticated.");
});

client.on("auth_failure", (message) => {
  readiness = "auth_failure";
  console.error("WhatsApp authentication failed:", message);
});

client.on("disconnected", (reason) => {
  readiness = "disconnected";
  console.warn("WhatsApp client disconnected:", reason);
});

const healthServer = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: readiness }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("whatsapp-agent running");
});

healthServer.listen(PORT, () => {
  console.log(`Health endpoint listening on :${PORT}`);
});

client.initialize().catch((error) => {
  readiness = "init_error";
  console.error("Failed to initialize WhatsApp client:", error);
  process.exitCode = 1;
});
