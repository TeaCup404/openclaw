import { afterEach, expect, it, vi } from "vitest";
import type { ChannelDirectoryEntry } from "../../channels/plugins/types.public.js";
import type { OpenClawConfig } from "../../config/config.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";
import { normalizeSessionDeliveryState } from "../../utils/delivery-context.shared.js";
import { resolveDeliveryTarget } from "./delivery-target.js";

afterEach(() => {
  resetPluginRuntimeStateForTest();
});

it("rejects a same-name implicit cron directory destination outside its allowlist", async () => {
  const resolveTarget = vi.fn(({ to, allowFrom }: { to?: string; allowFrom?: string[] }) =>
    to === "denied-room" && allowFrom?.length
      ? { ok: false as const, error: new Error("cron target denied") }
      : { ok: true as const, to: to ?? "" },
  );
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: "alpha",
        source: "test",
        plugin: {
          ...createOutboundTestPlugin({
            id: "alpha",
            outbound: { deliveryMode: "gateway", resolveTarget },
            capabilities: { chatTypes: ["group"] },
            messaging: { targetPrefixes: ["alpha"] },
          }),
          config: {
            listAccountIds: () => [],
            resolveAccount: () => ({}),
            resolveAllowFrom: ({ cfg }: { cfg: OpenClawConfig }) =>
              (cfg.channels?.alpha as { allowFrom?: string[] } | undefined)?.allowFrom,
          },
          directory: {
            listGroups: async () => [
              { kind: "group", id: "denied-room", name: "alpha" } satisfies ChannelDirectoryEntry,
            ],
          },
        },
      },
    ]),
  );

  const result = await resolveDeliveryTarget(
    { bindings: [], channels: { alpha: { allowFrom: ["alpha"] } } } as OpenClawConfig,
    "agent-b",
    { channel: "last" },
    {
      sessionContext: {
        mainSessionKey: "agent:agent-b:main",
        main: {
          sessionId: "cron-allowlist-test",
          updatedAt: 1,
          delivery: normalizeSessionDeliveryState({
            context: { channel: "alpha", to: "alpha" },
          }),
        },
        usedSharedMainFallback: false,
      },
    },
  );

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected outbound policy rejection");
  }
  expect(result.error.message).toBe("cron target denied");
  expect(resolveTarget).toHaveBeenLastCalledWith(
    expect.objectContaining({ to: "denied-room", mode: "implicit", allowFrom: ["alpha"] }),
  );
});
