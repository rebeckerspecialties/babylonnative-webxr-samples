// Pending render state is applied between animation frames, never between eye draws.
function projectionReplacement(binding, initial, descriptor, period = 24) {
    const alternate = binding.createProjectionLayer({ ...descriptor, scaleFactor: 0.75 });
    let current = initial, next = initial, count = 0, switches = 0;
    return {
        begin(session) {
            if (session.renderState.layers[0] !== next) throw Error("Pending projection layer missing on next frame");
            if (current !== next) ++switches;
            current = next;
            return current;
        },
        end(session) {
            if (++count % period !== 0) return;
            next = current === initial ? alternate : initial;
            session.updateRenderState({ layers: [next] });
            if (session.renderState.layers[0] !== current) throw Error("Projection layer replaced inside the active frame");
        },
        get complete() { return switches >= 2; },
    };
}
