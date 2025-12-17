// routing.js
import {route, graph, distanceBetween} from "./graph.js";

let state = "idle"; // idle / selectStart / selectEnd / shown
let startNode = null;
let endNode = null;

let routeLayer = null;
let startMarker = null;
let endMarker = null;

let mapRef = null;
let routeGroup = null;

// ---- init ----------------------------------------------------

export function initRouting(map, layerGroup) {
  mapRef = map;
  routeGroup = layerGroup;
}

// ---- public controls ----------------------------------------

export function startRouting() {
  clearRoute();
  state = "selectStart";
  setStatus("Click a start point");
}

export function clearRoute() {
  state = "idle";
  startNode = null;
  endNode = null;

  if (routeLayer) {
    routeGroup.removeLayer(routeLayer);
    routeLayer = null;
  }
  if (startMarker) {
    routeGroup.removeLayer(startMarker);
    startMarker = null;
  }
  if (endMarker) {
    routeGroup.removeLayer(endMarker);
    endMarker = null;
  }

  setStatus("Routing cleared");
}

// ---- click handling -----------------------------------------

export function handleFeatureClick(el) {
  if (state === "idle") return;

  const node = pickNodeFromElement(el);
  if (!node) return;

  if (state === "selectStart") {
    startNode = node;
    startMarker = L.circleMarker(
      [graph.verts[node].lat, graph.verts[node].lon],
      { radius: 5, color: "#FFD700", fillOpacity: 1 }
    ).addTo(routeGroup);

    state = "selectEnd";
    setStatus("Click a destination");
  }
  else if (state === "selectEnd") {
    endNode = node;
    endMarker = L.circleMarker(
      [graph.verts[node].lat, graph.verts[node].lon],
      { radius: 5, color: "#FFD700", fillOpacity: 1 }
    ).addTo(routeGroup);

    if (computeRoute()) {
      state = "shown";
      setStatus("Route shown");
    }
  }
}

// ---- internals ----------------------------------------------

function pickNodeFromElement(el) {
  var bestDist = Infinity;
  var bestVert = null;
  for (var v in graph.verts) {
    const a = graph.verts[v];
    const distance = distanceBetween(a.lat, a.lon, el.latlng.lat, el.latlng.lng);
    if (distance < bestDist) {
      bestDist = distance;
      bestVert = v;
    }
  }
  return bestDist <= 100 ? bestVert : null; // Tolerance of 100 for now...
}

function buildRouteGeometry(pathEdges) {
  const coords = [];
  pathEdges.forEach(e => {
    if (e.geometry) {
      e.geometry.forEach(pt => {
        coords.push([pt.lat, pt.lon]);
      });
    }
  });
  return coords;
}

function computeRoute() {
  const pathEdges = route(startNode, endNode);
  if (!pathEdges) {
    setStatus("No route found");
    return false;
  }

  const coords = buildRouteGeometry(pathEdges);

  routeLayer = L.polyline(coords, {
    color: "#FFD700",
    weight: 7,
    opacity: 0.7
  }).addTo(routeGroup);

  return true;
}

function setStatus(text) {
  const el = document.getElementById("statusText");
  if (el) el.textContent = text;
}


