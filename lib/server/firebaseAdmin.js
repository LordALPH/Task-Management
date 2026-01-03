const TOKEN_LOOKUP_ENDPOINT = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export async function verifyAuthHeader(req) {
  const authHeader = req.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    return null;
  }

  if (!firebaseApiKey) {
    console.error("Missing NEXT_PUBLIC_FIREBASE_API_KEY for token verification");
    return null;
  }

  try {
    const response = await fetch(`${TOKEN_LOOKUP_ENDPOINT}?key=${firebaseApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Token lookup failed", detail);
      return null;
    }

    const payload = await response.json();
    const user = payload?.users?.[0];
    if (!user) {
      return null;
    }

    return {
      uid: user.localId,
      email: user.email || "",
      emailVerified: Boolean(user.emailVerified),
      token: idToken,
    };
  } catch (error) {
    console.error("Failed to verify Firebase token via REST", error);
    return null;
  }
}
