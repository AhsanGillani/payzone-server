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


// app.get("/testumar", async (req, res) => {
//   const orderId = req.query.order;

//   if (!orderId) {
//     return res.status(400).send("❌ Missing query parameter: order");
//   }

//   try {
//     const orderRef = db.collection("passesOrders").doc(orderId);
//     const docSnap = await orderRef.get();

//     if (!docSnap.exists) {
//       console.log(`⚠️ Document passesOrders/${orderId} does not exist`);
//       return res.status(404).send(`⚠️ Document ${orderId} does not exist`);
//     }

//     // Only update status if document exists
//     await orderRef.update({
//       status: "test umar",
//       updatedAt: new Date().toISOString(),
//     });

//     console.log(`🔥 Firestore updated: passesOrders/${orderId} → status: success`);
//     res.send(`✅ Firestore document ${orderId} updated to "success"`);
//   } catch (err) {
//     console.error("❌ Error updating Firestore:", err);
//     res.status(500).send("❌ Error updating Firestore");
//   }
// });



// =====================
// Payzone callback
// =====================


function getPassName(purchasedItem) {
  console.log("🔍 getPassName called with:", purchasedItem);

  const base = purchasedItem?.passType?.trim() || "Pass";
  console.log("📌 base passType:", base);

  if (purchasedItem?.deal === true) {
    const name = `${base.charAt(0).toUpperCase() + base.slice(1)} Deal`;
    console.log("✅ Returning (deal):", name);
    return name;
  }

  const name = `${base.charAt(0).toUpperCase() + base.slice(1)} Pass`;
  console.log("✅ Returning (normal):", name);
  return name;
}


async function createNotification({
  forUserRef,
  by,
  forRole,
  content,
  heading,
  type,
  soldPass,
}) {
  try {
    await db.collection("Notifications").add({
      forUserRef,
      by,
      forRole,
      content,
      heading,
      type,
      soldPass,
      isSeen: false,
      createdDate: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`🔔 Notification created: ${heading}`);
  } catch (err) {
    console.error("❌ Error creating notification:", err);
  }
}

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


 // =============================
      // 🔥 NEW: Update passesPurchased
      // =============================
      console.log("🔍 Updating passesPurchased linked to:", data.orderId);

      const orderDocRef = db.collection("passesOrders").doc(data.orderId);

      const purchasedQuery = await db
        .collection("passesPurchased")
        .where("orderRef", "==", orderDocRef)
        .get();

      if (purchasedQuery.empty) {
        console.log("⚠️ No passesPurchased documents linked to this order.");
      } else {
        const batch = db.batch();

        purchasedQuery.forEach((doc) => {
          batch.update(doc.ref, {
            status: "success",
            updatedAt: new Date().toISOString(),
          });
        });

        await batch.commit();

        console.log(`🔥 Updated ${purchasedQuery.size} passesPurchased documents → success`);
      }


// =============================
// 🔔 Create Notification #1: Pass Purchased
// =============================

// Get order data
const orderData = docSnap.data();

// Fetch one passesPurchased entry for this order (you said: firstItem)
let purchasedItem = null;

if (!purchasedQuery.empty) {
  console.log("📄 purchasedQuery.docs:", purchasedQuery.docs.map(d => d.data()));

  purchasedItem = purchasedQuery.docs[0].data();
  console.log("purchasedItem: ", purchasedItem);
  
}

if (purchasedItem) {
  const passName = getPassName(purchasedItem);

console.log("From function Pass Name is: ", passName);

  await createNotification({
    heading: "Pass purchased",

    content: `You have successfully purchased '${passName}'`,

    forRole: "user",
    type: "passPurchased",

    // From your requirement
    forUserRef: orderData.userRef,
    by: orderData.userRef,

    soldPass: orderData.passDataRef,
  });

  console.log("🔔 Notification #1 (Pass Purchased) created.");
}


// =============================
// 🔔 Notification #2: User must verify profile after purchasing pass
// =============================
await createNotification({
  heading: "Selfie/profile verification required after the pass purchased",
  content: "You have to add the name and image of the person for whom the pass has been purchased.",
  forRole: "user",
  type: "passPurchased",
  forUserRef: orderData.userRef,
  by: orderData.userRef,
  soldPass: orderData.passDataRef,
});

console.log("🔔 Notification #3 Created (Profile Verification Required)");


// =============================
// 🔔 Notification #3: Admin Notification (Pass Purchased)
// =============================

if (purchasedItem) {
  const passName = getPassName(purchasedItem);

  // Extract user name from userRef
  let userName = "User";

  try {
    const userSnap = await orderData.userRef.get();
    if (userSnap.exists) {
      userName = userSnap.data().display_name || "User";
    }
  } catch (e) {
    console.log("⚠️ Unable to fetch user display_name:", e);
  }

  await createNotification({
    heading: "Pass purchased",
    content: `${userName} has purchased a pass ${passName}`,
    forRole: "admin",
    type: "passPurchased",
    forUserRef: null, // Admin notifications usually not targeted to 1 user  
    by: orderData.userRef,
    soldPass: orderData.passDataRef,
  });

  console.log("🔔 Notification #2 Created (Admin)");
}



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
