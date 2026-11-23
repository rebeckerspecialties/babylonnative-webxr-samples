export async function attachGripModel(controller, load, frames, referenceSpace) {
    const { grip, inputSource } = controller;
    if (!grip || inputSource.hand || inputSource.targetRayMode !== "tracked-pointer") return;
    let disposed = false, roots = [], observer;
    controller.onDisposeObservable.addOnce(() => {
        disposed = true;
        if (observer) frames.remove(observer);
        for (const root of roots) root.dispose(false, true);
    });
    const meshes = await load(inputSource.handedness);
    roots = meshes.filter(mesh => !mesh.parent);
    if (disposed || grip.isDisposed()) {
        for (const root of roots) root.dispose(false, true);
        return;
    }
    for (const mesh of meshes) mesh.isPickable = false;
    for (const root of roots) {
        root.setEnabled(false);
        root.parent = grip;
    }
    observer = frames.add(frame => {
        const visible = !!frame.getPose(inputSource.gripSpace, referenceSpace());
        for (const root of roots) root.setEnabled(visible);
    });
}
