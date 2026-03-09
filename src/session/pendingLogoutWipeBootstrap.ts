import { enforcePendingLogoutWipeIfNeeded } from "./logoutOrchestrator";

// Ensure stale auth-bound client state is purged before other modules read persisted preferences.
enforcePendingLogoutWipeIfNeeded();
