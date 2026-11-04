/**
 * Noodoe Apollo lead filter.
 *
 * Keeps a person only when they can sign for EV charging at a company in one
 * of the six segments, they have a verified email, and the state routes to
 * James or to a confirmed West Coast owner.
 *
 * West Coast and the rest of the US west of the Mississippi go to Ryan.
 * Mississippi River states and everything east go to James.
 * Canada follows the previous West rule (Ryan).
 * Rosa and Justin never receive these leads.
 *
 * Ryan Walling's Salesforce user is inactive. West rows go to Ryan Melanson.
 * Pass ryanConfirmed: false to hold them again.
 */

const OWNERS = {
  james: {
    name: "James Tornabene",
    id: "005TR00000IgINxYAN",
    email: "jamestornabene@noodoe.com",
  },
  ryanMelanson: {
    name: "Ryan Melanson",
    id: "005TR00000UN4KzYAL",
    email: "ryanmelanson@noodoe.com",
  },
  ryanWalling: {
    name: "Ryan Walling",
    id: "0058c00000CgISaAAN",
    email: "ryanwalling@noodoe.com",
    inactive: true,
  },
};

const DO_NOT_ASSIGN = {
  rosa: { name: "Rosalinda Ornelas", id: "0058c00000AUdW7AAL" },
  justin: { name: "Justin Goodwin", id: "0058c00000DY5PMAA1" },
  jamesFu: { name: "James Fu", id: "005TR00000TZRhPYAX" },
};

const RIVER = ["MN", "WI", "IA", "IL", "MO", "KY", "TN", "AR", "MS", "LA"];
const EAST = [
  "AL", "CT", "DE", "FL", "GA", "IN", "ME", "MD", "MA", "MI",
  "NH", "NJ", "NY", "NC", "OH", "PA", "RI", "SC", "VT", "VA", "WV", "DC",
  ...RIVER,
];
const WEST = [
  "AK", "AZ", "CA", "CO", "HI", "ID", "KS", "MT", "NE", "NV", "NM",
  "ND", "OK", "OR", "SD", "TX", "UT", "WA", "WY",
];

const STATES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN",
  texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
  "washington dc": "DC", "washington d.c.": "DC",
};

const CAMPAIGN = {
  multifamily: "Multifamily",
  hospitality: "Hospitality",
  fleet: "Fleet",
  public: "Public",
  charging: "Public",
  dealer: "",
};

const COMPETITORS = [
  "chargepoint", "blink charging", "evgo", "electrify america", "tesla",
  "wallbox", "evbox", "btc power", "abb e-mobility", "siemens emobility",
  "shell recharge", "flo ev", "addenergie",
];

const JUNK_COMPANY = [
  "magazine", "media group", "staffing", "recruiting", "newsletter",
  "roofing", "hvac", "electrical contractor", "electrical services",
  "electric co", "solar install", "solar enterprise", "solar company",
];

const SENIOR = [
  "director", "vice president", "vp", "chief", "head of", "president",
  "owner", "founder", "partner", "general manager", "regional manager",
  "area manager", "property manager",
];

const SEGMENTS = [
  {
    id: "multifamily",
    label: "Multifamily portfolios",
    needles: ["apartment", "multifamily", "multi-family", "property management", "reit", "student housing", "residential communit"],
  },
  {
    id: "hospitality",
    label: "Hospitality",
    needles: ["hotel", "resort", "casino", "hospitality", "lodging", "motel", "hilton", "marriott", "hyatt", "wyndham"],
  },
  {
    id: "fleet",
    label: "Commercial fleets",
    needles: ["fleet", "trucking", "logistics", "school bus", "transit", "delivery", "waste management"],
  },
  {
    id: "dealer",
    label: "Dealer groups",
    needles: ["dealership", "dealer group", "auto group", "automotive group", "car dealer"],
  },
  {
    id: "public",
    label: "Public sector",
    needles: ["city of", "county", "municipality", "school district", "university", "airport", "port authority", "housing authority", "transit authority"],
  },
  {
    id: "charging",
    label: "Charging networks and site hosts",
    needles: ["parking", "shopping center", "shopping centre", "mall", "ev charging", "charge point operator", "mobility hub"],
  },
];

