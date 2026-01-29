// ===============================
//   SAVE SWITCH (LOCAL vs VERCEL)
// ===============================
const SAVE_MODE = "vercel"; // "local" | "vercel"
const VERCEL_BASE_URL = "https://mario-data.vercel.app"; // <-- change to your NEW vercel link

// Optional: file key prefixing (matches your old style if desired)
function RUNSHEET_KEY(id, suffix = "") {
  // Example outputs:
  // participant_data_<id>.csv
  // mushroomSets_<id>.csv
  const base = suffix ? `${suffix}_${id}.csv` : `participant_data_${id}.csv`;
  return base;
}

function RUNSHEET_GET_URL(key) {
  return `${VERCEL_BASE_URL}/api/runsheet?key=${encodeURIComponent(key)}`;
}
function RUNSHEET_UPLOAD_URL(key) {
  return `${VERCEL_BASE_URL}/api/upload-runsheet?key=${encodeURIComponent(key)}`;
}

// Disable CSV GET/resume for now (same as before)
async function fetchExistingCSV(_id) { return null; }
async function checkAndMaybeResume(_id) { return "none"; }


// ===============================
//   CORE HELPERS
// ===============================

// Build & download a CSV string
function downloadCSVString(csvString, filename) {
  const blob = new Blob([csvString], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Upload a CSV string to Vercel (multipart/form-data, field name "file")
async function uploadCSVStringToVercel(csvString, filename) {
  const blob = new Blob([csvString], { type: "text/csv" });
  const formData = new FormData();
  formData.append("file", blob, filename);

  const res = await fetch(RUNSHEET_UPLOAD_URL(filename), {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
  }

  // Your old API returns JSON; keep that assumption
  return await res.json().catch(() => ({}));
}

// Unified "save" that routes based on SAVE_MODE
async function saveCSVString(csvString, filename) {
  if (SAVE_MODE === "local") {
    downloadCSVString(csvString, filename);
    return { mode: "local", filename };
  }

  // SAVE_MODE === "vercel"
  const result = await uploadCSVStringToVercel(csvString, filename);
  console.log("Vercel upload response:", result);
  return { mode: "vercel", filename, result };
}


// ===============================
//   YOUR DATA OBJECT
// ===============================
let participantData = {
  id: null,
  trials: [],
  startTime: null
};


// ===============================
//   TRIAL CSV (participant trials)
//   - keeps your "dynamic headers" behavior
// ===============================
function buildTrialsCSVString(data) {
  if (!data || !data.length) return null;

  const replacer = (key, value) => (value === null ? "" : value);

  const flatten = (obj) => {
    const flat = {};
    for (let key in obj) {
      const value = obj[key];
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          flat[`${key}_${i + 1}`] = v;
        });
      } else if (typeof value === "object" && value !== null) {
        for (let subKey in value) {
          flat[`${key}_${subKey}`] = value[subKey];
        }
      } else {
        flat[key] = value;
      }
    }
    flat["id"] = participantData.id;
    return flat;
  };

  const flattenedData = data.map(flatten);

  // Dynamic headers across all trials
  const headerSet = new Set();
  flattenedData.forEach((row) => Object.keys(row).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);

  const csv = [
    headers.join(","),
    ...flattenedData.map((row) =>
      headers.map((field) => JSON.stringify(row[field], replacer)).join(",")
    ),
  ].join("\r\n");

  return csv;
}

// Replacement for your old downloadCSV(data,...)
// Now it saves locally OR uploads to Vercel depending on SAVE_MODE.
async function saveParticipantTrialsCSV(data, filename = null) {
  const csvString = buildTrialsCSVString(data);
  if (!csvString) return;

  const finalName = filename || RUNSHEET_KEY(participantData.id, "participant_data");
  try {
    const out = await saveCSVString(csvString, finalName);
    console.log("Saved trials CSV:", out);
    return out;
  } catch (err) {
    console.error("Save failed:", err);
    alert("Save failed: " + err.message);
    throw err;
  }
}


// ===============================
//   MUSHROOM SET CSV
// ===============================
function buildMushroomSetCSVString(mushroomSets, participantId) {
  if (!mushroomSets || typeof mushroomSets !== "object") return null;

  const rows = [];
  for (const setKey in mushroomSets) {
    const mushrooms = mushroomSets[setKey];
    if (!Array.isArray(mushrooms)) {
      console.warn(`Expected array for set "${setKey}", got`, mushrooms);
      continue;
    }

    mushrooms.forEach((m, i) => {
      rows.push({
        id: participantId,
        set: setKey,
        index: i,
        name: m?.name || "",
        image: m?.imagefilename || "",
        value: m?.value ?? "",
      });
    });
  }

  if (rows.length === 0) return null;

  const headers = ["id", "set", "index", "name", "image", "value"];
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? "")).join(",")),
  ].join("\r\n");

  return csv;
}

// Replacement for your old downloadMushroomSetCSV(...)
// Now it saves locally OR uploads to Vercel depending on SAVE_MODE.
async function saveMushroomSetCSV(mushroomSets, participantId, filename = null) {
  const csvString = buildMushroomSetCSVString(mushroomSets, participantId);
  if (!csvString) return;

  const finalName = filename || RUNSHEET_KEY(participantId, "mushroomSets");
  try {
    const out = await saveCSVString(csvString, finalName);
    console.log("Saved mushroomSets CSV:", out);
    return out;
  } catch (err) {
    console.error("Save failed:", err);
    alert("Save failed: " + err.message);
    throw err;
  }
}
