/** Owns in-flight reads and UI writes; disposing cancels all requests. */
export class CheckinController {
    api;
    state = { month: undefined, data: null, loading: false, busy: false, error: null };
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
    /** Cancel the current read while preserving selection and loaded data. */
    cancelRead() { this.reader?.abort(); this.publish({ loading: false }); }
    /** Clear an error after its owning flow has dismissed it. */
    clearError() { this.publish({ error: null }); }
    /** @param month - Selected month; undefined requests the current Host month. */
    selectMonth(month) { this.publish({ month, data: null }); void this.refresh(); }
    /** @param silent - Keep visible data/errors during background polling. */
    async refresh(silent = false) {
        if (this.disposed || this.state.busy)
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
    /** @param operation - One write sharing the UI controller's cancellation scope. @returns Whether the write succeeded. */
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
    /** Export without changing the current calendar snapshot. */
    async exportData() {
        if (this.state.busy || this.disposed)
            return null;
        const writer = new AbortController();
        this.writer = writer;
        this.publish({ busy: true, error: null });
        try {
            const result = await this.api.exportData({}, writer.signal);
            if (writer.signal.aborted || this.disposed)
                return null;
            this.publish({ busy: false });
            return result;
        }
        catch (error) {
            if (!writer.signal.aborted)
                this.publish({ busy: false, error: String(error) });
            return null;
        }
    }
    /** Import a validated backup and refresh the current calendar. */
    async importData(request) {
        if (this.state.busy || this.disposed)
            return null;
        this.reader?.abort();
        const writer = new AbortController();
        this.writer = writer;
        this.publish({ busy: true, error: null });
        try {
            const result = await this.api.importData(request, writer.signal);
            if (writer.signal.aborted || this.disposed)
                return null;
            this.publish({ busy: false });
            await this.refresh();
            return result;
        }
        catch (error) {
            if (!writer.signal.aborted)
                this.publish({ busy: false, error: String(error) });
            return null;
        }
    }
    /** Stop all requests and observers on plugin unload. */
    dispose() { this.disposed = true; this.reader?.abort(); this.writer?.abort(); this.listeners.clear(); }
}
//# sourceMappingURL=controller.js.map
