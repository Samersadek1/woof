// WhatsApp client lifecycle. Owns init/auth/ready watchdogs, auto-recovery,
// hard-session reset, and graceful shutdown so index.js stays focused on
// wiring instead of managing timers.
//
// Returns:
//   - queueClientInitialize(trigger): kick the client into life
//   - gracefulShutdown(signal): tear it down on SIGTERM / SIGINT
//   - getLatestQR(): expose the last QR for the HTTP server

import { rm } from "node:fs/promises";

const DEFAULTS = {
  initGuardMs: 120_000,
  readyStallMs: 180_000,
  authToReadyMs: 60_000,
  maxRecoveryRetries: 2,
  reconnectDelayMs: 10_000,
  hardResetCooldownMs: 3_000,
  recoveryDelayMs: 5_000,
};

export function createWaRuntime({
  client,
  store,
  getSessionId,
  localSessionPath,
  getDisplayName = () => "WhatsApp",
  onListGroupsAtBoot,
  config = {},
}) {
  const cfg = { ...DEFAULTS, ...config };

  let isClientInitializing = false;
  let isClientReady = false;
  let isShuttingDown = false;
  let initGuardTimer = null;
  let readyStallTimer = null;
  let authReadyTimer = null;
  let autoRecoveryAttempts = 0;
  let hasHardResetSession = false;
  let latestQR = null;
  let awaitingQrScan = false;

  const clearTimer = (handle) => {
    if (handle) clearTimeout(handle);
    return null;
  };

  const clearInitGuardTimer = () => {
    initGuardTimer = clearTimer(initGuardTimer);
  };
  const clearReadyStallTimer = () => {
    readyStallTimer = clearTimer(readyStallTimer);
  };
  const clearAuthReadyTimer = () => {
    authReadyTimer = clearTimer(authReadyTimer);
  };

  function armReadyStallTimer(trigger) {
    clearReadyStallTimer();
    console.log("Ready-stall timer armed:", { trigger, timeout_ms: cfg.readyStallMs });
    readyStallTimer = setTimeout(() => {
      if (awaitingQrScan) {
        console.log("Ready-stall timeout ignored while awaiting QR scan");
        return;
      }
      if (!isClientReady && !isShuttingDown) {
        void scheduleAutoRecover(`ready-timeout:${trigger}`);
      }
    }, cfg.readyStallMs);
  }

  function armAuthReadyTimer(trigger) {
    clearAuthReadyTimer();
    console.log("Auth-to-ready timer armed:", { trigger, timeout_ms: cfg.authToReadyMs });
    authReadyTimer = setTimeout(() => {
      if (!isClientReady && !isShuttingDown) {
        void scheduleAutoRecover(`auth-no-ready:${trigger}`);
      }
    }, cfg.authToReadyMs);
  }

  // Hard reset: destroy the client, delete remote+local session, then init.
  // Used when we keep authenticating but never reach ready (corrupted cookie).
  async function performHardReset(reason) {
    hasHardResetSession = true;
    autoRecoveryAttempts = 0;
    console.error("Escalating to hard session reset:", { reason });
    clearInitGuardTimer();
    clearReadyStallTimer();
    clearAuthReadyTimer();
    isClientInitializing = false;
    isClientReady = false;

    try {
      await client.destroy();
      console.log("Client destroyed for hard reset");
    } catch (err) {
      console.error("Client destroy failed during hard reset:", err?.message ?? err);
    }

    try {
      await store.delete({ session: `RemoteAuth-${getSessionId()}` });
      console.log("RemoteAuth session object deleted for hard reset");
    } catch (err) {
      console.error("RemoteAuth delete failed during hard reset:", err?.message ?? err);
    }

    try {
      await rm(localSessionPath(`RemoteAuth-${getSessionId()}`), { force: true });
    } catch {
      // Best-effort local cleanup.
    }

    setTimeout(() => queueClientInitialize("hard-reset-auth-no-ready"), cfg.hardResetCooldownMs);
  }

  async function scheduleAutoRecover(reason) {
    if (isShuttingDown || isClientReady) {
      if (isClientReady) {
        console.log("Auto-recovery ignored (client already ready):", { reason });
      }
      return;
    }

    if (autoRecoveryAttempts >= cfg.maxRecoveryRetries) {
      if (reason.startsWith("auth-no-ready:") && !hasHardResetSession) {
        await performHardReset(reason);
        return;
      }
      console.error("Auto-recovery skipped (retry limit reached):", {
        reason,
        attempts: autoRecoveryAttempts,
        max: cfg.maxRecoveryRetries,
      });
      return;
    }

    autoRecoveryAttempts += 1;
    console.error("Auto-recovery triggered:", {
      reason,
      attempt: autoRecoveryAttempts,
      max: cfg.maxRecoveryRetries,
    });
    clearInitGuardTimer();
    clearReadyStallTimer();
    clearAuthReadyTimer();
    isClientInitializing = false;
    isClientReady = false;

    try {
      await client.destroy();
      console.log("Client destroyed for auto-recovery");
    } catch (err) {
      console.error("Client destroy failed during auto-recovery:", err?.message ?? err);
    }
    setTimeout(() => queueClientInitialize(`auto-recover:${reason}`), cfg.recoveryDelayMs);
  }

  function queueClientInitialize(trigger) {
    if (isShuttingDown) {
      console.log("Client initialize skipped (shutdown in progress):", trigger);
      return;
    }
    if (isClientInitializing) {
      console.log("Client initialize skipped (already running):", trigger);
      return;
    }
    isClientInitializing = true;
    isClientReady = false;
    clearInitGuardTimer();
    armReadyStallTimer(trigger);
    console.log("Client initialize requested:", trigger);
    initGuardTimer = setTimeout(() => {
      if (isClientInitializing) {
        void scheduleAutoRecover(`initialize-guard-timeout:${trigger}`);
      }
    }, cfg.initGuardMs);

    client
      .initialize()
      .catch((err) => {
        console.error("Client initialize failed:", err?.message ?? err);
        void scheduleAutoRecover(`initialize-error:${trigger}`);
      })
      .finally(() => {
        clearInitGuardTimer();
        isClientInitializing = false;
      });
  }

  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Graceful shutdown start (${signal})`);
    try {
      await client.destroy();
      console.log("WhatsApp client destroyed cleanly");
    } catch (err) {
      console.error("Error during WhatsApp client shutdown:", err?.message ?? err);
    } finally {
      process.exit(0);
    }
  }

  client.on("qr", (qr) => {
    latestQR = qr;
    awaitingQrScan = true;
    clearReadyStallTimer();
    clearAuthReadyTimer();
    console.log("QR code ready -- open the Railway URL to scan");
  });

  client.on("ready", async () => {
    isClientReady = true;
    autoRecoveryAttempts = 0;
    hasHardResetSession = false;
    awaitingQrScan = false;
    clearReadyStallTimer();
    clearInitGuardTimer();
    clearAuthReadyTimer();
    latestQR = null;
    console.log(`✓ ${getDisplayName()} WhatsApp agent ready`);
    console.log("RemoteAuth client ID:", getSessionId());
    if (typeof onListGroupsAtBoot === "function") {
      try {
        await onListGroupsAtBoot();
      } catch (err) {
        console.error("Group bootstrap callback failed:", err?.message ?? err);
      }
    }
  });

  client.on("authenticated", () => {
    console.log("WhatsApp authenticated");
    awaitingQrScan = false;
    armAuthReadyTimer("authenticated_event");
  });

  client.on("auth_failure", (message) => {
    console.error("WhatsApp auth failure:", message);
    void scheduleAutoRecover("auth_failure");
  });

  client.on("change_state", (state) => {
    console.log("WhatsApp state changed:", state);
  });

  client.on("loading_screen", (percent, message) => {
    console.log("WhatsApp loading screen:", { percent, message });
  });

  client.on("disconnected", (reason) => {
    isClientReady = false;
    awaitingQrScan = false;
    clearReadyStallTimer();
    clearInitGuardTimer();
    clearAuthReadyTimer();
    console.error("WhatsApp disconnected:", reason);
    setTimeout(() => queueClientInitialize("disconnected"), cfg.reconnectDelayMs);
  });

  return {
    queueClientInitialize,
    gracefulShutdown,
    getLatestQR: () => latestQR,
  };
}
