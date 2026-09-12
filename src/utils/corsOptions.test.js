const mockError = jest.fn();
jest.mock("./logger", () => ({ error: mockError, warn: jest.fn(), info: jest.fn() }));

/** Loads the module with a specific config, since config is read at load. */
function withConfig({ CORS_ORIGINS, NODE_ENV }) {
    let mod;
    jest.isolateModules(() => {
        jest.doMock("./config", () => ({
            ...jest.requireActual("./config"),
            CORS_ORIGINS,
            NODE_ENV,
        }));
        mod = require("./corsOptions");
    });
    return mod;
}

/** Runs the origin callback and reports whether the origin was allowed. */
function allows(options, origin) {
    let allowed;
    options.origin(origin, (_err, ok) => {
        allowed = ok;
    });
    return allowed;
}

beforeEach(() => mockError.mockClear());

describe("in production", () => {
    const prod = () =>
        withConfig({
            CORS_ORIGINS: "https://careermate.pages.dev,https://careermate.app",
            NODE_ENV: "production",
        });

    it("allows a configured origin", () => {
        const o = prod().buildCorsOptions();
        expect(allows(o, "https://careermate.pages.dev")).toBe(true);
        expect(allows(o, "https://careermate.app")).toBe(true);
    });

    it("refuses anything else", () => {
        const o = prod().buildCorsOptions();
        expect(allows(o, "https://evil.example")).toBe(false);
        // A near-miss must not pass: subdomains and schemes are not implied.
        expect(allows(o, "http://careermate.app")).toBe(false);
        expect(allows(o, "https://sub.careermate.app")).toBe(false);
    });

    it("does not allow localhost", () => {
        expect(allows(prod().buildCorsOptions(), "http://localhost:3000")).toBe(false);
    });

    it("allows a request with no Origin header", () => {
        // curl, a health check, or another server. CORS governs browsers, and
        // a browser always sends the header.
        expect(allows(prod().buildCorsOptions(), undefined)).toBe(true);
    });

    it("tolerates spaces around the commas", () => {
        const mod = withConfig({
            CORS_ORIGINS: " https://a.example , https://b.example ",
            NODE_ENV: "production",
        });
        const o = mod.buildCorsOptions();
        expect(allows(o, "https://a.example")).toBe(true);
        expect(allows(o, "https://b.example")).toBe(true);
    });

    it("logs loudly when nothing is configured", () => {
        // Otherwise the symptom is a CORS error in the browser and a
        // perfectly healthy-looking server log.
        const o = withConfig({ CORS_ORIGINS: undefined, NODE_ENV: "production" }).buildCorsOptions();
        expect(mockError).toHaveBeenCalled();
        expect(allows(o, "https://careermate.app")).toBe(false);
    });
});

describe("outside production", () => {
    it("allows the dev server with no configuration at all", () => {
        const o = withConfig({ CORS_ORIGINS: undefined, NODE_ENV: "dev" }).buildCorsOptions();
        expect(allows(o, "http://localhost:3000")).toBe(true);
    });

    it("still refuses an unrelated origin", () => {
        const o = withConfig({ CORS_ORIGINS: undefined, NODE_ENV: "dev" }).buildCorsOptions();
        expect(allows(o, "https://evil.example")).toBe(false);
    });

    it("adds configured origins to the dev ones", () => {
        const o = withConfig({
            CORS_ORIGINS: "https://preview.example",
            NODE_ENV: "dev",
        }).buildCorsOptions();
        expect(allows(o, "https://preview.example")).toBe(true);
        expect(allows(o, "http://localhost:3000")).toBe(true);
    });

    it("does not warn", () => {
        withConfig({ CORS_ORIGINS: undefined, NODE_ENV: "dev" }).buildCorsOptions();
        expect(mockError).not.toHaveBeenCalled();
    });
});
