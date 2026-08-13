export const MEDIA_MAP_VERSION = 1;

export const normalizeMediaMapConfig = value => {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: MEDIA_MAP_VERSION,
    streamId: typeof source.streamId === "string" ? source.streamId : "",
  };
};

export const isMediaMapElement = element => Boolean(
  element
  && !element.isDeleted
  && element.customData?.underscoreMediaMap,
);
