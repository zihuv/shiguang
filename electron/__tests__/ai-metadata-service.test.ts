import { describe, expect, it } from "vitest";
import { buildAiRenameCandidateName } from "../commands/ai-metadata-service";

describe("AI metadata service", () => {
  it("uses only a numeric suffix for AI rename conflicts", () => {
    expect(buildAiRenameCandidateName("海报.jpg", 0)).toBe("海报.jpg");
    expect(buildAiRenameCandidateName("海报.jpg", 1)).toBe("海报_2.jpg");
    expect(buildAiRenameCandidateName("海报.jpg", 2)).toBe("海报_3.jpg");
  });
});
