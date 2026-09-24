const { openEventStream } = require("./sse");

function fakeResponse() {
    const res = {
        headers: {},
        written: [],
        writableEnded: false,
        statusCode: null,
        status: jest.fn(function status(code) {
            this.statusCode = code;
            return this;
        }),
        setHeader: jest.fn(function setHeader(name, value) {
            this.headers[name] = value;
        }),
        flushHeaders: jest.fn(),
        write: jest.fn(function write(chunk) {
            this.written.push(chunk);
        }),
        end: jest.fn(function end() {
            this.writableEnded = true;
        }),
    };
    return res;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("openEventStream", () => {
    it("sends event-stream headers that stop proxies buffering, and flushes them", () => {
        const res = fakeResponse();
        openEventStream(res).close();

        expect(res.statusCode).toBe(200);
        expect(res.headers["Content-Type"]).toMatch(/^text\/event-stream/);
        expect(res.headers["Cache-Control"]).toContain("no-transform");
        expect(res.headers["X-Accel-Buffering"]).toBe("no");
        expect(res.flushHeaders).toHaveBeenCalled();
    });

    it("writes an event as an event line, a JSON data line and a blank line", () => {
        const res = fakeResponse();
        const stream = openEventStream(res);
        stream.send("text", { text: "Hello" });
        stream.close();

        expect(res.written[0]).toBe('event: text\ndata: {"text":"Hello"}\n\n');
    });

    it("keeps the connection alive with comment lines while idle", () => {
        const res = fakeResponse();
        const stream = openEventStream(res, { heartbeatMs: 1000 });
        jest.advanceTimersByTime(2500);
        expect(res.written).toEqual([": ping\n\n", ": ping\n\n"]);
        stream.close();
    });

    it("stops the heartbeat and ends the response on close", () => {
        const res = fakeResponse();
        const stream = openEventStream(res, { heartbeatMs: 1000 });
        stream.close();
        jest.advanceTimersByTime(5000);

        expect(res.end).toHaveBeenCalledTimes(1);
        expect(res.written).toEqual([]);
        expect(jest.getTimerCount()).toBe(0);
    });

    it("ignores sends after the response has ended", () => {
        const res = fakeResponse();
        const stream = openEventStream(res);
        stream.close();
        stream.send("text", { text: "late" });
        expect(res.written).toEqual([]);
    });
});
