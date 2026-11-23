// WebXR coordinates: metres, right handed, -Z forward. Only yaw sets the panel heading.
export function menuAnchor(m, distance = 1.25) {
    const length = Math.hypot(m[8], m[10]);
    if (length < 0.1) return null;
    const nx = m[8] / length, nz = m[10] / length;
    return { x: m[12] - distance * nx, y: m[13], z: m[14] - distance * nz, nx, nz };
}

export function menuHit(a, ray, width, height) {
    if (!a || !ray) return null;
    const dx = -ray[8], dy = -ray[9], dz = -ray[10];
    const facing = dx * a.nx + dz * a.nz;
    if (facing >= -0.0001) return null;
    const t = ((a.x - ray[12]) * a.nx + (a.z - ray[14]) * a.nz) / facing;
    if (t < 0) return null;
    const u = 0.5 + ((ray[12] + dx*t - a.x)*a.nz - (ray[14] + dz*t - a.z)*a.nx) / width;
    const v = 0.5 - (ray[13] + dy*t - a.y) / height;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [u, v] : null;
}

// A projection or benchmark fixture can end and replace the session without
// rebuilding the scene. Input events and the world-fixed anchor belong to a session.
export function bindMenuInput(manager, select, recenter) {
    let current;
    const bind = session => {
        if (current === session) return;
        current?.removeEventListener("select",select);
        current?.removeEventListener("squeeze",recenter);
        current = session;
        recenter();
        current?.addEventListener("select",select);
        current?.addEventListener("squeeze",recenter);
    };
    const begin = manager.onXRSessionInit.add(bind);
    const end = manager.onXRSessionEnded.add(()=>bind(null));
    bind(manager.session);
    return () => {
        manager.onXRSessionInit.remove(begin);
        manager.onXRSessionEnded.remove(end);
        bind(null);
    };
}
