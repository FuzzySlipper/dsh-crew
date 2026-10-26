import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Sidebar footer action and drawer that put the Crew review pool one click away. */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { CrewReviewPanel } from "./CrewReviewPanel.js";
/** Open/closed state shared by the footer action and the overlay drawer. */
export class CrewReviewDrawerController {
    open = false;
    listeners = new Set();
    /** Element focused again when the drawer closes. */
    returnTarget;
    /** @returns Whether the drawer is open. */
    getSnapshot() { return this.open; }
    subscribe(listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    show() { this.set(true); }
    close() { this.set(false); }
    dispose() { this.set(false); this.listeners.clear(); }
    set(open) {
        if (this.open === open)
            return;
        this.open = open;
        for (const listener of this.listeners)
            listener();
    }
}
/** Render the Crew review action in the DSH sidebar footer. */
export function CrewReviewTrigger({ wide, controller }) {
    const open = useOpen(controller);
    const show = (event) => { controller.returnTarget = event.currentTarget; controller.show(); };
    return _jsx("button", { type: "button", className: "dshCrewSessionsTrigger", "aria-label": "Open Crew review", "aria-haspopup": "dialog", "aria-expanded": open, onClick: show, children: wide ? 'Crew review' : 'Review' });
}
/** Render the review pool in a drawer; the panel only polls while it is open. */
export function CrewReviewOverlay({ controller }) {
    const open = useOpen(controller);
    const drawer = useRef(null);
    const closeButton = useRef(null);
    useEffect(() => {
        if (!open || drawer.current === null)
            return;
        closeButton.current?.focus();
        const onKeyDown = (event) => {
            if (event.key !== 'Escape')
                return;
            event.preventDefault();
            controller.close();
        };
        const target = drawer.current.ownerDocument;
        target.addEventListener('keydown', onKeyDown);
        return () => { target.removeEventListener('keydown', onKeyDown); if (controller.returnTarget?.isConnected)
            controller.returnTarget.focus(); };
    }, [controller, open]);
    if (!open)
        return null;
    return _jsx("div", { className: "dshCrewSessionsOverlay", role: "presentation", children: _jsxs("section", { ref: drawer, className: "dshCrewSessionsDrawer dshCrewReviewDrawer", role: "dialog", "aria-modal": "false", "aria-labelledby": "dsh-crew-review-title", tabIndex: -1, children: [_jsxs("header", { className: "dshCrewSessionsHeader", children: [_jsxs("div", { children: [_jsx("h2", { id: "dsh-crew-review-title", children: "Crew review" }), _jsx("p", { children: "Reviewer pool, recent verdicts and failures, and a reviewer sandbox check." })] }), _jsx("button", { ref: closeButton, type: "button", className: "dshCrewSessionsButton", onClick: () => { controller.close(); }, children: "Close" })] }), _jsx("div", { className: "dshCrewReviewDrawerBody", children: _jsx(CrewReviewPanel, {}) })] }) });
}
function useOpen(controller) { return useSyncExternalStore(listener => controller.subscribe(listener), () => controller.getSnapshot()); }
//# sourceMappingURL=CrewReviewDrawer.js.map