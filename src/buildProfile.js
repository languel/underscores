// Build-time feature switches. Vite replaces import.meta.env values in the
// browser bundle; keeping this in one module makes the public/student profile
// explicit without changing the normal local development experience.
export const isPublicSafeBuild = import.meta.env.VITE_PUBLIC_SAFE_BUILD === "true";
