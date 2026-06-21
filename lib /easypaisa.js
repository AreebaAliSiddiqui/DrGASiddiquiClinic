// lib/easypaisa.js
//
// Wrapper around EasyPaisa's "Mobile Account" (MA) REST transaction API —
// this is the wallet-to-wallet flow (NOT the card "hosted checkout" redirect,
// which is a different product). Flow:
//
//   1. initiateMATransaction()  -> sends a payment request to the customer's
//      EasyPaisa app. EasyPaisa responds immediately just to confirm the
//      request was accepted ("pending"), not that it was paid.
//   2. The customer approves the request inside their EasyPaisa app.
//   3. inquireTransactionStatus() -> you call this (we do it via polling
//      from /api/booking-status) to find out if they actually approved it.
//
// ⚠️ IMPORTANT — fill in the two TODOs below before going live:
//   - EASYPAISA_BASE_URL: EasyPaisa gives each merchant sandbox + production
//     base URLs when you onboard. These aren't the same as the public
//     "hosted checkout" URL (that one's for card payments via a browser
//     redirect, which is a different integration). Get the MA REST endpoint
//     paths from your EasyPaisa integration manager / the PDF they sent you
//     when you signed up, and confirm the exact JSON field names match what's
//     below (Easypaisa's docs have had minor version differences over the
//     years — v3 vs v4 guides use slightly different field names).
//   - Credentials are Base64("username:password") in the `credentials` header,
//     per EasyPaisa's REST guide — confirm this matches your merchant pack.

const EASYPAISA_BASE_URL =
  process.env.EASYPAISA_MODE === 'production'
    ? process.env.EASYPAISA_PROD_BASE_URL  // TODO: paste from your merchant pack
    : process.env.EASYPAISA_SANDBOX_BASE_URL; // TODO: paste from your merchant pack

const STORE_ID = process.env.EASYPAISA_STORE_ID;
const USERNAME = process.env.EASYPAISA_USERNAME;
const PASSWORD = process.env.EASYPAISA_PASSWORD;

function authHeader() {
  const raw = `${USERNAME}:${PASSWORD}`;
  return Buffer.from(raw).toString('base64');
}

/**
 * Sends a payment request to the customer's EasyPaisa app.
 * @param {{orderRef: string, amount: number, mobileAccountNo: string, email?: string}} params
 * @returns {Promise<{accepted: boolean, raw: any}>}
 */
async function initiateMATransaction({ orderRef, amount, mobileAccountNo, email }) {
  const body = {
    orderId: orderRef,
    storeId: STORE_ID,
    transactionAmount: amount.toFixed(1), // EasyPaisa expects 1 decimal place, e.g. "1000.0"
    transactionType: 'MA',
    mobileAccountNo,           // customer's EasyPaisa-registered number, digits only e.g. 03001234567
    emailAddress: email || 'no-reply@alshifahealthcare.pk',
  };

  const res = await fetch(`${EASYPAISA_BASE_URL}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      credentials: authHeader(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  // "0000" = accepted/initiated per EasyPaisa's response code convention.
  // Confirm this code against your merchant pack — some guide versions use
  // different success codes for "request sent" vs "already completed".
  const accepted = data.responseCode === '0000';

  return { accepted, raw: data };
}

/**
 * Confirms whether a previously-initiated MA transaction was actually
 * approved by the customer. Call this from a polling loop or your IPN
 * handler — never trust "accepted" from initiateMATransaction() alone,
 * since that only means the request was sent, not that it was paid.
 * @param {string} orderRef
 * @returns {Promise<'success'|'failed'|'pending'>}
 */
async function inquireTransactionStatus(orderRef) {
  const res = await fetch(
    `${EASYPAISA_BASE_URL}/transactions/inquire?orderId=${encodeURIComponent(orderRef)}&storeId=${STORE_ID}`,
    {
      method: 'GET',
      headers: { credentials: authHeader() },
    }
  );

  const data = await res.json();

  if (data.responseCode === '0000' && data.transactionStatus === 'PAID') return 'success';
  if (data.transactionStatus === 'FAILED' || data.responseCode === '0001') return 'failed';
  return 'pending';
}

module.exports = { initiateMATransaction, inquireTransactionStatus };
