// graph.js 
import {PriorityQueue} from "./priorityqueue.js";
import {plateaus} from "./plateaus.js";

// --- Tools ------------------------------
// Find great-circle distance
export function distanceBetween(alat, alon, blat, blon) {
  const R = 6373252; // assuming earth is a sphere (This value is chosen to work in the alps - need a better long term solution)
  const toRad = x => x * Math.PI / 180;
  const Dlat = toRad(blat - alat);
  const Dlon = toRad(blon - alon);
  const havt = Math.sin(Dlat / 2) ** 2
               + Math.cos(toRad(alat)) * Math.cos(toRad(blat)) * (Math.sin(Dlon / 2) ** 2);
  return R * (2 * Math.atan2(Math.sqrt(havt), Math.sqrt(1 - havt)));
}

function polylineLength(coords) {
  let len = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    len += distanceBetween(a.lat, a.lon, b.lat, b.lon);
  }
  return len;
}

function intersect([a, b], [c, d]) {
  const x1 = a.lat, y1 = a.lon, x2 = b.lat, y2 = b.lon;
  const x3 = c.lat, y3 = c.lon, x4 = d.lat, y4 = d.lon;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(den) < 1e-12) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1
    ? { lat: x1 + t * (x2 - x1), lon: y1 + t * (y2 - y1) }
    : null;
}

// --- Graph ------------------------------
// The plan is to produce the obvious vertices on the first pass and then try
// to find the additional ones on a second check. 
// Things that need to be accounted for: are endpoints which subdivide other
// pistes, actual crossings of pistes, and plateaus.
// - [ ] Endpoints subdividing other pistes and crossings of pistes can be solved 
//   by producing a grid of 5m x 5m overlapping "rectangles" which subdivide 
//   all nodes in all pistes so that we have the ability to very quickly check
//   which pistes are close to each other.
// - [x] Plateaus can be accounted for perhaps by including a 10m radius around 
//   the tops of all lifts for which any start node can be reached in 0 weight.
//   This may have exceptions even on this resort though which don't work 
//   automatically.
// - [x] Plateaus included also by a separate json which includes the bounding
//   boxes of each plateau.
export const graph = {
  verts: {},   // nodeId -> {lat, lon, ele, meta} // verts are indexed by their overpass node ID
  edges: {}    // fromId -> [{toId, weight, kind, wayId}]
};

function createNode(id, lat, lon, ele, meta = {}) {
  if (graph.verts[id]) {
    if (graph.verts[id].ele == null) {
      graph.verts[id].ele = ele; // just update the elevation if the lift was first...
    }
  } else {
    graph.verts[id] = { lat: lat, lon: lon, ele: ele, ...meta };
  }
  return id;
}

function addEdge(a, b, w, meta = {}) {
  if (!(a in graph.edges)) {graph.edges[a] = [];}
  graph.edges[a].push({ to: b, weight: w, ...meta })
}

function nearbyVerts(epNode, radius) {
  let verts = [];
  const parent = graph.verts[epNode];
  for (let vert in graph.verts) {
    if (vert == epNode) continue;
    const child = graph.verts[vert];
    const d = distanceBetween(parent.lat, parent.lon, child.lat, child.lon);
    if (d < radius) {verts.push(vert);}
  }

  if (verts.length > 0) return verts;
  return null;
}

// --- Build Graph ------------------------------

