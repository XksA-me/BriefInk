import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeTempDir(prefix = "briefink-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    path: (...parts: string[]) => join(dir, ...parts),
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}
