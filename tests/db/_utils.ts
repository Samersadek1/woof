import { expect } from "vitest";
import { createTestScope } from "../helpers/testScope";

export async function withScope<T>(fn: (scope: ReturnType<typeof createTestScope>) => Promise<T>) {
  const scope = createTestScope();
  try {
    return await fn(scope);
  } finally {
    await scope.cleanup();
  }
}

export async function expectRpcError(
  run: () => Promise<{
    error: { message?: string } | null;
  }>,
  contains: string,
) {
  const result = await run();
  expect(result.error?.message ?? "").toContain(contains);
}