function norm(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function blob(...parts) {
  return parts.map((p) => norm(p).toLowerCase()).filter(Boolean).join(" · ");
}

function hasAny(text, needles) {
  return needles.some((n) => text.includes(n));
}

function stateCode(value) {
  const raw = norm(value);
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && (EAST.includes(upper) || WEST.includes(upper))) return upper;
  return STATES[raw.toLowerCase()] || "";
}

function routeFor(state, country) {
  const code = stateCode(state);
  const place = norm(country).toLowerCase();
  const canada = place === "canada" || (place === "ca" && !code);
  if (canada) {
    return { desk: "ryan", reason: "Canada stays on the West desk." };
  }
  if (code && EAST.includes(code)) {
    const river = RIVER.includes(code);
    return {
      desk: "james",
      reason: river
        ? `${code} is on the Mississippi. That desk is James Tornabene.`
        : `${code} is east of the Mississippi. That desk is James Tornabene.`,
    };
  }
  if (code && WEST.includes(code)) {
    const coast = ["CA", "OR", "WA", "AK", "HI"].includes(code);
    return {
      desk: "ryan",
      reason: coast
        ? `${code} is West Coast. That desk is Ryan.`
        : `${code} is west of the Mississippi. That desk is Ryan.`,
    };
  }
  if (place && place !== "united states" && place !== "usa" && place !== "us" && place !== "u.s." && place !== "u.s.a.") {
    return { desk: "drop", reason: "Outside the United States and Canada." };
  }
  return { desk: "hold", reason: "No state, so it cannot be routed." };
}

function segmentFor(text) {
  for (const segment of SEGMENTS) {
    if (hasAny(text, segment.needles)) return segment;
  }
  return null;
}

function titleOk(title, segmentId) {
  const t = norm(title).toLowerCase();
  if (!t) return { ok: false, reason: "No title." };
  const alwaysDrop = ["intern", "student", "electrician", "installer", "technician", "apprentice", "recruiter", "journalist", "editor", "reporter", "leasing", "assistant"];
  if (hasAny(t, alwaysDrop)) return { ok: false, reason: "Title is not the person who signs." };
  const senior = hasAny(t, SENIOR) || /\b(gm|vp|ceo|coo|cfo|cto)\b/.test(t);
  const softDrop = ["coordinator", "specialist", "analyst", "associate", "receptionist", "bdr", "sdr", "sales development", "writer"];
  if (!senior && hasAny(t, softDrop)) return { ok: false, reason: "Title is not the person who signs." };
  const buyer = [
    "ancillary", "facilities", "sustainability", "esg", "energy", "fleet",
    "parking", "property", "asset", "real estate", "electrification",
    "e-mobility", "emobility", "charging", "procurement", "construction",
    "development", "operations", "public works", "fixed operations",
  ].some((n) => t.includes(n));
  const owner = /\b(ceo|coo|owner|founder|president|dealer principal)\b/.test(t);
  const gm = (segmentId === "hospitality" || segmentId === "dealer") && /\b(general manager|gm|hotel manager)\b/.test(t);
  if (gm || owner || (senior && buyer) || (/\bmanager\b/.test(t) && buyer)) {
    return { ok: true, reason: "Title can sign for charging." };
  }
  return { ok: false, reason: "Title is not a charging decision-maker." };
}

function emailOk(email, status) {
  const address = norm(email).toLowerCase();
  if (!address || !address.includes("@")) return { ok: false, hold: false, reason: "No email. Salesforce sends from the Lead, so this one waits." };
  const flag = norm(status).toLowerCase();
  if (!flag || flag === "verified" || flag === "valid") return { ok: true, reason: "Verified email." };
  if (flag.includes("guess") || flag.includes("extrapolat")) {
    return { ok: false, hold: true, reason: "Email is only a guess. Hold until Apollo verifies it." };
  }
  return { ok: false, hold: true, reason: "Email is not verified." };
}

