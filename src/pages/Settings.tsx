import { useEffect, useState } from 'react'
import { HardDriveDownload, HardDriveUpload, Save } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Loading } from '../components/ui/Loading'
import { useToast } from '../context/ToastContext'

type SettingsForm = {
  shop_name: string
  shop_address: string
  shop_phone: string
  receipt_width: string
  receipt_footer: string
  printer_silent: boolean
}

const defaults: SettingsForm = {
  shop_name: 'Shafi Tikka',
  shop_address: '',
  shop_phone: '',
  receipt_width: '80',
  receipt_footer: 'Thank you!',
  printer_silent: true,
}

export default function Settings() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<SettingsForm>(defaults)

  async function load() {
    setLoading(true)
    try {
      const s = await window.api.getSettings()
      setForm({
        shop_name: s.shop_name || defaults.shop_name,
        shop_address: s.shop_address || '',
        shop_phone: s.shop_phone || '',
        receipt_width: s.receipt_width || '80',
        receipt_footer: s.receipt_footer || defaults.receipt_footer,
        printer_silent: s.printer_silent !== '0' && s.printer_silent !== 'false',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    setSaving(true)
    try {
      await window.api.setSettings({
        shop_name: form.shop_name.trim(),
        shop_address: form.shop_address.trim(),
        shop_phone: form.shop_phone.trim(),
        receipt_width: form.receipt_width === '58' ? '58' : '80',
        receipt_footer: form.receipt_footer,
        printer_silent: form.printer_silent ? '1' : '0',
      })
      toast.success('Settings saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function backup() {
    try {
      const res = await window.api.backupDatabase()
      if (res.canceled) return
      if (res.success) toast.success(`Backup saved${res.path ? `: ${res.path}` : ''}`)
      else toast.error('Backup failed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backup failed')
    }
  }

  async function restore() {
    try {
      const res = await window.api.restoreDatabase()
      if (res.canceled) return
      if (res.success) {
        toast.success(
          res.restartRequired
            ? 'Database restored. Restart the app to apply.'
            : 'Database restored'
        )
      } else toast.error('Restore failed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed')
    }
  }

  if (loading) return <Loading label="Loading settings..." />

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Shop profile, receipts & database"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void save()}
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save settings'}
          </button>
        }
      />

      <div className="split-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Shop</h3>
          <div className="form-grid">
            <label className="field full">
              Shop name
              <input
                value={form.shop_name}
                onChange={(e) => setForm((f) => ({ ...f, shop_name: e.target.value }))}
              />
            </label>
            <label className="field full">
              Address
              <textarea
                rows={2}
                value={form.shop_address}
                onChange={(e) => setForm((f) => ({ ...f, shop_address: e.target.value }))}
              />
            </label>
            <label className="field full">
              Phone
              <input
                value={form.shop_phone}
                onChange={(e) => setForm((f) => ({ ...f, shop_phone: e.target.value }))}
              />
            </label>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Receipt</h3>
          <div className="form-grid">
            <label className="field">
              Receipt width (mm)
              <select
                value={form.receipt_width}
                onChange={(e) => setForm((f) => ({ ...f, receipt_width: e.target.value }))}
              >
                <option value="58">58</option>
                <option value="80">80</option>
              </select>
            </label>
            <label className="field full">
              Receipt footer
              <input
                value={form.receipt_footer}
                onChange={(e) => setForm((f) => ({ ...f, receipt_footer: e.target.value }))}
              />
            </label>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.printer_silent}
                onChange={(e) => setForm((f) => ({ ...f, printer_silent: e.target.checked }))}
              />
              Silent printing
            </label>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Database</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
          Backup creates a copy of the SQLite database. Restore replaces the current database.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => void backup()}>
            <HardDriveDownload size={16} /> Backup database
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void restore()}>
            <HardDriveUpload size={16} /> Restore database
          </button>
        </div>
      </div>
    </div>
  )
}
