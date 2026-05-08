import { describe, expect, it } from "vitest";

describe("collector import metadata", () => {
  it("normalizes metadata and builds a readable description", async () => {
    const { buildCollectorImportDescription, parseCollectorImportMetadata } =
      await import("../commands/collector-import-metadata");

    const metadata = parseCollectorImportMetadata({
      title: "  Winter Deer  ",
      description: "  A deer walking through a snowy field.  ",
      author: "  heino eisner ",
      provider: "Unsplash",
      license: "Unsplash License",
      tags: [" deer ", "winter", "deer", ""],
    });

    expect(metadata).toMatchObject({
      title: "Winter Deer",
      description: "A deer walking through a snowy field.",
      author: "heino eisner",
      provider: "Unsplash",
      tags: ["deer", "winter"],
    });

    expect(
      buildCollectorImportDescription(metadata, "https://unsplash.com/photos/example"),
    ).toContain("作者: heino eisner");
    expect(
      buildCollectorImportDescription(metadata, "https://unsplash.com/photos/example"),
    ).toContain("标签: deer / winter");
  });
});
