// server.js
import express from "express";
import crypto from "crypto";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ENV variables
const {
  MERCHANT_ACCOUNT,
  PAYWALL_SECRET_KEY,
  PAYWALL_URL,
  NOTIFICATION_KEY,
  BASE_URL,
} = process.env;

// 🟢 Route to start payment
app.get("/launch-paywall", (req, res) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    merchantAccount: MERCHANT_ACCOUNT,
    timestamp: timestamp,
    skin: "vps-1-vue",
    customerId: String(timestamp),
    customerCountry: "MA",
    customerLocale: "en_US",
    chargeId: String(timestamp),
    orderId: "order1",
    price: "10",
    currency: "MAD",
    description: "A Big Hat",
    mode: "DEEP_LINK",
    paymentMethod: "CREDIT_CARD",
    showPaymentProfiles: "false",
    callbackUrl: `${BASE_URL}/callback`,
    successUrl: `${BASE_URL}/success.html?orderId=order1`,
    failureUrl: `${BASE_URL}/failure.html`,
    cancelUrl: `${BASE_URL}/cancel.html`,
  };

  const jsonPayload = JSON.stringify(payload);
  const signature = crypto
    .createHash("sha256")
    .update(PAYWALL_SECRET_KEY + jsonPayload)
    .digest("hex");

  // HTML form auto-post
  const formHtml = `
    <form id="openPaywall" action="${PAYWALL_URL}" method="POST">
      <input type="hidden" name="payload" value='${jsonPayload}' />
      <input type="hidden" name="signature" value="${signature}" />
    </form>
    <script>document.getElementById("openPaywall").submit();</script>
  `;
  res.send(formHtml);
});

// 🟡 Payzone callback handler
// app.post("/callback", (req, res) => {
//   const input = JSON.stringify(req.body);
//   const calculatedSignature = crypto
//     .createHmac("sha256", NOTIFICATION_KEY)
//     .update(input)
//     .digest("hex");

//   const headerSignature =
//     req.headers["x-callback-signature"] || req.headers["X-Callback-Signature"];

//   if (
//     headerSignature &&
//     calculatedSignature.localeCompare(headerSignature, undefined, {
//       sensitivity: "accent",
//     }) === 0
//   ) {
//     const data = req.body;

//     if (data.status === "CHARGED") {
//       const approvedTx = data.transactions.find(
//         (t) => t.state === "APPROVED" && t.resultCode === 0
//       );

//       if (approvedTx) {
//         console.log("✅ Payment success:", approvedTx);
//         return res.json({ status: "OK", message: "Payment successful" });
//       } else {
//         console.log("⚠️ Payment status not approved:", data);
//         return res.json({ status: "KO", message: "Payment not approved" });
//       }
//     } else if (data.status === "DECLINED") {
//       console.log("❌ Payment declined:", data);
//       return res.json({ status: "KO", message: "Payment declined" });
//     } else {
//       console.log("❓ Unknown status:", data);
//       return res.json({ status: "KO", message: "Unknown status" });
//     }
//   } else {
//     console.log("🚫 Invalid signature");
//     return res.json({ status: "KO", message: "Invalid signature" });
//   }
// });


app.post("/callback", async (req, res) => {
  try {
    const input = JSON.stringify(req.body);
    const calculatedSignature = crypto
      .createHmac("sha256", NOTIFICATION_KEY)
      .update(input)
      .digest("hex");

    const headerSignature =
      req.headers["x-callback-signature"] ||
      req.headers["X-Callback-Signature"];

    if (!headerSignature || headerSignature !== calculatedSignature) {
      console.log("🚫 Invalid signature");
      return res.status(400).json({ status: "KO", message: "Invalid signature" });
    }

    const data = req.body;
    console.log("💬 Payzone callback status:", data.status);

    // 🔧 Optional: You can plug in your own logic later based on the status
    // if (data.status === "CHARGED") { ... }
    // else if (data.status === "DECLINED") { ... }

    return res.json({ status: "OK", message: "Status logged successfully" });
  } catch (err) {
    console.error("🔥 Error handling callback:", err);
    return res.status(500).json({ status: "KO", message: "Server error" });
  }
});


// 🟣 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Payzone Node server running on port ${PORT}`));
