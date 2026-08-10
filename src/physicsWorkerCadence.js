export const shouldPublishPhysicsPoses = ({ totalSteps, timestamp, lastPoseAt, idleIntervalMs = 20 }) => (
  Number(totalSteps) > 0 || Number(timestamp) - Number(lastPoseAt) >= Number(idleIntervalMs)
);