function employeesOk(count, title, segmentId) {
  if (count == null || count === "") return { ok: true };
  const match = String(count).replace(/,/g, "").match(/\d+/);
  const n = match ? Number(match[0]) : NaN;
  if (!Number.isFinite(n)) return { ok: true };
  if (segmentId === "public") return { ok: true };
  if (n >= 11) return { ok: true };
  const t = norm(title).toLowerCase();
  if (/\b(owner|founder|president|ceo)\b/.test(t)) return { ok: true };
  return { ok: false, reason: "Company is under 11 people and the title is not the owner." };
}

function decide(raw, options = {}) {
  const ryanConfirmed = options.ryanConfirmed !== false;
  const first = norm(raw.firstName || raw["First Name"] || raw.first);
  const last = norm(raw.lastName || raw["Last Name"] || raw.last);
  const title = norm(raw.title || raw.Title);
  const company = norm(raw.company || raw.Company || raw.organization || raw["Company Name"]);
  const email = norm(raw.email || raw.Email);
  const emailStatus = norm(raw.emailStatus || raw["Email Status"] || raw.email_status);
  const phone = norm(raw.phone || raw.Phone || raw["Corporate Phone"] || raw["Work Direct Phone"]);
  const city = norm(raw.city || raw.City);
  const state = norm(raw.state || raw.State || raw["Company State"] || raw["Person State"]);
  const country = norm(raw.country || raw.Country || raw["Company Country"]);
  const industry = norm(raw.industry || raw.Industry);
  const employees = raw.employees ?? raw["# Employees"] ?? raw.estimated_num_employees ?? "";
  const text = blob(company, industry, title);

  const base = {
    first, last, title, company, email, phone, city, state: stateCode(state) || state,
    country, industry,
  };

  if (!first || !last || !company) {
    return { ...base, decision: "drop", reasons: ["Need a first name, last name, and company."] };
  }
  if (hasAny(text, COMPETITORS)) {
    return { ...base, decision: "drop", reasons: ["Competitor or partner network. Not a Noodoe buyer."] };
  }
  if (hasAny(text, JUNK_COMPANY)) {
    return { ...base, decision: "drop", reasons: ["Company is media, staffing, solar install, or an electrical contractor."] };
  }

  const segment = segmentFor(text);
  if (!segment) {
    return { ...base, decision: "drop", reasons: ["Company is outside the six EV charging segments."] };
  }

  const titleCheck = titleOk(title, segment.id);
  if (!titleCheck.ok) {
    return { ...base, decision: "drop", segment: segment.id, reasons: [titleCheck.reason] };
  }

  const size = employeesOk(employees, title, segment.id);
  if (!size.ok) {
    return { ...base, decision: "drop", segment: segment.id, reasons: [size.reason] };
  }

  const where = routeFor(state, country);
  if (where.desk === "drop") {
    return { ...base, decision: "drop", segment: segment.id, reasons: [where.reason] };
  }

  const mail = emailOk(email, emailStatus);
  const reasons = [segment.label + ".", titleCheck.reason, where.reason];
  if (where.desk === "hold" || !mail.ok) {
    if (!mail.ok) reasons.push(mail.reason);
    return {
      ...base,
      decision: "hold",
      segment: segment.id,
      campaign: CAMPAIGN[segment.id] || "",
      desk: where.desk === "hold" ? "" : where.desk,
      reasons,
    };
  }

  if (where.desk === "ryan" && !ryanConfirmed) {
    reasons.push("Ryan Walling is inactive in Salesforce. West stays on hold until you confirm Ryan Melanson (" + OWNERS.ryanMelanson.id + ") or send the right owner id.");
    return {
      ...base,
      decision: "hold",
      segment: segment.id,
      campaign: CAMPAIGN[segment.id] || "",
      desk: "ryan",
      reasons,
    };
  }

  const owner = where.desk === "james" ? OWNERS.james : OWNERS.ryanMelanson;
  reasons.push("Owner " + owner.name + ".");
  return {
    ...base,
    decision: "keep",
    segment: segment.id,
    campaign: CAMPAIGN[segment.id] || "",
    desk: where.desk,
    ownerId: owner.id,
    ownerName: owner.name,
    reasons,
  };
}

