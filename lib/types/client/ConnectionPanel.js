import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { ExternalLink, Eye, EyeOff, KeyRound } from 'lucide-react';
import { ConnectionController, secureKeyTransport } from "./connection-controller.js";
import { failureKey } from "./errors.js";
export function ConnectionPanel({ controller, t }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const { connection, resources, busy, error } = state;
    const [key, setKey] = useState('');
    const [shown, setShown] = useState(false);
    const [editingKey, setEditingKey] = useState(false);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [databaseId, setDatabaseId] = useState(connection?.databaseId ?? '');
    const [databaseName, setDatabaseName] = useState('dsh_checkin');
    const [tableChoice, setTableChoice] = useState('');
    const [tableName, setTableName] = useState(connection?.tableName ?? 'checkin_topics');
    const [recordsChoice, setRecordsChoice] = useState('');
    const [recordsTableName, setRecordsTableName] = useState(connection?.recordsTableName ?? 'checkin_records');
    const formId = useId();
    const secure = secureKeyTransport(window.location);
    useEffect(() => {
        setKey('');
        setShown(false);
        setEditingKey(false);
        setConfirmLogout(false);
    }, [connection?.revision]);
    useEffect(() => {
        if (connection?.phase === 'setup' && !resources && !busy && !error)
            void controller.loadResources();
    }, [controller, connection?.phase, resources, busy, error]);
    const selectedDatabase = resources?.databases.find(database => database.id === databaseId);
    const creation = !databaseId || !tableChoice || !recordsChoice;
    const topicTarget = databaseId && tableChoice || tableName;
    const recordsTarget = databaseId && recordsChoice || recordsTableName;
    const keyPage = connection?.phase === 'login' || editingKey;
    const logoutControls = connection?.source === 'saved' && _jsx("div", { className: "ci-connection-actions", children: !confirmLogout ? _jsx("button", { className: "ci-button", disabled: busy, onClick: () => setConfirmLogout(true), children: t('logout') }) :
            _jsxs("div", { className: "ci-confirm", role: "group", "aria-label": t('logoutTitle'), children: [_jsx("h3", { children: t('logoutTitle') }), _jsx("p", { children: t('logoutHint') }), _jsxs("div", { className: "ci-actions", children: [_jsx("button", { className: "ci-button", disabled: busy, onClick: () => setConfirmLogout(false), children: t('cancel') }), _jsx("button", { className: "ci-button ci-danger", disabled: busy, onClick: () => { void controller.run((api, signal) => api.logout(signal)).then(done => { if (done) {
                                    setKey('');
                                    setEditingKey(false);
                                    setConfirmLogout(false);
                                } }); }, children: t('confirmLogout') })] })] }) });
    return _jsxs("div", { className: "ci-connection", children: [error && _jsxs("div", { className: "ci-alert", role: "alert", children: [t(failureKey(error)), _jsx("button", { className: "ci-button", disabled: busy, onClick: () => { void controller.refresh(undefined, true); }, children: t('retry') })] }), !connection && !error && _jsx("p", { role: "status", children: t('loading') }), keyPage && _jsxs(_Fragment, { children: [_jsx(KeyRound, { size: 28, strokeWidth: 1.5, "aria-hidden": "true" }), _jsx("h3", { children: t('loginTitle') }), _jsx("p", { children: t('loginHint') }), _jsxs("form", { className: "ci-form", onSubmit: event => {
                            event.preventDefault();
                            if (!secure)
                                return;
                            void controller.run((api, signal) => api.login({ apiKey: key }, signal)).then(done => {
                                if (done) {
                                    setKey('');
                                    setShown(false);
                                    setEditingKey(false);
                                    setDatabaseId('');
                                    setTableChoice('');
                                    setRecordsChoice('');
                                }
                            });
                        }, children: [_jsx("label", { htmlFor: `${formId}-key`, children: t('keyLabel') }), _jsxs("div", { className: "ci-key-input", children: [_jsx("input", { id: `${formId}-key`, type: shown ? 'text' : 'password', value: key, autoComplete: "off", autoCapitalize: "none", spellCheck: false, required: true, disabled: busy, onChange: event => setKey(event.target.value), "aria-describedby": `${formId}-hint` }), _jsx("button", { type: "button", className: "ci-icon", "aria-label": t(shown ? 'hideKey' : 'showKey'), "aria-pressed": shown, onClick: () => setShown(!shown), children: shown ? _jsx(EyeOff, { size: 18 }) : _jsx(Eye, { size: 18 }) })] }), _jsx("p", { id: `${formId}-hint`, className: "ci-help", children: t('keyHint') }), !secure && _jsx("p", { role: "alert", children: t('secureRequired') }), _jsx("button", { className: "ci-button ci-primary", disabled: busy || !key.trim() || !secure, children: t(busy ? 'verifying' : 'verifyKey') }), editingKey && _jsx("button", { type: "button", className: "ci-button", disabled: busy, onClick: () => { setEditingKey(false); setKey(''); }, children: t('back') })] }), _jsxs("nav", { className: "ci-links", "aria-label": t('loginTitle'), children: [_jsxs("a", { href: "https://zss.pub/register", target: "_blank", rel: "noopener noreferrer", children: [t('register'), _jsx(ExternalLink, { size: 14, "aria-hidden": "true" })] }), _jsxs("a", { href: "https://zss.pub/databases", target: "_blank", rel: "noopener noreferrer", children: [t('generateKey'), _jsx(ExternalLink, { size: 14, "aria-hidden": "true" })] })] }), _jsx("p", { className: "ci-help", children: t('keyPrivacy') })] }), connection?.phase === 'invalid' && _jsx("div", { className: "ci-alert", role: "alert", children: t('databaseConfig') }), connection?.phase === 'setup' && !editingKey && _jsxs(_Fragment, { children: [_jsx("h3", { children: t('setupTitle') }), _jsx("p", { children: t('setupHint') }), (connection.databaseId || connection.pendingDatabaseName) && _jsx("p", { className: "ci-help", children: t('pendingHint') }), _jsx("button", { className: "ci-button", disabled: busy, onClick: () => { void controller.loadResources(); }, children: t('refreshResources') }), resources && _jsxs("form", { className: "ci-form", onSubmit: event => {
                            event.preventDefault();
                            if (!creation)
                                void controller.run((api, signal) => api.connect({ databaseId, tableName: topicTarget, recordsTableName: recordsTarget }, signal));
                            else
                                void controller.run((api, signal) => api.initialize({
                                    ...(databaseId ? { databaseId } : { databaseName }), tableName: topicTarget, recordsTableName: recordsTarget,
                                    ...(databaseId && tableChoice ? { useExistingTopics: true } : {}),
                                    ...(databaseId && recordsChoice ? { useExistingRecords: true } : {}), confirmed: true,
                                }, signal));
                        }, children: [_jsx("label", { htmlFor: `${formId}-database`, children: t('databaseLabel') }), _jsxs("select", { id: `${formId}-database`, className: "ci-select", disabled: busy, value: databaseId, onChange: event => { setDatabaseId(event.target.value); setTableChoice(''); setRecordsChoice(''); }, children: [_jsx("option", { value: "", children: t('newDatabase') }), resources.databases.map(database => _jsxs("option", { value: database.id, disabled: database.status !== 'ready', children: [database.name, database.status === 'ready' ? '' : ` (${t('notReadyLabel')})`] }, database.id))] }), !databaseId && _jsxs(_Fragment, { children: [_jsx("label", { htmlFor: `${formId}-database-name`, children: t('databaseName') }), _jsx("input", { id: `${formId}-database-name`, required: true, maxLength: 48, pattern: "[a-z][a-z0-9_]{0,47}", value: databaseName, disabled: busy, onChange: event => setDatabaseName(event.target.value) })] }), databaseId && _jsxs(_Fragment, { children: [_jsx("label", { htmlFor: `${formId}-table`, children: t('tableLabel') }), _jsxs("select", { id: `${formId}-table`, className: "ci-select", value: tableChoice, disabled: busy, onChange: event => setTableChoice(event.target.value), children: [_jsx("option", { value: "", children: t('newTable') }), selectedDatabase?.tables.map(table => _jsx("option", { value: table.name, children: table.name }, table.name))] })] }), (!databaseId || !tableChoice) && _jsxs(_Fragment, { children: [_jsx("label", { htmlFor: `${formId}-table-name`, children: t('tableName') }), _jsx("input", { id: `${formId}-table-name`, value: tableName, required: true, maxLength: 48, pattern: "[a-z][a-z0-9_]{0,47}", disabled: busy, onChange: event => setTableName(event.target.value) })] }), databaseId && _jsxs(_Fragment, { children: [_jsx("label", { htmlFor: `${formId}-records`, children: t('recordsLabel') }), _jsxs("select", { id: `${formId}-records`, className: "ci-select", value: recordsChoice, disabled: busy, onChange: event => setRecordsChoice(event.target.value), children: [_jsx("option", { value: "", children: t('newRecords') }), selectedDatabase?.tables.map(table => _jsx("option", { value: table.name, children: table.name }, table.name))] })] }), (!databaseId || !recordsChoice) && _jsxs(_Fragment, { children: [_jsx("label", { htmlFor: `${formId}-records-name`, children: t('recordsName') }), _jsx("input", { id: `${formId}-records-name`, value: recordsTableName, required: true, maxLength: 48, pattern: "[a-z][a-z0-9_]{0,47}", disabled: busy, onChange: event => setRecordsTableName(event.target.value) })] }), creation && _jsx("p", { className: "ci-help", children: t('nameHint') }), _jsxs("div", { className: "ci-quota", children: [_jsx("p", { children: t('databaseQuota', { used: resources.databases.length, limit: resources.limits.maxDatabases }) }), _jsx("p", { children: t('tableQuota', { used: selectedDatabase?.tables.length ?? 0, limit: resources.limits.maxTables }) }), _jsx("p", { children: t('bytesQuota', { used: resources.databases.reduce((sum, database) => sum + database.usedBytes, 0), limit: resources.limits.maxBytes }) })] }), _jsxs("div", { className: "ci-schema", children: [_jsx("h4", { children: t('schemaTitle') }), _jsxs("p", { children: [t('tableLabel'), ": ", _jsx("code", { children: topicTarget })] }), _jsx("div", { className: "ci-fields", children: ['id VARCHAR(36)', 'name VARCHAR(200)', 'created_at VARCHAR(24)', 'updated_at VARCHAR(24)', 'revision VARCHAR(36)'].map(field => _jsx("div", { children: _jsx("code", { children: field }) }, field)) }), _jsxs("p", { children: [t('recordsLabel'), ": ", _jsx("code", { children: recordsTarget })] }), _jsx("div", { className: "ci-fields", children: ['topic_id VARCHAR(36)', 'date VARCHAR(10)', 'created_at VARCHAR(24)', 'revision VARCHAR(36)', 'PRIMARY KEY (topic_id, date)', 'INDEX (date, topic_id)'].map(field => _jsx("div", { children: _jsx("code", { children: field }) }, field)) }), _jsx("p", { className: "ci-help", children: t('schemaHint') })] }), _jsx("p", { className: "ci-target", children: t('targetHint', { database: selectedDatabase?.name ?? databaseName, table: `${topicTarget} + ${recordsTarget}` }) }), topicTarget === recordsTarget && _jsx("p", { role: "alert", children: t('distinctTables') }), _jsx("button", { className: "ci-button ci-primary", disabled: busy || !topicTarget.trim() || !recordsTarget.trim() || topicTarget === recordsTarget, children: t(busy ? 'verifying' : creation ? 'confirmInitialize' : 'connectExisting') })] }), _jsx("button", { className: "ci-button", disabled: busy, onClick: () => setEditingKey(true), children: t('changeKey') }), logoutControls] }), (connection?.phase === 'connected' || connection?.phase === 'invalid') && !editingKey && _jsxs("details", { className: "ci-connection-details", children: [_jsx("summary", { children: t('connectionInfo') }), _jsx("p", { children: t(connection.source === 'host' ? 'managedConnection' : 'savedConnection') }), _jsxs("p", { className: "ci-target", children: [connection.databaseId, " / ", connection.tableName, " + ", connection.recordsTableName] }), connection.writable && _jsx("button", { className: "ci-button", disabled: busy, onClick: () => setEditingKey(true), children: t('changeKey') }), logoutControls] })] });
}
//# sourceMappingURL=ConnectionPanel.js.map
