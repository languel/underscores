export const LAST_SCENE_STORAGE_KEY = "drawerator_last_scene_v1";

export const saveLastScene = sceneJson => {
  try {
    localStorage.setItem(LAST_SCENE_STORAGE_KEY, sceneJson);
    return true;
  } catch (error) {
    console.error("Drawerator could not save the last scene.", error);
    return false;
  }
};

export const loadLastScene = () => {
  try {
    return localStorage.getItem(LAST_SCENE_STORAGE_KEY) || "";
  } catch (error) {
    console.error("Drawerator could not load the last scene.", error);
    return "";
  }
};