function summarize(rows, options) {
  const out = { keep: [], hold: [], drop: [] };
  for (const row of rows) {
    const result = decide(row, options);
    out[result.decision].push(result);
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() || []).map((h) => h.trim());
  return rows.filter((r) => r.some((c) => String(c).trim())).map((r) => {
    const obj = {};
    header.forEach((key, i) => { obj[key] = r[i] == null ? "" : String(r[i]).trim(); });
    return obj;
  });
}

function notesFor(row) {
  const bits = [
    "Apollo",
    row.segment || "",
    row.city ? row.city + (row.state ? ", " + row.state : "") : row.state,
    (row.reasons || []).join(" "),
  ].filter(Boolean);
  return bits.join(" · ").slice(0, 3000);
}

function fromApolloContact(contact) {
  const phones = Array.isArray(contact?.phone_numbers) ? contact.phone_numbers : [];
  const direct = phones.find((p) => p && p.type && p.type !== "work_hq");
  return {
    firstName: contact?.first_name || "",
    lastName: contact?.last_name || "",
    title: contact?.title || "",
    company: contact?.organization_name || contact?.organization?.name || "",
    email: contact?.email || "",
    emailStatus: contact?.email_status || "",
    phone: direct ? (direct.sanitized_number || direct.raw_number || "") : "",
    city: contact?.city || "",
    state: contact?.state || "",
    country: contact?.country || "",
    industry: contact?.organization?.industry || "",
    employees: contact?.organization?.estimated_num_employees ?? "",
  };
}

/** Map an Apollo people/match (enrich) record the same way as a saved contact. */
function fromApolloPerson(person) {
  return fromApolloContact({
    first_name: person?.first_name,
    last_name: person?.last_name,
    title: person?.title,
    organization_name: person?.organization?.name || person?.organization_name,
    organization: person?.organization,
    email: person?.email,
    email_status: person?.email_status || (person?.email ? "verified" : ""),
    phone_numbers: person?.phone_numbers,
    city: person?.city,
    state: person?.state,
    country: person?.country,
  });
}

function salesforceBody(row) {
  if (row.decision !== "keep" || !row.ownerId) return null;
  const body = {
    FirstName: row.first,
    LastName: row.last,
    Company: row.company,
    Email: row.email,
    OwnerId: row.ownerId,
    IAE_Notes__c: notesFor(row),
    Account_Type__c: "New_Business",
  };
  if (row.phone) body.Phone = row.phone;
  if (row.title) body.Title = row.title;
  if (row.city) body.Billing_Address__City__s = row.city;
  if (row.state && /^[A-Z]{2}$/.test(row.state)) body.Billing_Address__StateCode__s = row.state;
  if (row.country) {
    const c = row.country.toLowerCase();
    body.Billing_Address__CountryCode__s = c.startsWith("canad") ? "CA" : "US";
  } else if (row.state) body.Billing_Address__CountryCode__s = "US";
  if (row.campaign) body.Campaign__c = row.campaign;
  return body;
}




