// --- Map setup -------------------------------------------------------

// Rough centre of Evasion Mont-Blanc
var mapCenter = [45.83626, 6.64928];

var map = L.map("map").setView(mapCenter, 12);

// Base map 
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// --- Layer groups ----------------------------------------------------

var liftLayer = L.layerGroup().addTo(map);
var pisteLayer = L.layerGroup().addTo(map);

// Legend
var legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
  var div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div><strong>Legend</strong></div>
    <div class="legend-item">
      <div class="legend-line" style="border-color:#555; border-style: dashed;"></div>
      <span>Lifts (aerialway)</span>
    </div>
    <div class="legend-item">
      <div class="legend-line" style="border-color:#00aa55;"></div>
      <span>Novice</span>
    </div>
    <div class="legend-item">
      <div class="legend-line" style="border-color:#0066ff;"></div>
      <span>Easy</span>
    </div>
    <div class="legend-item">
      <div class="legend-line" style="border-color:#ee3333;"></div>
      <span>Intermediate</span>
    </div>
    <div class="legend-item">
      <div class="legend-line" style="border-color:#000000;"></div>
      <span>Advanced</span>
    </div>
    <div class="legend-item">
      <div class="legend-line" style="border-color:#ff7518;"></div>
      <span>Free ride</span>
    </div>
    <div class="legend-item">
      <div class="legend-line" style="border-color:#999999;"></div>
      <span>Other pistes</span>
    </div>
  `;
  return div;
};
legend.addTo(map);

// --- Colours -------------------------------------------------

function colourForDifficulty(diff) {
  switch (diff) {
    case "novice":
    case "very_easy":
    case "green":
      return "#00aa55";
    case "easy":
    case "blue":
      return "#0066ff";
    case "red":
    case "intermediate":
      return "#ee3333";
    case "advanced":
    case "black":
    case "expert":
      return "#000000";
    case "freeride":
      return "#ff7518"
    default:
      return "#999999";
  }
}

// --- Load pistes and elevation --------------------------------------------------

async function loadData() {
  var statusText = document.getElementById("statusText");
  statusText.textContent = "Loading from Overpass…";

  liftLayer.clearLayers();
  pisteLayer.clearLayers();

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
    statusText.textContent = "Rendering…";

    var elevationMap = await produceElevationMap(data);
    renderOverpassData(data, elevationMap); // This is possibly a temporary solution

    statusText.textContent = "Loaded " + data.elements.length + " ways.";
  } catch (err) {
    console.error(err);
    statusText.textContent = "Error: " + err.message;
  }
}

// --- Display pistes ------------------------------

function renderOverpassData(data, elevationMap) {
  data.elements.forEach(function (el) {
    if (el.type !== "way" || !el.geometry) return;

    var coords = el.geometry.map(function (pt) {
      return [pt.lat, pt.lon];
    });

    var tags = el.tags || {};

    if (tags.aerialway) {
      // Lift
      var name = tags.name || "(unnamed lift)";
      var liftType = tags.aerialway;

      var poly = L.polyline(coords, {
	color: "#555555",
	weight: 3,
	dashArray: "5, 5",
      }).addTo(liftLayer);

      poly.bindPopup(
	"<strong>Lift</strong><br>" +
	  "Name: " +
	  name +
	  "<br>" +
	  "Type: " +
	  liftType
      );
    } else if (tags["piste:type"]) {

      const elev = elevationMap[el.id];
      let elevationText = "";
      if (elev) {
        if (elev.startEle < elev.endEle) {
          coords = coords.slice().reverse();
          [elev.startEle, elev.endEle] = [elev.endEle, elev.startEle];
        }
        elevationText = `
          <br><b>Start elevation:</b> ${Math.round(elev.startEle)} m
          <br><b>End elevation:</b> ${Math.round(elev.endEle)} m
          <br><b>Vertical difference:</b> ${Math.round(elev.startEle - elev.endEle)} m
        `;
      }

      // Piste (non-nordic)
      var pisteType = tags["piste:type"];
      var diff = tags["piste:difficulty"] || "unknown";
      var name = tags.name || "(unnamed piste)";
      var colour = colourForDifficulty(diff);

      var poly = L.polyline(coords, {
	color: colour,
	weight: 3,
      }).addTo(pisteLayer);

      poly.bindPopup(
	"<strong>Piste</strong><br>" +
	  "Name: " +
	  name +
	  "<br>" +
	  "Type: " +
	  pisteType +
	  "<br>" +
	  "Difficulty: " +
	  diff +
          elevationText
      );

      const arrowDec = L.polylineDecorator(poly, {
        patterns: [
          {
            offset: '50%',
            repeat: 0,
            symbol: L.Symbol.arrowHead({
              pixelSize: 10,
              pathOptions: { color: colour, weight: 1, fillOpacity: 1 }
            })
          }
        ]
      });
      map.on("zoomend", () => {
        if (map.getZoom() >= 13) {
          if (!map.hasLayer(arrowDec)) {
            arrowDec.addTo(map);
          }
        } else {
          if (map.hasLayer(arrowDec)) {
            map.removeLayer(arrowDec);
          }
        }
      });
    }
  });
}

// --- Elevation data -----------------------

async function fetchElevations(coords) {
  const ELEVATION_URL = "https://elevation.racemap.com/api";
  // coords = [ [lat, lon], [lat, lon], ... ]
  const response = await fetch(ELEVATION_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(coords)
  });

  if (!response.ok) {
    throw new Error("Elevation server error: " + response.status);
  }

  return await response.json(); // returns [ele1, ele2, ...]
}

async function produceElevationMap(data) {  
  // Extract start & end points
  const elevationRequest = [];
  const pisteRefs = [];  // to remember which index belongs to which piste

  data.elements.forEach(el => {
    if (el.type !== "way") return;
    const tags = el.tags || {};
    if (!tags["piste:type"]) return; // we only care about pistes

    const coords = el.geometry;
    const start = coords[0];
    const end   = coords[coords.length - 1];

    // Save for request
    elevationRequest.push([start.lat, start.lon]);
    elevationRequest.push([end.lat,   end.lon]);

    // Save mapping back to this piste
    pisteRefs.push({ id: el.id, indexStart: elevationRequest.length - 2, indexEnd: elevationRequest.length - 1 });
  });

  // Send request in one batch
  const elevations = await fetchElevations(elevationRequest);

  // Attach elevations back to the data
  const elevationMap = {}; // id → {startEle, endEle}
  pisteRefs.forEach(ref => {
    elevationMap[ref.id] = {
      startEle: elevations[ref.indexStart],
      endEle:   elevations[ref.indexEnd]
    };
  });

  return elevationMap;
}


// --- Controls --------------------------------------------------------

document.getElementById("reloadButton").addEventListener("click", function () {
  loadData();
});

// Initial load
loadData();
