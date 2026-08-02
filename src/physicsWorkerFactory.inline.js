import InlinePhysicsWorker from "./physics.worker.js?worker&inline";

export const createPhysicsWorker = () => new InlinePhysicsWorker();