export function buildGraph(data, elevationMap) {
  graph.verts = {};
  graph.edges = {};

  const wayNodes = {}; // wayId -> nodeId array

  // First pass: endpoints
  data.elements.forEach(el => {
    if (el.type !== "way" || !el.geometry) return;
    const tags = el.tags || {};
    if (!tags["piste:type"] && !tags.aerialway) return;

    const coords = el.geometry;
    const id = el.id;

    const startLoc = coords[0];
    const endLoc   = coords[coords.length - 1];

    const startId = el.nodes[0];
    const endId = el.nodes[el.nodes.length - 1];

    const startEle = elevationMap[startId] ?? null;
    const endEle   = elevationMap[endId] ?? null;

    createNode(startId, startLoc.lat, startLoc.lon, startEle);
    createNode(endId, endLoc.lat, endLoc.lon, endEle);

    wayNodes[id] = [startId, endId];
  });

  data.elements.forEach(el => {
    if (el.type !== "way" || !el.geometry) return;
    const tags = el.tags || {};
    if (!tags["piste:type"]) return;

    const coords = el.geometry;
    const nodes = el.nodes;
    const id = el.id;

    for (let i = 1; i < coords.length - 1; i++) {
      const node = nodes[i];
      if (node in graph.verts) {
        wayNodes[id].splice(wayNodes[id].length - 1, 0, node);
      }
    }
  });

  // Create edges
  data.elements.forEach(el => {
    if (el.type !== "way" || !el.geometry) return;

    const id = el.id;
    const tags = el.tags || {};
    if (!tags["piste:type"] && !tags.aerialway) return;

    const verts = wayNodes[id];

    for (let i = 0; i < verts.length - 1; i++) {
      const A = graph.verts[verts[i]];
      const B = graph.verts[verts[i + 1]];
      if (!A || !B) continue;

      const from = verts[i];
      const to = verts[i + 1];

      const idxA = el.nodes.indexOf(from);
      const idxB = el.nodes.indexOf(to);
      if (idxA === -1 || idxB === -1) return;

      const segGeom = el.geometry.slice(
        Math.min(idxA, idxB),
        Math.max(idxA, idxB) + 1
      );

      const w = polylineLength(segGeom);

      addEdge(from, to, w, {
        wayId: id,
        kind: tags.aerialway ? "lift" : "piste",
        difficulty: tags["piste:difficulty"] || null,
        geometry: segGeom
      });
    }
  });

  // Connect lifts to nearby piste nodes 
  data.elements.forEach(el => { 
    if (el.type !== "way" || !el.tags?.aerialway) return;
    const id = el.id;
    const endpoints = wayNodes[id];
    if (!endpoints) return;
    endpoints.forEach(epNode => {
      const nearest = nearbyVerts(epNode, 30); // all routes starting within approximately 30 meters away are connected
      if (!nearest) return;
      const A = graph.verts[epNode];
      if (!A) return;
      for (let i = 0; i < nearest.length; i++) {
        const B = graph.verts[nearest[i]];
        if (!B) continue;
        addEdge(epNode, nearest[i], 0, { kind: "connector", geometry: [A, B] });
        addEdge(nearest[i], epNode, 0, { kind: "connector", geometry: [B, A] });
      }
    });
  });

  // Connect all points on plateaus
  plateaus.forEach(plat => {
    const verts = graph.verts;
    const br = plat.bottomright;
    const ul = plat.upperleft;
    let platVerts = [];
    for (var v in verts) {
      const pt = verts[v];
      if ( pt.lat > br[0] && pt.lat < ul[0] && pt.lon > br[1] && pt.lon < ul[1]) {
        platVerts.push(v);
      }
    }
    for (let i = 0; i < platVerts.length - 1; i++) {
      const A = graph.verts[platVerts[i]];
      if (!A) continue;

      for (let j = i + 1; j < platVerts.length; j++) {
        const B = graph.verts[platVerts[j]];
        if (!B) continue;

        addEdge(platVerts[i], platVerts[j], 0, { kind: "connector", geometry: [A, B] });
        addEdge(platVerts[j], platVerts[i], 0, { kind: "connector", geometry: [B, A] });
      }
    }
  });

  console.log(
    Object.keys(graph.verts).length,
    Object.values(graph.edges).reduce((s, e) => s + e.length, 0)
  );
  return graph;
}

// --- Initial routing  ----------------------
// Dijkstra for now, A* with great-circle distance (likely?) not beneficial as
// the paths are often zig zag shapes.
export function route(startVert, endVert) {
  if (!graph.verts[startVert] || !graph.verts[endVert]) {return null;}

  const dist = {};
  const prev = {};
  for (let id in graph.verts) dist[id] = Infinity;
  dist[startVert] = 0;

  const pq = new PriorityQueue((a, b) => a[0] > b[0]);
  pq.push([0, startVert]);

  while (!pq.isEmpty()) {
    const [d, u] = pq.pop();

    if (d > dist[u]) continue;
    if (u === endVert) break;

    (graph.edges[u] || []).forEach(e => {
      const alt = d + e.weight;
      if (alt < dist[e.to]) {
        dist[e.to] = alt;
        prev[e.to] = { node: u, edge: e };
        pq.push([alt, e.to]);
      }
    });
  }

  if (!(endVert in dist) || !Number.isFinite(dist[endVert])) {return null;}

  const pathEdges = [];

  let cur = endVert;
  while (prev[cur]) {
    pathEdges.push({from: prev[cur].node, ...prev[cur].edge});
    cur = prev[cur].node;
  }

  return pathEdges.reverse();
}
