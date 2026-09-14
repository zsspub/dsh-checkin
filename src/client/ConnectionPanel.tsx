import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { ExternalLink, Eye, EyeOff, KeyRound } from 'lucide-react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ConnectionController, secureKeyTransport } from './connection-controller.ts'
import { failureKey } from './errors.ts'

type Props = PropsLocale<'checkin'> & { controller: ConnectionController }
export function ConnectionPanel({ controller, t }: Props) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { connection, resources, busy, error } = state
  const [key, setKey] = useState('')
  const [shown, setShown] = useState(false)
  const [editingKey, setEditingKey] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [databaseId, setDatabaseId] = useState(connection?.databaseId ?? '')
  const [databaseName, setDatabaseName] = useState('dsh_checkin')
  const [tableChoice, setTableChoice] = useState('')
  const [tableName, setTableName] = useState(connection?.tableName ?? 'checkin_topics')
  const [recordsChoice, setRecordsChoice] = useState('')
  const [recordsTableName, setRecordsTableName] = useState(connection?.recordsTableName ?? 'checkin_records')
  const formId = useId()
  const secure = secureKeyTransport(window.location)
  useEffect(() => {
    setKey(''); setShown(false); setEditingKey(false); setConfirmLogout(false)
  }, [connection?.revision])
  useEffect(() => {
    if (connection?.phase === 'setup' && !resources && !busy && !error) void controller.loadResources()
  }, [controller, connection?.phase, resources, busy, error])
  const selectedDatabase = resources?.databases.find(database => database.id === databaseId)
  const creation = !databaseId || !tableChoice || !recordsChoice
  const topicTarget = databaseId && tableChoice || tableName
  const recordsTarget = databaseId && recordsChoice || recordsTableName
  const keyPage = connection?.phase === 'login' || editingKey
  const logoutControls = connection?.source === 'saved' && <div className="ci-connection-actions">
    {!confirmLogout ? <button className="ci-button" disabled={busy} onClick={() => setConfirmLogout(true)}>{t('logout')}</button> :
      <div className="ci-confirm" role="group" aria-label={t('logoutTitle')}>
        <h3>{t('logoutTitle')}</h3><p>{t('logoutHint')}</p><div className="ci-actions">
          <button className="ci-button" disabled={busy} onClick={() => setConfirmLogout(false)}>{t('cancel')}</button>
          <button className="ci-button ci-danger" disabled={busy} onClick={() => { void controller.run((api, signal) => api.logout(signal)).then(done => { if (done) { setKey(''); setEditingKey(false); setConfirmLogout(false) } }) }}>{t('confirmLogout')}</button>
        </div>
      </div>}
  </div>
  return <div className="ci-connection">
    {error && <div className="ci-alert" role="alert">{t(failureKey(error))}<button className="ci-button" disabled={busy} onClick={() => { void controller.refresh(undefined, true) }}>{t('retry')}</button></div>}
    {!connection && !error && <p role="status">{t('loading')}</p>}
    {keyPage && <>
      <KeyRound size={28} strokeWidth={1.5} aria-hidden="true" />
      <h3>{t('loginTitle')}</h3><p>{t('loginHint')}</p>
      <form className="ci-form" onSubmit={event => {
        event.preventDefault()
        if (!secure) return
        void controller.run((api, signal) => api.login({ apiKey: key }, signal)).then(done => {
          if (done) { setKey(''); setShown(false); setEditingKey(false); setDatabaseId(''); setTableChoice(''); setRecordsChoice('') }
        })
      }}>
        <label htmlFor={`${formId}-key`}>{t('keyLabel')}</label>
        <div className="ci-key-input"><input id={`${formId}-key`} type={shown ? 'text' : 'password'} value={key} autoComplete="off" autoCapitalize="none" spellCheck={false} required disabled={busy} onChange={event => setKey(event.target.value)} aria-describedby={`${formId}-hint`} />
          <button type="button" className="ci-icon" aria-label={t(shown ? 'hideKey' : 'showKey')} aria-pressed={shown} onClick={() => setShown(!shown)}>{shown ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <p id={`${formId}-hint`} className="ci-help">{t('keyHint')}</p>
        {!secure && <p role="alert">{t('secureRequired')}</p>}
        <button className="ci-button ci-primary" disabled={busy || !key.trim() || !secure}>{t(busy ? 'verifying' : 'verifyKey')}</button>
        {editingKey && <button type="button" className="ci-button" disabled={busy} onClick={() => { setEditingKey(false); setKey('') }}>{t('back')}</button>}
      </form>
      <nav className="ci-links" aria-label={t('loginTitle')}>
        <a href="https://zss.pub/register" target="_blank" rel="noopener noreferrer">{t('register')}<ExternalLink size={14} aria-hidden="true" /></a>
        <a href="https://zss.pub/databases" target="_blank" rel="noopener noreferrer">{t('generateKey')}<ExternalLink size={14} aria-hidden="true" /></a>
      </nav><p className="ci-help">{t('keyPrivacy')}</p>
    </>}
    {connection?.phase === 'invalid' && <div className="ci-alert" role="alert">{t('databaseConfig')}</div>}
    {connection?.phase === 'setup' && !editingKey && <>
      <h3>{t('setupTitle')}</h3><p>{t('setupHint')}</p>
      {(connection.databaseId || connection.pendingDatabaseName) && <p className="ci-help">{t('pendingHint')}</p>}
      <button className="ci-button" disabled={busy} onClick={() => { void controller.loadResources() }}>{t('refreshResources')}</button>
      {resources && <form className="ci-form" onSubmit={event => {
        event.preventDefault()
        if (!creation) void controller.run((api, signal) => api.connect({ databaseId, tableName: topicTarget, recordsTableName: recordsTarget }, signal))
        else void controller.run((api, signal) => api.initialize({
          ...(databaseId ? { databaseId } : { databaseName }), tableName: topicTarget, recordsTableName: recordsTarget,
          ...(databaseId && tableChoice ? { useExistingTopics: true } : {}),
          ...(databaseId && recordsChoice ? { useExistingRecords: true } : {}), confirmed: true,
        }, signal))
      }}>
        <label htmlFor={`${formId}-database`}>{t('databaseLabel')}</label>
        <select id={`${formId}-database`} className="ci-select" disabled={busy} value={databaseId} onChange={event => { setDatabaseId(event.target.value); setTableChoice(''); setRecordsChoice('') }}>
          <option value="">{t('newDatabase')}</option>
          {resources.databases.map(database => <option key={database.id} value={database.id} disabled={database.status !== 'ready'}>{database.name}{database.status === 'ready' ? '' : ` (${t('notReadyLabel')})`}</option>)}
        </select>
        {!databaseId && <><label htmlFor={`${formId}-database-name`}>{t('databaseName')}</label><input id={`${formId}-database-name`} required maxLength={48} pattern="[a-z][a-z0-9_]{0,47}" value={databaseName} disabled={busy} onChange={event => setDatabaseName(event.target.value)} /></>}
        {databaseId && <><label htmlFor={`${formId}-table`}>{t('tableLabel')}</label><select id={`${formId}-table`} className="ci-select" value={tableChoice} disabled={busy} onChange={event => setTableChoice(event.target.value)}>
          <option value="">{t('newTable')}</option>{selectedDatabase?.tables.map(table => <option key={table.name} value={table.name}>{table.name}</option>)}
        </select></>}
        {(!databaseId || !tableChoice) && <><label htmlFor={`${formId}-table-name`}>{t('tableName')}</label><input id={`${formId}-table-name`} value={tableName} required maxLength={48} pattern="[a-z][a-z0-9_]{0,47}" disabled={busy} onChange={event => setTableName(event.target.value)} /></>}
        {databaseId && <><label htmlFor={`${formId}-records`}>{t('recordsLabel')}</label><select id={`${formId}-records`} className="ci-select" value={recordsChoice} disabled={busy} onChange={event => setRecordsChoice(event.target.value)}>
          <option value="">{t('newRecords')}</option>{selectedDatabase?.tables.map(table => <option key={table.name} value={table.name}>{table.name}</option>)}
        </select></>}
        {(!databaseId || !recordsChoice) && <><label htmlFor={`${formId}-records-name`}>{t('recordsName')}</label><input id={`${formId}-records-name`} value={recordsTableName} required maxLength={48} pattern="[a-z][a-z0-9_]{0,47}" disabled={busy} onChange={event => setRecordsTableName(event.target.value)} /></>}
        {creation && <p className="ci-help">{t('nameHint')}</p>}
        <div className="ci-quota"><p>{t('databaseQuota', { used: resources.databases.length, limit: resources.limits.maxDatabases })}</p>
          <p>{t('tableQuota', { used: selectedDatabase?.tables.length ?? 0, limit: resources.limits.maxTables })}</p>
          <p>{t('bytesQuota', { used: resources.databases.reduce((sum, database) => sum + database.usedBytes, 0), limit: resources.limits.maxBytes })}</p></div>
        <div className="ci-schema"><h4>{t('schemaTitle')}</h4>
          <p>{t('tableLabel')}: <code>{topicTarget}</code></p><div className="ci-fields">
            {['id VARCHAR(36)', 'name VARCHAR(200)', 'created_at VARCHAR(24)', 'updated_at VARCHAR(24)', 'revision VARCHAR(36)'].map(field => <div key={field}><code>{field}</code></div>)}
          </div>
          <p>{t('recordsLabel')}: <code>{recordsTarget}</code></p><div className="ci-fields">
            {['topic_id VARCHAR(36)', 'date VARCHAR(10)', 'created_at VARCHAR(24)', 'revision VARCHAR(36)', 'PRIMARY KEY (topic_id, date)', 'INDEX (date, topic_id)'].map(field => <div key={field}><code>{field}</code></div>)}
          </div><p className="ci-help">{t('schemaHint')}</p>
        </div>
        <p className="ci-target">{t('targetHint', { database: selectedDatabase?.name ?? databaseName, table: `${topicTarget} + ${recordsTarget}` })}</p>
        {topicTarget === recordsTarget && <p role="alert">{t('distinctTables')}</p>}
        <button className="ci-button ci-primary" disabled={busy || !topicTarget.trim() || !recordsTarget.trim() || topicTarget === recordsTarget}>{t(busy ? 'verifying' : creation ? 'confirmInitialize' : 'connectExisting')}</button>
      </form>}
      <button className="ci-button" disabled={busy} onClick={() => setEditingKey(true)}>{t('changeKey')}</button>
      {logoutControls}
    </>}
    {(connection?.phase === 'connected' || connection?.phase === 'invalid') && !editingKey && <details className="ci-connection-details">
      <summary>{t('connectionInfo')}</summary><p>{t(connection.source === 'host' ? 'managedConnection' : 'savedConnection')}</p>
      <p className="ci-target">{connection.databaseId} / {connection.tableName} + {connection.recordsTableName}</p>
      {connection.writable && <button className="ci-button" disabled={busy} onClick={() => setEditingKey(true)}>{t('changeKey')}</button>}{logoutControls}
    </details>}
  </div>
}
