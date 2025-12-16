// routing.js
import {route, graph} from "./graph2.js"; // eventually, graph.js

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

export function handleFeatureClick(osmElement, wayData) {
  if (state === "idle") return;

  const node = pickNodeFromElement(osmElement);
  if (!node) return;

  if (state === "selectStart") {
    startNode = node;
    startMarker = L.circleMarker(
      [graph.verts[node].lat, graph.verts[node].lon],
      { radius: 6, color: "green", fillOpacity: 1 }
    ).addTo(routeGroup);

    state = "selectEnd";
    setStatus("Click a destination");
  }
  else if (state === "selectEnd") {
    endNode = node;
    endMarker = L.circleMarker(
      [graph.verts[node].lat, graph.verts[node].lon],
      { radius: 6, color: "red", fillOpacity: 1 }
    ).addTo(routeGroup);

    computeRoute(wayData);
    state = "shown";
    setStatus("Route shown");
  }
}

// ---- internals ----------------------------------------------

function pickNodeFromElement(el) {
  // Prefer endpoints
  if (el.nodes && el.nodes.length > 0) {
    const a = el.nodes[0];
    const b = el.nodes[el.nodes.length - 1];
    if (graph.verts[a]) return a;
    if (graph.verts[b]) return b;
  }
  return null;
}

function buildRouteGeometry(pathEdges, wayData) { // way data has to be brought in from script
  const coords = [];

  pathEdges.forEach(edge => {
    const element = wayData[edge.wayId];

    if (!element) {
      return;
    }

    let onFlag = false;
    for (let i = 0; i < element.nodes.length; i++) {
      const pt = element.geometry[i];
      if (element.nodes[i] == edge.from) {
        onFlag = true;
        if (coords.length === 0) {coords.push([pt.lat, pt.lon]);}
        continue;
      }
      if (onFlag) {coords.push([pt.lat, pt.lon]);}
      if (element.nodes[i] == edge.to) {onFlag = false;}
    }

  });

  return coords;
}

function computeRoute(wayData) {
  const pathEdges = route(startNode, endNode);
  if (!pathEdges) {
    setStatus("No route found");
    return;
  }

  const coords = buildRouteGeometry(pathEdges, wayData);

  routeLayer = L.polyline(coords, {
    color: "#FFD700",
    weight: 7,
    opacity: 0.9
  }).addTo(routeGroup);
}

function setStatus(text) {
  const el = document.getElementById("statusText");
  if (el) el.textContent = text;
}


