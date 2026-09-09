/** Owns in-flight reads and UI writes; closing cancels reads, disposing cancels all requests. */
export class CheckinController {
    api;
    state = { open: false, month: undefined, data: null, loading: false, busy: false, error: null };
    listeners = new Set();
    reader;
    writer;
    disposed = false;
    /** @param api - Generated Remote adapter. */
    constructor(api) {
        this.api = api;
    }
    /** @returns Immutable snapshot for React. */
    getSnapshot = () => this.state;
    /** @param listener - Snapshot observer. @returns Disposer. */
    subscribe = (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    publish(patch) {
        if (this.disposed)
            return;
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners)
            listener();
    }
    /** Open and refresh from the authoritative Host date/catalog. */
    open() { this.publish({ open: true }); void this.refresh(); }
    /** Close while preserving selection; cancelled reads cannot publish later. */
    close() { this.reader?.abort(); this.publish({ open: false, loading: false }); }
    /** @param month - Selected month; undefined requests the current Host month. */
    selectMonth(month) { this.publish({ month, data: null }); void this.refresh(); }
    /** @param silent - Keep visible data/errors during background polling. */
    async refresh(silent = false) {
        if (this.disposed || !this.state.open || this.state.busy)
            return;
        this.reader?.abort();
        const reader = new AbortController();
        this.reader = reader;
        this.publish({ loading: this.state.data === null, ...(!silent ? { error: null } : {}) });
        try {
            const data = await this.api.month(this.state.month === undefined ? {} : { month: this.state.month }, reader.signal);
            if (reader.signal.aborted || this.disposed)
                return;
            this.publish({ data, month: data.month, loading: false });
        }
        catch (error) {
            if (!reader.signal.aborted)
                this.publish({ loading: false, error: String(error) });
        }
    }
    /** @param operation - One write sharing the drawer's cancellation scope. @returns Whether the write succeeded. */
    async mutate(operation) {
        if (this.state.busy || this.disposed)
            return false;
        this.reader?.abort();
        const writer = new AbortController();
        this.writer = writer;
        this.publish({ busy: true, error: null });
        try {
            await operation(this.api, writer.signal);
            if (writer.signal.aborted)
                return false;
            this.publish({ busy: false });
            await this.refresh();
            return true;
        }
        catch (error) {
            if (!writer.signal.aborted)
                this.publish({ busy: false, error: String(error) });
            return false;
        }
    }
    /** Stop all requests and observers on plugin unload. */
    dispose() { this.disposed = true; this.reader?.abort(); this.writer?.abort(); this.listeners.clear(); }
}
//# sourceMappingURL=controller.js.map
