import {fetchOverpass, produceElevationMap} from "./loadData.js";

// --- Map setup -------------------------------------------------------

// Rough centre of Evasion resorts 
var mapCenter = [45.83626, 6.64928];

var map = L.map("map").setView(mapCenter, 12);

// Base map 
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

var liftLayer = L.layerGroup().addTo(map);
var pisteLayer = L.layerGroup().addTo(map);

// Currently highlighted
let currentlyHighlighted = null;

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
  statusText.textContent = "Loading from Overpass...";

  liftLayer.clearLayers();
  pisteLayer.clearLayers();

  var data = await fetchOverpass();
  var elevationMap = await produceElevationMap(data); // fetch elevations and form into elevation map

  displayWays(data, elevationMap); // This is possibly a temporary solution

  statusText.textContent = "Loaded " + data.elements.length + " ways.";
}

// --- Display pistes ------------------------------

function displayWays(data, elevationMap) {
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

      var liftStyle = { color: "#555555", weight: 3, dashArray: "5, 5" };

      var poly = L.polyline(coords, liftStyle).addTo(liftLayer);
      poly._originalStyle = liftStyle;

      poly.bindPopup(
	"<strong>Lift</strong><br>" +
	  "Name: " +
	  name +
	  "<br>" +
	  "Type: " +
	  liftType
      );
    } else if (tags["piste:type"]) {
      // Piste
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

      var pisteType = tags["piste:type"];
      var diff = tags["piste:difficulty"] || "unknown";
      var name = tags.name || "(unnamed piste)";
      var colour = colourForDifficulty(diff);

      var pisteStyle = { color: colour, weight: 3 };
      var poly = L.polyline(coords, pisteStyle).addTo(pisteLayer);
      poly._originalStyle = pisteStyle;

      // Info popup
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

      // Include arrows
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
      // Only apply arrows when zoomed in
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
    poly.on("click", () => {
      // Reset previously highlighted 
      if (currentlyHighlighted && currentlyHighlighted !== poly) {
        currentlyHighlighted.setStyle(currentlyHighlighted._originalStyle);
      }

      // Highlight
      poly.setStyle({
        color: colour,      
        weight: 6,        
        opacity: 1
      });

      currentlyHighlighted = poly;
    });
    poly.on("popupclose", () => {
      if (currentlyHighlighted === poly) {
        poly.setStyle(poly._originalStyle);
        currentlyHighlighted = null;
      }
    });
  });
}


// --- Controls --------------------------------------------------------

document.getElementById("reloadButton").addEventListener("click", function () {
  loadData();
});

// Initial load
loadData();
