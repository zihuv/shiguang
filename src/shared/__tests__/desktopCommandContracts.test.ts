import { describe, expect, it } from "vitest";

import {
  WRITE_DESKTOP_COMMANDS,
  type DesktopCommandName,
} from "@/shared/desktop-command-contracts";

const writeCommands: readonly DesktopCommandName[] = WRITE_DESKTOP_COMMANDS;

describe("desktop command contracts", () => {
  it("keeps write commands unique and typed against desktop commands", () => {
    expect(new Set(writeCommands).size).toBe(writeCommands.length);
    expect(writeCommands).toContain("update_file_metadata");
    expect(writeCommands).toContain("restore_folder");
    expect(writeCommands).toContain("start_visual_index_task");
    expect(writeCommands).toContain("set_setting");
  });
});
