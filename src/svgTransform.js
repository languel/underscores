import {
  applyToPoint,
  compose,
  fromDefinition,
  fromTransformAttribute,
  identity,
  inverse,
} from "transformation-matrix";

const finitePoint = value => [
  Number.isFinite(Number(value?.[0])) ? Number(value[0]) : 0,
  Number.isFinite(Number(value?.[1])) ? Number(value[1]) : 0,
];

export const parseSvgTransform = source => {
  const value = String(source || "").trim();
  if (!value) return identity();
  const definitions = fromTransformAttribute(value);
  const matrices = fromDefinition(definitions);
  return matrices.length ? compose(matrices) : identity();
};

export const composeSvgTransforms = (...matrices) => {
  const values = matrices.flat().filter(Boolean);
  return values.length ? compose(values) : identity();
};

export const invertSvgTransform = matrix => inverse(matrix || identity());

export const transformSvgPoint = (matrix, value) => {
  const point = finitePoint(value);
  const result = applyToPoint(matrix || identity(), point);
  return Array.isArray(result) ? result : [result.x, result.y];
};

export const getSvgNodeTransform = (analysis, nodeOrIndex) => {
  const nodes = analysis?.nodes || [];
  const byIndex = new Map(nodes.map(node => [node.index, node]));
  let node = Number.isInteger(nodeOrIndex) ? byIndex.get(nodeOrIndex) : nodeOrIndex;
  const chain = [];
  while (node) {
    if (node.attributes?.transform) chain.unshift(parseSvgTransform(node.attributes.transform));
    node = Number.isInteger(node.parentIndex) ? byIndex.get(node.parentIndex) : null;
  }
  return composeSvgTransforms(chain);
};
