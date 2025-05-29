let participantData = {
    id: null,
    trials: [],
    startTime: null
};

function downloadCSV(data, filename = "participant_data.csv") {
    if (!data || !data.length) return;

    const replacer = (key, value) => value === null ? '' : value;

    const flatten = (obj) => {
        const flat = {};
        for (let key in obj) {
            const value = obj[key];
            if (Array.isArray(value)) {
                value.forEach((v, i) => {
                    flat[`${key}_${i + 1}`] = v;
                });
            } else if (typeof value === 'object' && value !== null) {
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

    // Build dynamic headers across all trials
    const headerSet = new Set();
    flattenedData.forEach(row => Object.keys(row).forEach(key => headerSet.add(key)));
    const headers = Array.from(headerSet);

    const csv = [
        headers.join(','),  // Header row
        ...flattenedData.map(row =>
            headers.map(field => JSON.stringify(row[field], replacer)).join(',')
        )
    ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadMushroomSetCSV(mushroomSets, participantId, filename = null) {
    if (!mushroomSets || typeof mushroomSets !== 'object') return;

    const rows = [];

    for (const setKey in mushroomSets) {
        const mushrooms = mushroomSets[setKey];

        // 🔍 Ensure it's an array
        if (!Array.isArray(mushrooms)) {
            console.warn(`Expected array for set "${setKey}", got`, mushrooms);
            continue;
        }

        mushrooms.forEach((m, i) => {
            rows.push({
                id: participantId,
                set: setKey,
                index: i,
                name: m?.name || '',
                image: m?.imagefilename || '',
                value: m?.value ?? ''
            });
        });
    }

    if (rows.length === 0) return;

    const headers = ['id', 'set', 'index', 'name', 'image', 'value'];
    const csv = [
        headers.join(','),
        ...rows.map(row =>
            headers.map(h => JSON.stringify(row[h] ?? '')).join(',')
        )
    ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `mushroomSets_${participantId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
