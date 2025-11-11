import express from "express";
import crypto from "crypto";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// Capture raw body for signature validation
app.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ENV
const {
  MERCHANT_ACCOUNT,
  PAYWALL_SECRET_KEY,
  PAYWALL_URL,
  NOTIFICATION_KEY,
  BASE_URL,
} = process.env;

// =====================
// Launch Payzone
// =====================
app.get("/launch-paywall", (req, res) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const orderId = "order-" + timestamp; // dynamic order ID

  const payload = {
    merchantAccount: MERCHANT_ACCOUNT,
    timestamp: timestamp,
    skin: "vps-1-vue",
    customerId: String(timestamp),
    customerCountry: "MA",
    customerLocale: "en_US",
    chargeId: String(timestamp),
    orderId: orderId,
    price: "10",
    currency: "MAD",
    description: "A Big Hat",
    mode: "DEEP_LINK",
    paymentMethod: "CREDIT_CARD",
    showPaymentProfiles: "false",
    callbackUrl: `${BASE_URL}/callback`,
    successUrl: `${BASE_URL}/success.html?orderId=${orderId}`,
    failureUrl: `${BASE_URL}/failure.html`,
    cancelUrl: `${BASE_URL}/cancel.html`,
  };

  const jsonPayload = JSON.stringify(payload);
  const signature = crypto
    .createHash("sha256")
    .update(PAYWALL_SECRET_KEY + jsonPayload)
    .digest("hex");

  const formHtml = `
    <form id="openPaywall" action="${PAYWALL_URL}" method="POST">
      <input type="hidden" name="payload" value='${jsonPayload}' />
      <input type="hidden" name="signature" value="${signature}" />
    </form>
    <script>document.getElementById("openPaywall").submit();</script>
  `;

  res.send(formHtml);
});

// =====================
// Payzone callback
// =====================
app.post("/callback", (req, res) => {
   const dataa = req.body;
   console.log("Data: ", dataa);
   
  const raw = req.rawBody;
  const headerSignature =
    req.headers["x-callback-signature"] || req.headers["X-Callback-Signature"];

  const calculatedSignature = crypto
    .createHmac("sha256", NOTIFICATION_KEY)
    .update(raw)
    .digest("hex");

  if (!headerSignature || headerSignature !== calculatedSignature) {
    console.log("🚫 Invalid signature");
    return res.status(400).json({ status: "KO", message: "Invalid signature" });
  }

  const data = req.body;
  console.log("💬 Payzone callback status:", data.status);
  console.log("💡 Order ID:", data.orderId);

  // Here you can plug your own logic later
  // e.g., update Firebase, Xano, DB, etc.

  res.json({ status: "OK", message: "Callback received" });
});

// =====================
// Start server
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Payzone Node server running on port ${PORT}`));
