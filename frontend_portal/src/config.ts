/**
 * Application Configuration
 * Connects to the shared Google ADK / Tectonic Backend.
 */

// If VITE_BACKEND_URL is defined (e.g. in production or cross-port), use it; otherwise fallback to '' to leverage Vite proxy.
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
export const PORT = Number(import.meta.env.VITE_PORT || 5174);
export const STUDIO_URL = 'http://localhost:5173';

