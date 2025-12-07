// --- Overpass data ------------------------------

export async function fetchOverpass() {
  var statusText = document.getElementById("statusText");
  var overpassUrl = "https://overpass-api.de/api/interpreter";
  const query = await fetch("evasion-query.txt").then(r => r.text());
  try {
    var response = await fetch(overpassUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
    });

    if (!response.ok) {
      throw new Error("Overpass error: " + response.status + " " + response.statusText);
    }

    var data = await response.json();
    statusText.textContent = "Rendering...";

    statusText.textContent = "Loaded " + data.elements.length + " ways.";
  } catch (err) {
    console.error(err);
    statusText.textContent = "Error: " + err.message;
  }
  return data;
}

// --- Elevation data -----------------------

async function fetchElevations(coords) {
  const ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup";
  
  // coords = [ [lat, lon], [lat, lon], ... ]

  const body = {
    locations: coords.map(c => ({
      latitude: c[0],
      longitude: c[1]
    }))
  };

  const response = await fetch(ELEVATION_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error("Elevation server error: " + response.status);
  }

  const json = await response.json();

  // returns [ele1, ele2, ...]
  return json.results.map(r => r.elevation);
}

export async function produceElevationMap(data) {  
  const elevationRequest = [];
  const pisteRefs = [];  

  data.elements.forEach(el => {
    if (el.type !== "way") return;
    const tags = el.tags || {};
    if (!tags["piste:type"]) return; // only pistes for now

    const coords = el.geometry;
    const start = coords[0];
    const end   = coords[coords.length - 1];

    elevationRequest.push([start.lat, start.lon]);
    elevationRequest.push([end.lat,   end.lon]);

    pisteRefs.push({ id: el.id, indexStart: elevationRequest.length - 2, indexEnd: elevationRequest.length - 1 });
  });

  const elevations = await fetchElevations(elevationRequest);

  const elevationMap = {}; 
  pisteRefs.forEach(ref => {
    elevationMap[ref.id] = {
      startEle: elevations[ref.indexStart],
      endEle:   elevations[ref.indexEnd]
    };
  });

  return elevationMap;
}
