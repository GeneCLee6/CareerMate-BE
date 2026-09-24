/**
 * Server-sent events over an Express response.
 *
 * An event is two lines and a blank line:
 *
 *     event: text
 *     data: {"text":"Hello"}
 *
 * The browser reads them as they arrive, instead of waiting for the whole
 * response, which is the point: a reply appears word by word.
 */

/** How often to send a comment line while nothing else is being sent. */
const HEARTBEAT_MS = 15_000;

/**
 * Opens an event stream on `res` and returns `send` and `close`.
 *
 * Headers are flushed at once. From here on the status is 200 and cannot
 * change, so anything that should be a 4xx or 5xx must be decided before
 * this is called; later failures are reported as an `error` event.
 */
function openEventStream(res, { heartbeatMs = HEARTBEAT_MS } = {}) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    // no-transform stops intermediaries compressing the stream, which would
    // make them hold bytes back until a compression block fills.
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Tells nginx-style proxies not to buffer the response.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // While the model thinks, nothing may be sent for a long time. A comment
    // line keeps proxies from closing what looks like an idle connection;
    // clients ignore it.
    const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(": ping\n\n");
    }, heartbeatMs);

    return {
        send(event, data) {
            if (res.writableEnded) return;
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        close() {
            clearInterval(heartbeat);
            if (!res.writableEnded) res.end();
        },
    };
}

module.exports = { openEventStream, HEARTBEAT_MS };
