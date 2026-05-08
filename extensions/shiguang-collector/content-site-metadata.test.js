import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadResolver() {
  vi.resetModules();
  delete globalThis.__shiguangCollectorSiteMetadata;
  await import("./content-site-metadata.js");
  return globalThis.__shiguangCollectorSiteMetadata;
}

describe("collector site metadata", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  afterEach(() => {
    delete globalThis.__shiguangCollectorSiteMetadata;
  });

  it("keeps the loaded Unsplash image url while adding page metadata", async () => {
    document.title = "A Deer in Snow | Unsplash";
    document.head.innerHTML = `
      <meta property="og:title" content="A Deer in Snow | Unsplash" />
      <meta property="og:description" content="A deer walking through a snowy field." />
      <meta name="twitter:creator" content="@heinoeisner" />
    `;
    document.body.innerHTML = `<img id="target" src="https://images.unsplash.com/photo-123?w=640" alt="Deer" />`;

    const resolver = await loadResolver();
    const target = document.getElementById("target");
    const payload = resolver.resolveCollectionPayload({
      target,
      imageUrl: "https://images.unsplash.com/photo-123?w=640",
      sourceUrl:
        "https://unsplash.com/photos/a-deer-with-large-antlers-walks-through-a-snowy-field-QEMy1ljAzGE",
      pageUrl:
        "https://unsplash.com/photos/a-deer-with-large-antlers-walks-through-a-snowy-field-QEMy1ljAzGE",
    });

    expect(payload.imageUrl).toBe("https://images.unsplash.com/photo-123?w=640");
    expect(payload.metadata.provider).toBe("Unsplash");
    expect(payload.metadata.author).toBe("heinoeisner");
    expect(payload.metadata.title).toBe("A Deer in Snow");
  });

  it("keeps the loaded Pexels image url and resolves the detail source page", async () => {
    document.title = "Forest Trail - Pexels";
    document.head.innerHTML = `
      <meta property="og:title" content="Forest Trail - Pexels" />
      <meta property="og:description" content="A trail through the forest." />
    `;
    document.body.innerHTML = `
      <a href="https://www.pexels.com/photo/forest-trail-12345/">
        <img id="target" src="https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?auto=compress&cs=tinysrgb&w=600" alt="Forest trail" />
      </a>
    `;

    const resolver = await loadResolver();
    const payload = resolver.resolveCollectionPayload({
      target: document.getElementById("target"),
      imageUrl:
        "https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?auto=compress&cs=tinysrgb&w=600",
      pageUrl: "https://www.pexels.com/search/forest/",
    });

    expect(payload.sourceUrl).toBe("https://www.pexels.com/photo/forest-trail-12345/");
    expect(payload.imageUrl).toBe(
      "https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?auto=compress&cs=tinysrgb&w=600",
    );
    expect(payload.metadata.provider).toBe("Pexels");
  });

  it("keeps the loaded Wikimedia image url while preserving the source page", async () => {
    document.title = "File:Example.jpg - Wikimedia Commons";
    document.head.innerHTML = `
      <meta property="og:title" content="File:Example.jpg - Wikimedia Commons" />
      <meta property="og:description" content="Example image file." />
    `;
    document.body.innerHTML = `
      <div class="fullImageLink">
        <a href="https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg">Original file</a>
      </div>
      <img id="target" src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/640px-Example.jpg" alt="Example" />
    `;

    const resolver = await loadResolver();
    const payload = resolver.resolveCollectionPayload({
      target: document.getElementById("target"),
      imageUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/640px-Example.jpg",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
      pageUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
    });

    expect(payload.imageUrl).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/640px-Example.jpg",
    );
    expect(payload.metadata.provider).toBe("Wikimedia Commons");
    expect(payload.sourceUrl).toBe("https://commons.wikimedia.org/wiki/File:Example.jpg");
  });
});
