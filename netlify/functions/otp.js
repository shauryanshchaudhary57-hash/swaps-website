// This runs on Netlify's servers, never in the browser — so your
// Message Central password stays hidden from anyone viewing the site.
//
// Required environment variables (set these in Netlify, not here):
//   MC_CUSTOMER_ID   - from your Message Central console
//   MC_PASSWORD      - your Message Central account password
//   MC_EMAIL         - the email you signed up to Message Central with
//   MC_COUNTRY_CODE  - optional, defaults to 91 (India)

const BASE = "https://cpaas.messagecentral.com";

async function getAuthToken() {
  const customerId = process.env.MC_CUSTOMER_ID;
  const password = process.env.MC_PASSWORD;
  const email = process.env.MC_EMAIL;
  const key = Buffer.from(password).toString("base64");

  const url = `${BASE}/auth/v1/authentication/token?customerId=${encodeURIComponent(customerId)}&key=${encodeURIComponent(key)}&scope=NEW&country=91&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: { accept: "*/*" } });
  const data = await res.json();
  if (!data.token) throw new Error("Could not get auth token — check MC_CUSTOMER_ID / MC_PASSWORD / MC_EMAIL");
  return data.token;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const countryCode = process.env.MC_COUNTRY_CODE || "91";

  try {
    const authToken = await getAuthToken();

    if (body.action === "send") {
      const mobile = String(body.mobileNumber || "").replace(/\D/g, "").slice(-10);
      if (mobile.length !== 10) {
        return { statusCode: 400, body: JSON.stringify({ error: "Enter a valid 10-digit mobile number" }) };
      }

      const sendUrl = `${BASE}/verification/v3/send?countryCode=${countryCode}&flowType=SMS&mobileNumber=${mobile}&otpLength=6`;
      const sendRes = await fetch(sendUrl, { method: "POST", headers: { authToken } });
      const sendData = await sendRes.json();

      if (!sendData.data || !sendData.data.verificationId) {
        return { statusCode: 502, body: JSON.stringify({ error: sendData.message || "Could not send OTP" }) };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ verificationId: sendData.data.verificationId })
      };
    }

    if (body.action === "verify") {
      const verifyUrl = `${BASE}/verification/v3/validateOtp?verificationId=${encodeURIComponent(body.verificationId)}&code=${encodeURIComponent(body.code)}`;
      const verifyRes = await fetch(verifyUrl, { headers: { authToken } });
      const verifyData = await verifyRes.json();

      const verified = !!(verifyData.data && verifyData.data.verificationStatus === "VERIFICATION_COMPLETED");
      return {
        statusCode: 200,
        body: JSON.stringify({ verified })
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
        
