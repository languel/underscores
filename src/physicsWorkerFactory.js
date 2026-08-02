export const createPhysicsWorker = () => new Worker(new URL("./physics.worker.js", import.meta.url), { type: "module" });
