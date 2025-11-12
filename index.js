import express from "express";
import crypto from "crypto";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs";



import admin from "firebase-admin"; 

dotenv.config();


// Initialize Firebase Admin using service account file
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();


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
  // const orderId = "order-" + timestamp; // dynamic order ID
  const orderId = req.query.order || `order-${Date.now()}`; // fallback to timestamp if not provided
  const price = req.query.price;
  const payload = {
    merchantAccount: MERCHANT_ACCOUNT,
    timestamp: timestamp,
    skin: "vps-1-vue",
    customerId: String(timestamp),
    customerCountry: "MA",
    customerLocale: "en_US",
    chargeId: String(timestamp),
    orderId: orderId,
    price: price,
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
// Test route to update Firestore manually
// =====================
// =====================
// Test route: update only if document exists
// =====================
app.get("/testumar", async (req, res) => {
  const orderId = req.query.order;

  if (!orderId) {
    return res.status(400).send("❌ Missing query parameter: order");
  }

  try {
    const orderRef = db.collection("passesOrders").doc(orderId);
    const docSnap = await orderRef.get();

    if (!docSnap.exists) {
      console.log(`⚠️ Document passesOrders/${orderId} does not exist`);
      return res.status(404).send(`⚠️ Document ${orderId} does not exist`);
    }

    // Only update status if document exists
    await orderRef.update({
      status: "test umar",
      updatedAt: new Date().toISOString(),
    });

    console.log(`🔥 Firestore updated: passesOrders/${orderId} → status: success`);
    res.send(`✅ Firestore document ${orderId} updated to "success"`);
  } catch (err) {
    console.error("❌ Error updating Firestore:", err);
    res.status(500).send("❌ Error updating Firestore");
  }
});



// =====================
// Payzone callback
// =====================
app.post("/callback", async (req, res) => {
   
  const data = req.body; // full payload from Payzone
  console.log("💬 Payzone callback payload:", data);

  // You can now use the data to implement your logic
  // Example: check if payment is approved
  const approvedTx = data.transactions.find(
    (t) => t.state === "APPROVED" && t.resultCode === 0
  );



 // ✅ Firestore update if approved
  if (approvedTx) {
  
  try {
  console.log("Order ID:", data.orderId);
    const orderRef = db.collection("passesOrders").doc(data.orderId);
    const docSnap = await orderRef.get();

    if (!docSnap.exists) {
      console.log(`⚠️ Document passesOrders/${data.orderId} does not exist`);
      return res.status(404).send(`⚠️ Document ${data.orderId} does not exist`);
    }

    // Only update status if document exists
    await orderRef.update({
      status: "success",
      updatedAt: new Date().toISOString(),
    });

    console.log(`🔥 Firestore updated: passesOrders/${data.orderId} → status: success`);
  } catch (err) {
    console.error("❌ Error updating Firestore:", err);
  }
  } else {
    console.log("⚠️ Payment not approved or declined");
  }

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

  // Here you can plug your own logic later
  // e.g., update Firebase, Xano, DB, etc.

  res.json({ status: "OK", message: "Callback received" });
});

// =====================
// Start server
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Payzone Node server running on port ${PORT}`));
