var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import Schema from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { monthRange, todayInBeijing } from "./host/store.js";
import { CheckinConnection } from "./host/connection.js";
let CheckinService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _connection_decorators;
    let _login_decorators;
    let _resources_decorators;
    let _connect_decorators;
    let _initialize_decorators;
    let _logout_decorators;
    let _list_decorators;
    let _create_decorators;
    let _update_decorators;
    let _delete_decorators;
    let _set_decorators;
    let _query_decorators;
    let _month_decorators;
    return class CheckinService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _connection_decorators = [Remote];
            _login_decorators = [Remote];
            _resources_decorators = [Remote];
            _connect_decorators = [Remote];
            _initialize_decorators = [Remote];
            _logout_decorators = [Remote];
            _list_decorators = [Remote];
            _create_decorators = [Remote];
            _update_decorators = [Remote];
            _delete_decorators = [Remote];
            _set_decorators = [Remote];
            _query_decorators = [Remote];
            _month_decorators = [Remote];
            __esDecorate(this, null, _connection_decorators, { kind: "method", name: "connection", static: false, private: false, access: { has: obj => "connection" in obj, get: obj => obj.connection }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _login_decorators, { kind: "method", name: "login", static: false, private: false, access: { has: obj => "login" in obj, get: obj => obj.login }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _resources_decorators, { kind: "method", name: "resources", static: false, private: false, access: { has: obj => "resources" in obj, get: obj => obj.resources }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connect_decorators, { kind: "method", name: "connect", static: false, private: false, access: { has: obj => "connect" in obj, get: obj => obj.connect }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _initialize_decorators, { kind: "method", name: "initialize", static: false, private: false, access: { has: obj => "initialize" in obj, get: obj => obj.initialize }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _logout_decorators, { kind: "method", name: "logout", static: false, private: false, access: { has: obj => "logout" in obj, get: obj => obj.logout }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _delete_decorators, { kind: "method", name: "delete", static: false, private: false, access: { has: obj => "delete" in obj, get: obj => obj.delete }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _set_decorators, { kind: "method", name: "set", static: false, private: false, access: { has: obj => "set" in obj, get: obj => obj.set }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _query_decorators, { kind: "method", name: "query", static: false, private: false, access: { has: obj => "query" in obj, get: obj => obj.query }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _month_decorators, { kind: "method", name: "month", static: false, private: false, access: { has: obj => "month" in obj, get: obj => obj.month }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        config = __runInitializers(this, _instanceExtraInitializers);
        static Config = Schema.object({
            apiKey: Schema.string().role('secret'),
            databaseId: Schema.string(),
            tableName: Schema.string().default('checkin_topics'),
            recordsTableName: Schema.string().default('checkin_records'),
            requestTimeoutMs: Schema.number().step(1).min(1).default(15000),
            refreshIntervalMs: Schema.number().step(1).min(1000).default(30000),
        });
        storage;
        /** @param ctx - Host context. @param config - Validated deployment settings. */
        constructor(ctx, config) {
            super(ctx, 'checkin');
            this.config = config;
            this.storage = new CheckinConnection(ctx, config);
            ctx.effect(() => () => this.storage.close(), 'checkin: cancel database requests');
        }
        async connection(signal) { return this.storage.connection(signal); }
        async login(request, signal) { return this.storage.login(request.apiKey, signal); }
        async resources(signal) { return this.storage.resources(signal); }
        async connect(request, signal) { return this.storage.connect(request, signal); }
        async initialize(request, signal) { return this.storage.initialize(request, signal); }
        async logout(signal) { return this.storage.logout(signal); }
        /** @param signal - Request cancellation. @returns Catalog and Beijing date. */
        async list(signal) { return this.storage.use(signal, (store, current) => store.list(current)); }
        /** @param request - New name. @param signal - Cancellation. @returns Created topic. */
        async create(request, signal) { return this.storage.use(signal, (store, current) => store.create(request.name, current)); }
        /** @param request - Topic and new name. @param signal - Cancellation. @returns Updated topic. */
        async update(request, signal) { return this.storage.use(signal, (store, current) => store.update(request.id, request.name, current)); }
        /** @param request - Topic to delete. @param signal - Cancellation. @returns Removed topic and count. */
        async delete(request, signal) { return this.storage.use(signal, (store, current) => store.delete(request.id, current)); }
        /** @param request - Desired completion status. @param signal - Cancellation. @returns Persisted status. */
        async set(request, signal) { return this.storage.use(signal, (store, current) => store.set(request, current)); }
        /** @param request - Inclusive dates. @param signal - Cancellation. @returns Sparse completions. */
        async query(request, signal) { return this.storage.use(signal, (store, current) => store.query(request, current)); }
        /** @param request - Month, defaulting to Beijing's current month. @param signal - Cancellation. @returns Calendar snapshot. */
        async month(request, signal) {
            signal.throwIfAborted();
            const month = request.month ?? todayInBeijing().slice(0, 7);
            return { ...await this.storage.use(signal, (store, current) => store.query(monthRange(month), current)), month, refreshIntervalMs: this.config.refreshIntervalMs };
        }
    };
})();
export { CheckinService };
export default CheckinService;
//# sourceMappingURL=index.js.map
