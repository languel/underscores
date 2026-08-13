import { normalizeUnderscoreObjectRef } from "./underscoreObjectRef.js";
import { getEditableSvgPathNodes, getSvgPathWorldPoints } from "./svgPathGeometry.js";
import { isSvgObjectElement, normalizeSvgObject } from "./svgObject.js";

const boundsFromPaths = paths => {
  const points = paths.flat();
  if (!points.length) return null;
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point[0]),
    minY: Math.min(bounds.minY, point[1]),
    maxX: Math.max(bounds.maxX, point[0]),
    maxY: Math.max(bounds.maxY, point[1]),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
};

export class GeometryProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(kind, provider) {
    if (!kind || typeof provider !== "function") throw new Error("Geometry providers need a kind and function.");
    this.providers.set(kind, provider);
    return () => this.providers.delete(kind);
  }

  resolve(reference, context = {}) {
    const ref = normalizeUnderscoreObjectRef(reference);
    if (!ref) return null;
    const provider = this.providers.get(ref.kind);
    return provider ? provider(ref, context) : null;
  }
}

export const createUnderscoreGeometryRegistry = ({ getElementPaths } = {}) => {
  const registry = new GeometryProviderRegistry();
  registry.register("element", (ref, context) => {
    const element = (context.elements || []).find(candidate => candidate.id === ref.elementId && !candidate.isDeleted);
    if (!element) return null;
    const paths = typeof getElementPaths === "function" ? getElementPaths(element, context.time || 0, context) : [];
    return { ref, element, paths, bounds: boundsFromPaths(paths), paint: null };
  });
  registry.register("svg-node", (ref, context) => {
    const element = (context.elements || []).find(candidate => candidate.id === ref.elementId && !candidate.isDeleted);
    if (!isSvgObjectElement(element)) return null;
    const svg = normalizeSvgObject(element.customData.underscoreSvg);
    const path = getEditableSvgPathNodes(svg.source).find(candidate => (
      candidate.node.underscoreId === ref.nodeId || candidate.node.id === ref.nodeId
    ));
    if (!path) return null;
    const subpaths = ref.subpathId === undefined
      ? path.subpaths
      : path.subpaths.filter(subpath => String(subpath.index) === String(ref.subpathId));
    const paths = subpaths.filter(subpath => subpath.valid).map(subpath => (
      getSvgPathWorldPoints(element, svg, subpath.geometry, path.transform)
    ));
    return {
      ref,
      element,
      node: path.node,
      paths,
      bounds: boundsFromPaths(paths),
      paint: {
        fill: path.node.attributes.fill || null,
        stroke: path.node.attributes.stroke || null,
        strokeWidth: Number(path.node.attributes["stroke-width"]) || 0,
      },
    };
  });
  return registry;
};
