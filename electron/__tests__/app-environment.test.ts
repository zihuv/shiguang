import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const APP_DATA_PATH = "/Users/test/Library/Application Support";
const PICTURES_PATH = "/Users/test/Pictures";

const { mockApp } = vi.hoisted(() => ({
  mockApp: {
    isPackaged: false,
    getPath: vi.fn((name: string) => {
      if (name === "appData") return APP_DATA_PATH;
      if (name === "pictures") return PICTURES_PATH;
      return "";
    }),
    setPath: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: mockApp,
}));

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
  },
}));

const fssync = (await import("node:fs")).default as unknown as {
  mkdirSync: ReturnType<typeof vi.fn>;
};
const { configureEnvironmentUserDataPath, getDefaultLibraryDirName, getDevelopmentUserDataPath } =
  await import("../app/environment");
const { getDefaultIndexPath } = await import("../storage");

beforeEach(() => {
  vi.unstubAllEnvs();
  mockApp.isPackaged = false;
  mockApp.getPath.mockClear();
  mockApp.setPath.mockClear();
  fssync.mkdirSync.mockClear();
});

describe("app environment paths", () => {
  it("uses isolated development user data and default library paths", () => {
    const developmentUserDataPath = path.join(APP_DATA_PATH, "拾光 Dev");

    expect(getDevelopmentUserDataPath()).toBe(developmentUserDataPath);
    expect(getDefaultLibraryDirName()).toBe("shiguang-dev");
    expect(getDefaultIndexPath()).toBe(path.join(PICTURES_PATH, "shiguang-dev"));

    configureEnvironmentUserDataPath();

    expect(fssync.mkdirSync).toHaveBeenCalledWith(developmentUserDataPath, { recursive: true });
    expect(mockApp.setPath).toHaveBeenCalledWith("userData", developmentUserDataPath);
  });

  it("uses explicit user data overrides for isolated Electron tests", () => {
    const userDataPath = path.resolve("/tmp/shiguang-smoke/user-data");

    vi.stubEnv("SHIGUANG_USER_DATA_DIR", userDataPath);

    configureEnvironmentUserDataPath();

    expect(fssync.mkdirSync).toHaveBeenCalledWith(userDataPath, {
      recursive: true,
    });
    expect(mockApp.setPath).toHaveBeenCalledWith("userData", userDataPath);
  });

  it("keeps packaged builds on production paths", () => {
    mockApp.isPackaged = true;

    expect(getDefaultLibraryDirName()).toBe("shiguang");
    expect(getDefaultIndexPath()).toBe(path.join(PICTURES_PATH, "shiguang"));

    configureEnvironmentUserDataPath();

    expect(fssync.mkdirSync).not.toHaveBeenCalled();
    expect(mockApp.setPath).not.toHaveBeenCalled();
  });
});
