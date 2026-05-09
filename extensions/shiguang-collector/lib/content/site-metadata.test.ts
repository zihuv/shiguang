import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadResolver() {
  vi.resetModules();
  const module = await import("./site-metadata");
  return module.siteMetadata;
}

describe("collector site metadata", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(payload.imageUrl).toBe("https://images.unsplash.com/photo-123");
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
      "https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?auto=compress",
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
      "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg",
    );
    expect(payload.metadata.provider).toBe("Wikimedia Commons");
    expect(payload.sourceUrl).toBe("https://commons.wikimedia.org/wiki/File:Example.jpg");
  });

  it("resolves Pinterest pin source pages and original pin image urls", async () => {
    document.title = "Mood board";
    document.body.innerHTML = `
      <div data-grid-item>
        <a href="/pin/123456789/">
          <img id="target" src="https://i.pinimg.com/236x/aa/bb/cc/example.jpg" alt="Poster" />
        </a>
      </div>
    `;

    const resolver = await loadResolver();
    const payload = resolver.resolveCollectionPayload({
      target: document.getElementById("target"),
      imageUrl: "https://i.pinimg.com/236x/aa/bb/cc/example.jpg",
      pageUrl: "https://www.pinterest.com/search/pins/?q=poster",
    });

    expect(payload.imageUrl).toBe("https://i.pinimg.com/originals/aa/bb/cc/example.jpg");
    expect(payload.sourceUrl).toBe("https://www.pinterest.com/pin/123456789/");
    expect(payload.metadata.provider).toBe("Pinterest");
  });

  it("resolves Behance project metadata from the current page DOM", async () => {
    document.title = "Brand System | Behance";
    document.body.innerHTML = `
      <a href="https://www.behance.net/gallery/12345/Brand-System">
        <img id="target" src="https://mir-s3-cdn-cf.behance.net/project_modules/disp/example.jpg" />
      </a>
      <figcaption class="Project-caption-abc">
        <span class="Project-title-abc">Brand System</span>
      </figcaption>
    `;

    const resolver = await loadResolver();
    const payload = resolver.resolveCollectionPayload({
      target: document.getElementById("target"),
      imageUrl: "https://mir-s3-cdn-cf.behance.net/project_modules/disp/example.jpg",
      pageUrl: "https://www.behance.net/search/projects/brand",
    });

    expect(payload.imageUrl).toBe(
      "https://mir-s3-cdn-cf.behance.net/project_modules/source/example.jpg",
    );
    expect(payload.sourceUrl).toBe("https://www.behance.net/gallery/12345/Brand-System");
    expect(payload.metadata.title).toBe("Brand System");
    expect(payload.metadata.provider).toBe("Behance");
  });

  it("resolves Dribbble shot pages and strips teaser size suffixes", async () => {
    document.title = "Dashboard - Dribbble";
    document.body.innerHTML = `
      <div data-thumbnail-id="shot">
        <a class="shot-thumbnail-link" href="https://dribbble.com/shots/123-Dashboard">
          <img id="target" src="https://cdn.dribbble.com/userupload/1/file/original-example_1x.jpg?resize=400x300" />
        </a>
        <span class="shot-thumbnail-title">Dashboard</span>
      </div>
    `;

    const resolver = await loadResolver();
    const payload = resolver.resolveCollectionPayload({
      target: document.getElementById("target"),
      imageUrl: "https://cdn.dribbble.com/userupload/1/file/original-example_1x.jpg?resize=400x300",
      pageUrl: "https://dribbble.com/search/dashboard",
    });

    expect(payload.imageUrl).toBe(
      "https://cdn.dribbble.com/userupload/1/file/original-example.jpg",
    );
    expect(payload.sourceUrl).toBe("https://dribbble.com/shots/123-Dashboard");
    expect(payload.metadata.provider).toBe("Dribbble");
  });

  it("resolves ArtStation artwork pages and larger CDN image paths", async () => {
    document.title = "Space Station - ArtStation";
    document.body.innerHTML = `
      <a href="https://www.artstation.com/artwork/abc123">
        <img id="target" src="https://cdna.artstation.com/p/assets/images/images/001/small_square/example.jpg?1" />
      </a>
      <h1>Space Station</h1>
      <a class="user-name" href="/artist">Ada Artist</a>
    `;

    const resolver = await loadResolver();
    const payload = resolver.resolveCollectionPayload({
      target: document.getElementById("target"),
      imageUrl: "https://cdna.artstation.com/p/assets/images/images/001/small_square/example.jpg?1",
      pageUrl: "https://www.artstation.com/search",
    });

    expect(payload.imageUrl).toBe(
      "https://cdna.artstation.com/p/assets/images/images/001/large/example.jpg",
    );
    expect(payload.sourceUrl).toBe("https://www.artstation.com/artwork/abc123");
    expect(payload.metadata.author).toBe("Ada Artist");
  });

  it("resolves pixiv artwork pages and original image paths from loaded thumbnails", async () => {
    document.title = "Blue Hour - pixiv";
    document.body.innerHTML = `
      <a href="https://www.pixiv.net/artworks/12345678">
        <img id="target" src="https://i.pximg.net/c/250x250_80_a2/custom-thumb/img/2025/01/01/00/00/00/12345678_p0_custom1200.jpg" />
      </a>
      <h1>Blue Hour</h1>
      <a href="/users/42">Pixiv Artist</a>
    `;

    const resolver = await loadResolver();
    const payload = resolver.resolveCollectionPayload({
      target: document.getElementById("target"),
      imageUrl:
        "https://i.pximg.net/c/250x250_80_a2/custom-thumb/img/2025/01/01/00/00/00/12345678_p0_custom1200.jpg",
      pageUrl: "https://www.pixiv.net/tags/blue/artworks",
    });

    expect(payload.imageUrl).toBe(
      "https://i.pximg.net/img-original/img/2025/01/01/00/00/00/12345678_p0.jpg",
    );
    expect(payload.sourceUrl).toBe("https://www.pixiv.net/artworks/12345678");
    expect(payload.metadata.provider).toBe("pixiv");
  });
});