async function main(env, now) {
const CAP = 8000;
const key = String((env && env.APOLLO_API_KEY) || "").trim();
// Prefer Noodoe-specific creds. Generic SF_CLIENT_* on this host may be a different org.
const sfId = String((env && (env.NOODOE_SF_CLIENT_ID || env.SF_CLIENT_ID)) || "").trim();
const sfSecret = String((env && (env.NOODOE_SF_CLIENT_SECRET || env.SF_CLIENT_SECRET)) || "").trim();
const sfLogin = String((env && (env.NOODOE_SF_LOGIN_URL || env.SF_LOGIN_URL)) || "https://noodoe.my.salesforce.com").trim().replace(/\/$/, "");
const day = now.day;
const month = now.month;
const year = now.year;
if (day === 11 && !(year === 2026 && month === 11)) {
  return [{ json: { skipped: true, reason: "Day-11 trigger is only for 11 Nov 2026 credit-reset catch-up." } }];
}
if (!key) return [{ json: { ok: false, error: "APOLLO_API_KEY missing on n8n env" } }];
if (!sfId || !sfSecret) return [{ json: { ok: false, error: "NOODOE_SF_CLIENT_ID/SECRET missing on n8n env" } }];
if (!/noodoe\.my\.salesforce\.com/i.test(sfLogin)) {
  return [{ json: { ok: false, error: "NOODOE_SF_LOGIN_URL must be https://noodoe.my.salesforce.com" } }];
}

const SEGMENTS_Q = [
  { id: "multifamily", body: { person_titles: ["property manager", "regional property manager", "director of facilities", "director of ancillary revenue", "vp of facilities"], include_similar_titles: false, person_seniorities: ["manager", "director", "vp", "c_suite", "owner"], q_organization_keyword_tags: ["property management", "multifamily", "apartment", "real estate"], person_locations: ["United States", "Canada"], contact_email_status: ["verified"], organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000", "10001,50000"] } },
  { id: "hospitality", body: { person_titles: ["general manager", "director of facilities", "director of operations", "hotel manager"], include_similar_titles: false, person_seniorities: ["manager", "director", "vp", "c_suite", "owner"], q_organization_keyword_tags: ["hotel", "hospitality", "resort", "lodging"], person_locations: ["United States", "Canada"], contact_email_status: ["verified"], organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000"] } },
  { id: "fleet", body: { person_titles: ["fleet manager", "director of fleet", "vp of fleet", "director of transportation"], include_similar_titles: false, person_seniorities: ["manager", "director", "vp", "c_suite"], q_organization_keyword_tags: ["fleet", "trucking", "logistics", "transit"], person_locations: ["United States", "Canada"], contact_email_status: ["verified"], organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000"] } },
  { id: "dealer", body: { person_titles: ["general manager", "dealer principal", "owner", "president", "director of fixed operations"], include_similar_titles: false, person_seniorities: ["manager", "director", "vp", "c_suite", "owner"], q_organization_keyword_tags: ["dealership", "auto group", "automotive", "car dealer"], person_locations: ["United States", "Canada"], contact_email_status: ["verified"], organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000"] } },
  { id: "public", body: { person_titles: ["director of facilities", "facilities manager", "director of sustainability", "fleet manager", "director of public works"], include_similar_titles: false, person_seniorities: ["manager", "director", "vp", "c_suite"], q_organization_keyword_tags: ["municipality", "city government", "public sector", "transit authority", "airport"], person_locations: ["United States", "Canada"], contact_email_status: ["verified"] } },
  { id: "charging", body: { person_titles: ["director of facilities", "property manager", "director of operations", "general manager", "director of parking"], include_similar_titles: false, person_seniorities: ["manager", "director", "vp", "c_suite", "owner"], q_organization_keyword_tags: ["shopping center", "shopping mall", "parking", "real estate"], person_locations: ["United States", "Canada"], contact_email_status: ["verified"], organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000"] } },
];

async function apolloPost(urlPath, body) {
  const res = await fetch("https://api.apollo.io" + urlPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Apollo " + urlPath + " " + res.status + ": " + JSON.stringify(data).slice(0, 300));
  return data;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const people = [];
const seen = new Set();
for (const seg of SEGMENTS_Q) {
  for (let page = 1; page <= 10; page++) {
    const data = await apolloPost("/api/v1/mixed_people/api_search", { ...seg.body, page, per_page: 100 });
    for (const p of (data.people || [])) {
      if (!p.id || seen.has(p.id) || !p.has_email) continue;
      const title = (p.title || "").toLowerCase();
      if (title.includes("assistant")) continue;
      const preview = decide({
        firstName: p.first_name || "X",
        lastName: "Preview",
        title: p.title || "",
        company: p.organization?.name || "",
        email: "preview@verified.local",
        emailStatus: "verified",
        state: "",
        country: "United States",
        employees: 50,
      });
      if (preview.decision === "drop") continue;
      seen.add(p.id);
      people.push({ id: p.id, segment: seg.id, has_state: !!p.has_state });
    }
    if ((data.people || []).length < 100) break;
  }
}
people.sort((a, b) => Number(b.has_state) - Number(a.has_state));
const toEnrich = people.slice(0, CAP);
const enriched = [];
for (let i = 0; i < toEnrich.length; i += 10) {
  const batch = toEnrich.slice(i, i + 10);
  let matches = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await apolloPost("/api/v1/people/bulk_match", {
        details: batch.map((b) => ({ id: b.id })),
        reveal_personal_emails: false,
        reveal_phone_number: false,
      });
      matches = data.matches || data.people || [];
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
  for (const person of matches) {
    if (!person) continue;
    enriched.push(person);
  }
  await sleep(50);
}

const keep = [];
for (const person of enriched) {
  const row = decide(fromApolloPerson(person));
  row.apolloId = person.id;
  if (row.decision === "keep") keep.push(row);
}

const tokBody = new URLSearchParams({
  grant_type: "client_credentials",
  client_id: sfId,
  client_secret: sfSecret,
});
const tokRes = await fetch(sfLogin + "/services/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: tokBody,
});
const tok = await tokRes.json();
if (!tokRes.ok || !tok.access_token) throw new Error(tok.error_description || tok.error || "SF login failed");
const auth = {
  accessToken: tok.access_token,
  instanceUrl: String(tok.instance_url).replace(/\/$/, ""),
};
const ALLOWED = new Set([OWNERS.james.id, OWNERS.ryanMelanson.id]);
function esc(v) {
  return String(v || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
async function soql(q) {
  const res = await fetch(auth.instanceUrl + "/services/data/v62.0/query?q=" + encodeURIComponent(q), {
    headers: { Authorization: "Bearer " + auth.accessToken },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 300));
  return data.records || [];
}

let createdJames = 0;
let createdRyan = 0;
let skipped = 0;
let errors = 0;
for (const row of keep) {
  const body = salesforceBody(row);
  if (!body || !ALLOWED.has(body.OwnerId)) {
    skipped += 1;
    continue;
  }
  try {
    const leads = await soql("SELECT Id FROM Lead WHERE Email = '" + esc(body.Email) + "' LIMIT 1");
    if (leads.length) {
      skipped += 1;
      continue;
    }
    const res = await fetch(auth.instanceUrl + "/services/data/v62.0/sobjects/Lead", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + auth.accessToken,
        "Content-Type": "application/json",
        "Sforce-Auto-Assign": "FALSE",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      errors += 1;
      continue;
    }
    if (body.OwnerId === OWNERS.james.id) createdJames += 1;
    else createdRyan += 1;
  } catch (e) {
    errors += 1;
  }
  await sleep(15);
}

return [{
  json: {
    ok: true,
    day,
    month,
    year,
    cap: CAP,
    enriched: enriched.length,
    keep: keep.length,
    created: createdJames + createdRyan,
    james: createdJames,
    ryan: createdRyan,
    skipped,
    errors,
    expectedJames: Math.round(CAP * 0.6),
    expectedRyan: Math.round(CAP * 0.4),
    note: "Apollo buyers to Salesforce. James east / Ryan west. Rosa and Justin never assigned.",
  },
}];

}
if (typeof globalThis !== "undefined") globalThis.noodoeApolloMain = main;
export { main };
