// AI agents: import from here (`./auth`) in UI code, not from the
// individual files inside this folder. This is the module's public surface.
export { useAuth } from './useAuth';
export type { UseAuthResult } from './useAuth';
export type { AuthSession, GoogleUser } from './types';
