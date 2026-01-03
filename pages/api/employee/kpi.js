import { verifyAuthHeader } from "../../../lib/server/firebaseAdmin";

const FIRESTORE_QUERY_ENDPOINT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ? `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`
  : null;

const decodeValue = (value) => {
  if (!value) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return Number(value.doubleValue);
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.booleanValue !== undefined) return Boolean(value.booleanValue);
  if (value.arrayValue?.values) {
    return value.arrayValue.values.map(decodeValue);
  }
  if (value.mapValue?.fields) {
    const entries = value.mapValue.fields;
    return Object.keys(entries).reduce((acc, key) => {
      acc[key] = decodeValue(entries[key]);
      return acc;
    }, {});
  }
  return null;
};

const mapDocument = (document) => {
  const fields = document.fields || {};
  const read = (key) => decodeValue(fields[key]);
  const rawScore = read("score");
  const numericScore = Number(rawScore);

  return {
    id: document.name?.split("/").pop() || document.name || "",
    userId: read("userId") || null,
    userEmail: read("userEmail") || null,
    userName: read("userName") || null,
    month: read("month") || null,
    year: read("year") || null,
    score: Number.isFinite(numericScore) ? numericScore : 0,
    addedAt: read("addedAt") || null,
    addedBy: read("addedBy") || null,
  };
};

const buildFilterInputs = (identity) => {
  const filters = [];
  if (identity.uid) {
    filters.push({ fieldPath: "userId", value: identity.uid });
  }
  if (identity.email) {
    filters.push({ fieldPath: "userEmail", value: identity.email });
  }
  return filters;
};

const runKpiQuery = async ({ authorization, fieldPath, value }) => {
  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: "kpi" }],
      where: {
        fieldFilter: {
          field: { fieldPath },
          op: "EQUAL",
          value: { stringValue: value },
        },
      },
      limit: 50,
    },
  };

  const response = await fetch(FIRESTORE_QUERY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(queryBody),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || "Failed to load KPI records";
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload || [];
};

const matchesIdentity = (entry, identity) => {
  if (identity.uid && entry.userId && entry.userId === identity.uid) {
    return true;
  }
  if (identity.email && entry.userEmail && entry.userEmail.toLowerCase() === identity.email.toLowerCase()) {
    return true;
  }
  if (identity.uid && entry.id && entry.id.startsWith(`${identity.uid}_`)) {
    return true;
  }
  return false;
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!FIRESTORE_QUERY_ENDPOINT) {
    return res.status(500).json({ error: "Missing Firebase project configuration" });
  }

  try {
    const decoded = await verifyAuthHeader(req);
    if (!decoded) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const filters = buildFilterInputs(decoded);
    if (filters.length === 0) {
      return res.status(400).json({ error: "Unable to determine employee identity" });
    }

    const authorizationHeader = decoded.token ? `Bearer ${decoded.token}` : req.headers.authorization;
    const entriesMap = new Map();

    for (const filter of filters) {
      try {
        const rawRows = await runKpiQuery({
          authorization: authorizationHeader,
          fieldPath: filter.fieldPath,
          value: filter.value,
        });

        rawRows.forEach((row) => {
          if (!row?.document) return;
          const entry = mapDocument(row.document);
          if (matchesIdentity(entry, decoded)) {
            entriesMap.set(entry.id, entry);
          }
        });
      } catch (error) {
        console.error(`Firestore KPI query failed for ${filter.fieldPath}`, error?.payload || error);
        if (error?.status && error.status !== 404) {
          return res.status(error.status).json({ error: error.message });
        }
      }
    }

    const entries = Array.from(entriesMap.values()).sort((a, b) => {
      const aTime = a.addedAt ? Date.parse(a.addedAt) : 0;
      const bTime = b.addedAt ? Date.parse(b.addedAt) : 0;
      return bTime - aTime;
    }).slice(0, 50);

    return res.status(200).json({ entries });
  } catch (error) {
    console.error("Employee KPI API error", error);
    return res.status(500).json({ error: error.message || "Failed to fetch KPI records" });
  }
}
