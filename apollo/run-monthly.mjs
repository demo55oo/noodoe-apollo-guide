/**
 * Noodoe Apollo → Salesforce monthly buyer run.
 *
 * 1) Six segment people searches (no credit)
 * 2) Pre-filter candidates (title/company)
 * 3) Bulk enrich up to --cap (1 credit each when matched)
 * 4) Keep only verified buyers with James/Ryan desk
 * 5) Create Salesforce Leads with OwnerId + Sforce-Auto-Assign FALSE
 *
 * Usage:
 *   node run-monthly.mjs [--cap 2500] [--write] [--dry-search]
 *
 * Env (apollo/.env or process env):
 *   APOLLO_API_KEY
 *   NOODOE_SF_CLIENT_ID
 *   NOODOE_SF_CLIENT_SECRET
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decide, fromApolloPerson, salesforceBody, OWNERS } from "./filter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "out");
const ALLOWED = new Set([OWNERS.james.id, OWNERS.ryanMelanson.id]);

function loadEnvFile() {
  const p = path.join(__dirname, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function argNum(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const WRITE = process.argv.includes("--write");
const DRY_SEARCH = process.argv.includes("--dry-search");
const CAP = argNum("--cap", 2500);

const SEGMENTS = [
  {
    id: "multifamily",
    body: {
      person_titles: ["property manager", "regional property manager", "director of facilities", "director of ancillary revenue", "vp of facilities"],
      include_similar_titles: false,
      person_seniorities: ["manager", "director", "vp", "c_suite", "owner"],
      q_organization_keyword_tags: ["property management", "multifamily", "apartment", "real estate"],
      person_locations: ["United States", "Canada"],
      contact_email_status: ["verified"],
      organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000", "10001,50000"],
    },
  },
  {
    id: "hospitality",
    body: {
      person_titles: ["general manager", "director of facilities", "director of operations", "hotel manager"],
      include_similar_titles: false,
      person_seniorities: ["manager", "director", "vp", "c_suite", "owner"],
      q_organization_keyword_tags: ["hotel", "hospitality", "resort", "lodging"],
      person_locations: ["United States", "Canada"],
      contact_email_status: ["verified"],
      organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000"],
    },
  },
  {
    id: "fleet",
    body: {
      person_titles: ["fleet manager", "director of fleet", "vp of fleet", "director of transportation"],
      include_similar_titles: false,
      person_seniorities: ["manager", "director", "vp", "c_suite"],
      q_organization_keyword_tags: ["fleet", "trucking", "logistics", "transit"],
      person_locations: ["United States", "Canada"],
      contact_email_status: ["verified"],
      organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000"],
    },
  },
  {
    id: "dealer",
    body: {
      person_titles: ["general manager", "dealer principal", "owner", "president", "director of fixed operations"],
      include_similar_titles: false,
      person_seniorities: ["manager", "director", "vp", "c_suite", "owner"],
      q_organization_keyword_tags: ["dealership", "auto group", "automotive", "car dealer"],
      person_locations: ["United States", "Canada"],
      contact_email_status: ["verified"],
      organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000"],
    },
  },
  {
    id: "public",
    body: {
      person_titles: ["director of facilities", "facilities manager", "director of sustainability", "fleet manager", "director of public works"],
      include_similar_titles: false,
      person_seniorities: ["manager", "director", "vp", "c_suite"],
      q_organization_keyword_tags: ["municipality", "city government", "public sector", "transit authority", "airport"],
      person_locations: ["United States", "Canada"],
      contact_email_status: ["verified"],
    },
  },
  {
    id: "charging",
    body: {
      person_titles: ["director of facilities", "property manager", "director of operations", "general manager", "director of parking"],
      include_similar_titles: false,
      person_seniorities: ["manager", "director", "vp", "c_suite", "owner"],
      q_organization_keyword_tags: ["shopping center", "shopping mall", "parking", "real estate"],
      person_locations: ["United States", "Canada"],
      contact_email_status: ["verified"],
      organization_num_employees_ranges: ["11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000"],
    },
  },
];

function apolloHeaders() {
  const key = process.env.APOLLO_API_KEY || "";
  if (!key) throw new Error("APOLLO_API_KEY missing");
  return { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": key };
}

async function apolloPost(urlPath, body) {
  const res = await fetch("https://api.apollo.io" + urlPath, {
    method: "POST",
    headers: apolloHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Apollo ${urlPath} ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

async function searchSegment(segment, pages = 8) {
  const people = [];
  let total = 0;
  for (let page = 1; page <= pages; page++) {
    const data = await apolloPost("/api/v1/mixed_people/api_search", {
      ...segment.body,
      page,
      per_page: 100,
    });
    total = data.total_entries || total;
    const batch = data.people || [];
    people.push(...batch.map((p) => ({ ...p, segment: segment.id })));
    if (batch.length < 100) break;
    // Stay under search volume without pacing hard — search is free.
  }
  return { id: segment.id, total, people };
}

function prefilterPerson(person) {
  const title = (person.title || "").toLowerCase();
  if (title.includes("assistant")) return null;
  const row = {
    firstName: person.first_name || "X",
    lastName: "Preview",
    title: person.title || "",
    company: person.organization?.name || "",
    email: person.has_email ? "preview@verified.local" : "",
    emailStatus: person.has_email ? "verified" : "",
    state: "",
    country: "United States",
    employees: 50,
  };
  const d = decide(row);
  if (d.decision === "drop") return null;
  return { id: person.id, segment: person.segment, has_state: !!person.has_state };
}

async function enrichBatch(ids) {
  const data = await apolloPost("/api/v1/people/bulk_match", {
    details: ids.map((id) => ({ id })),
    reveal_personal_emails: false,
    reveal_phone_number: false,
  });
  return data.matches || data.people || [];
}

async function sfToken() {
  const clientId = process.env.NOODOE_SF_CLIENT_ID || "";
  const clientSecret = process.env.NOODOE_SF_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("Salesforce env missing");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch("https://noodoe.my.salesforce.com/services/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || "SF login failed");
  return { accessToken: data.access_token, instanceUrl: String(data.instance_url).replace(/\/$/, "") };
}

function esc(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function soql(auth, q) {
  const url = auth.instanceUrl + "/services/data/v62.0/query?q=" + encodeURIComponent(q);
  const res = await fetch(url, { headers: { Authorization: "Bearer " + auth.accessToken } });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 300));
  return data.records || [];
}

async function alreadyThere(auth, body) {
  const leads = await soql(auth, "SELECT Id, Owner.Name FROM Lead WHERE Email = '" + esc(body.Email) + "' LIMIT 1");
  if (leads.length) return "Lead already has this email, owned by " + (leads[0].Owner && leads[0].Owner.Name);
  const accounts = await soql(auth, "SELECT Id, Name FROM Account WHERE Name = '" + esc(body.Company) + "' LIMIT 1");
  if (accounts.length) return "Account already exists: " + accounts[0].Name;
  return "";
}

async function createLead(auth, body) {
  const res = await fetch(auth.instanceUrl + "/services/data/v62.0/sobjects/Lead", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + auth.accessToken,
      "Content-Type": "application/json",
      "Sforce-Auto-Assign": "FALSE",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 400));
  return data.id;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvFile();
  fs.mkdirSync(OUT, { recursive: true });

  console.log(JSON.stringify({ phase: "start", cap: CAP, write: WRITE, drySearch: DRY_SEARCH }));

  const segments = [];
  for (const seg of SEGMENTS) {
    const result = await searchSegment(seg, DRY_SEARCH ? 1 : 10);
    segments.push(result);
    console.log(JSON.stringify({ phase: "search", segment: seg.id, got: result.people.length, total: result.total }));
  }

  const seen = new Set();
  const candidates = [];
  for (const seg of segments) {
    for (const person of seg.people) {
      if (!person.id || seen.has(person.id) || !person.has_email) continue;
      const row = prefilterPerson(person);
      if (!row) continue;
      seen.add(person.id);
      candidates.push(row);
    }
  }
  // Prefer people who already expose state on search.
  candidates.sort((a, b) => Number(b.has_state) - Number(a.has_state));
  const toEnrich = candidates.slice(0, CAP);
  console.log(JSON.stringify({
    phase: "candidates",
    searchedPeople: segments.reduce((n, s) => n + s.people.length, 0),
    prefiltered: candidates.length,
    enriching: toEnrich.length,
  }));

  fs.writeFileSync(path.join(OUT, "monthly-candidates.json"), JSON.stringify({
    ran_at: new Date().toISOString(),
    cap: CAP,
    prefiltered: candidates.length,
    enriching: toEnrich.map((c) => c.id),
  }));

  if (DRY_SEARCH) {
    console.log(JSON.stringify({ phase: "dry-search-done", enriching: toEnrich.length }));
    return;
  }

  const enriched = [];
  for (let i = 0; i < toEnrich.length; i += 10) {
    const batch = toEnrich.slice(i, i + 10);
    let matches = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        matches = await enrichBatch(batch.map((b) => b.id));
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await sleep(1500 * (attempt + 1));
      }
    }
    for (const person of matches) {
      if (!person) continue;
      const seg = batch.find((b) => b.id === person.id);
      if (seg) person._segment = seg.segment;
      enriched.push(person);
    }
    if ((i / 10) % 10 === 0) {
      console.log(JSON.stringify({ phase: "enrich", done: Math.min(i + 10, toEnrich.length), of: toEnrich.length }));
    }
    await sleep(120);
  }

  fs.writeFileSync(path.join(OUT, "enriched-all.json"), JSON.stringify(enriched));

  const keep = [];
  const hold = [];
  const drop = [];
  for (const person of enriched) {
    const raw = fromApolloPerson(person);
    if (person._segment) raw.segmentHint = person._segment;
    const row = decide(raw);
    row.apolloId = person.id;
    if (row.decision === "keep") keep.push(row);
    else if (row.decision === "hold") hold.push(row);
    else drop.push(row);
  }

  const james = keep.filter((k) => k.desk === "james").length;
  const ryan = keep.filter((k) => k.desk === "ryan").length;
  console.log(JSON.stringify({
    phase: "filter",
    enriched: enriched.length,
    keep: keep.length,
    hold: hold.length,
    drop: drop.length,
    james,
    ryan,
  }));

  fs.writeFileSync(path.join(OUT, "keep.json"), JSON.stringify(keep));
  fs.writeFileSync(path.join(OUT, "monthly-filter-summary.json"), JSON.stringify({
    enriched: enriched.length,
    keep: keep.length,
    hold: hold.length,
    drop: drop.length,
    james,
    ryan,
  }, null, 2));

  if (!WRITE) {
    console.log(JSON.stringify({ phase: "dry-run", wouldCreate: keep.length, james, ryan }));
    return;
  }

  const auth = await sfToken();
  const results = [];
  let createdJames = 0;
  let createdRyan = 0;
  let skipped = 0;
  for (const row of keep) {
    const body = salesforceBody(row);
    if (!body || !ALLOWED.has(body.OwnerId)) {
      results.push({ company: row.company, action: "skip", reason: "bad owner or body" });
      skipped += 1;
      continue;
    }
    try {
      const block = await alreadyThere(auth, body);
      if (block) {
        results.push({ company: body.Company, action: "skip", reason: block });
        skipped += 1;
        continue;
      }
      const id = await createLead(auth, body);
      const desk = body.OwnerId === OWNERS.james.id ? "james" : "ryan";
      if (desk === "james") createdJames += 1;
      else createdRyan += 1;
      results.push({ company: body.Company, action: "created", leadId: id, desk });
    } catch (err) {
      results.push({ company: body.Company, action: "error", reason: String(err.message || err).slice(0, 200) });
      skipped += 1;
    }
    await sleep(40);
  }

  const summary = {
    ran_at: new Date().toISOString(),
    credits_spent: enriched.length,
    enriched: enriched.length,
    kept: keep.length,
    created: createdJames + createdRyan,
    skipped,
    james: createdJames,
    ryan: createdRyan,
    note: "OwnerId set to James Tornabene or Ryan Melanson; Rosa/Justin never assigned.",
  };
  fs.writeFileSync(path.join(OUT, "push-results.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, "push-results-detail.json"), JSON.stringify(results));
  console.log(JSON.stringify({ phase: "done", ...summary }));
}

main().catch((err) => {
  console.error(JSON.stringify({ phase: "fatal", error: String(err.message || err) }));
  process.exit(1);
});
