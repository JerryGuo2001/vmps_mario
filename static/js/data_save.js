// ===============================
//   SAVE SWITCH (LOCAL vs VERCEL)
// ===============================
const SAVE_MODE = "vercel"; // "local" | "vercel"
const VERCEL_BASE_URL = "https://mario-data.vercel.app"; // <-- change if needed

function RUNSHEET_KEY(id, suffix = "") {
  const base = suffix ? `${suffix}_${id}.csv` : `participant_data_${id}.csv`;
  return base;
}

function RUNSHEET_UPLOAD_URL(key) {
  return `${VERCEL_BASE_URL}/api/upload-runsheet?key=${encodeURIComponent(key)}`;
}

function RUNSHEET_GET_URL(key, existsOnly = false) {
  const url = new URL(`${VERCEL_BASE_URL}/api/fetch-runsheet`);
  url.searchParams.set("key", key);
  if (existsOnly) url.searchParams.set("exists", "1");
  return url.toString();
}

function SURVEY_FILE_KEY(id) {
  return `survey_${id}.csv`;
}

function START_FILE_KEY(id) {
  return `started_${id}.csv`;
}

function CLOSED_FILE_KEY(id) {
  return `closed_${id}.csv`;
}

function TRIALS_FILE_KEY(id) {
  return `data_${id}.csv`;
}

// ===============================
//   EXISTENCE / RESUME HELPERS
// ===============================
async function fileExistsOnServer(key) {
  if (SAVE_MODE !== "vercel" || !key) return false;

  try {
    const res = await fetch(`${RUNSHEET_GET_URL(key, true)}&_ts=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
    });

    if (res.status === 200) return true;
    if (res.status === 404) return false;

    const txt = await res.text().catch(() => "");
    console.warn(`[data_save] exists check unexpected status for "${key}":`, res.status, txt);
    return false;
  } catch (err) {
    console.warn(`[data_save] exists check failed for "${key}":`, err);
    return false;
  }
}

async function participantHasCompletedSurvey(id) {
  if (!id || SAVE_MODE !== "vercel") return false;

  try {
    if (await fileExistsOnServer(SURVEY_FILE_KEY(id))) return true;
    return false;
  } catch (err) {
    console.warn("[data_save] Unable to verify existing survey file:", err);
    return false;
  }
}

async function participantHasBlockedSession(id) {
  if (!id || SAVE_MODE !== "vercel") return false;

  try {
    if (await fileExistsOnServer(SURVEY_FILE_KEY(id))) return true;
    if (await fileExistsOnServer(CLOSED_FILE_KEY(id))) return true;
    if (await fileExistsOnServer(START_FILE_KEY(id))) return true;
    return false;
  } catch (err) {
    console.warn("[data_save] Unable to verify blocked session state:", err);
    return false;
  }
}

async function checkAndMaybeResume(id) {
  if (!id || SAVE_MODE !== "vercel") return "none";

  try {
    if (await fileExistsOnServer(SURVEY_FILE_KEY(id))) return "completed";
    if (await fileExistsOnServer(CLOSED_FILE_KEY(id))) return "closed";
    if (await fileExistsOnServer(START_FILE_KEY(id))) return "started";

    if (await fileExistsOnServer(TRIALS_FILE_KEY(id))) return "started";
    if (await fileExistsOnServer(RUNSHEET_KEY(id, "participant_data"))) return "started";

    return "none";
  } catch (err) {
    console.warn("[data_save] Resume check failed:", err);
    return "none";
  }
}

function buildSessionMarkerCSV(row) {
  const headers = Object.keys(row || {});
  if (!headers.length) return null;

  return [
    headers.join(","),
    headers.map((h) => JSON.stringify(row[h] ?? "")).join(",")
  ].join("\r\n");
}

async function saveStartMarkerCSV(id) {
  if (!id) return null;

  const csvString = buildSessionMarkerCSV({
    id,
    trial_type: "session_started",
    status: "started",
    started_at: new Date().toISOString(),
    block_reentry: 1
  });

  return await saveCSVString(csvString, START_FILE_KEY(id));
}

// Save a tiny marker file so the same participant ID cannot restart.
async function saveForceQuitMarkerCSV(id, reason = "inactive_15min") {
  if (!id) return null;

  const csvString = buildSessionMarkerCSV({
    id,
    trial_type: "session_closed",
    end_reason: reason,
    status: "force_quit",
    ended_at: new Date().toISOString(),
    block_reentry: 1
  });

  return await saveCSVString(csvString, CLOSED_FILE_KEY(id));
}


// ===============================
//   CORE HELPERS
// ===============================
function downloadCSVString(csvString, filename) {
  const blob = new Blob([csvString], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

  return await res.json().catch(() => ({}));
}

async function saveCSVString(csvString, filename) {
  if (SAVE_MODE === "local") {
    downloadCSVString(csvString, filename);
    return { mode: "local", filename };
  }

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
//   TRIAL CSV
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