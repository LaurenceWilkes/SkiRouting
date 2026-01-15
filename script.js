import {fetchOverpass, produceElevationMap} from "./loadData.js";
import {buildGraph} from "./graph.js";
import {initRouting, startRouting, clearRoute, handleFeatureClick} from "./routing.js";

// --- Map setup -------------------------------------------------------

// Rough centre of Evasion resorts 
var mapCenter = [45.83626, 6.64928];

var map = L.map("map").setView(mapCenter, 12);

// Base map 
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 22, // formerly 18
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href="https://open-elevation.com/">Open-Elevation</a>',
}).addTo(map);

// Way layers
var liftLayer = L.layerGroup().addTo(map);
var pisteLayer = L.layerGroup().addTo(map);

// Route layer
var routeLayer = L.layerGroup().addTo(map);
initRouting(map, routeLayer);

// Currently highlighted
let currentlyHighlighted = null;

// Options for mobile
const isMobile = window.matchMedia("(max-width: 600px)").matches;
//const baseWeight = isMobile ? 6 : 3; // Not included yet because lines look bad and doesn't change on resize
const baseWeight = 3;

// Legend
//var legend = L.control({ position: isMobile ? "topright" : "bottomright" }); // not included for same reason as last comment
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

  displayWays(data, elevationMap); // This also corrects the direction of the pistes 
  statusText.textContent = "Loaded " + data.elements.length + " ways.";


  var graph = buildGraph(data, elevationMap);
  document.getElementById("routeBtn").addEventListener("click", startRouting);
  document.getElementById("clearRouteBtn").addEventListener("click", clearRoute);

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

      var liftStyle = { color: "#555555", weight: baseWeight, dashArray: "5, 5" };

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
      let startEle = elevationMap[el.nodes[0]];
      let endEle = elevationMap[el.nodes[el.nodes.length - 1]];
      let elevationText = "";
      if (startEle) {
        if (startEle < endEle) {
          coords = coords.slice().reverse();
          el.nodes = el.nodes.slice().reverse();
          [startEle, endEle] = [endEle, startEle];
        }
        elevationText = `
          <br><b>Start elevation:</b> ${Math.round(startEle)} m
          <br><b>End elevation:</b> ${Math.round(endEle)} m
          <br><b>Vertical difference:</b> ${Math.round(startEle - endEle)} m
        `;
      }

      var pisteType = tags["piste:type"];
      var diff = tags["piste:difficulty"] || "unknown";
      var name = tags.name || "(unnamed piste)";
      var colour = colourForDifficulty(diff);

      var pisteStyle = { color: colour, weight: baseWeight };
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
              pixelSize: 11, 
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
        weight: baseWeight + 3,        
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

// temp
map.on("click", function (e) {
  handleFeatureClick(e);

  const lat = e.latlng.lat.toFixed(6);
  const lon = e.latlng.lng.toFixed(6);

  L.popup()
    .setLatLng(e.latlng)
    .setContent(`<b>Lat:</b> ${lat}<br><b>Lon:</b> ${lon}`)
    .openOn(map);

//  L.circle([lat, lon], {
//    radius: 15,
//    color: "orange",
//    fill: false
//  }).addTo(map);

  console.log(`Clicked at: ${lat}, ${lon}`);
});
