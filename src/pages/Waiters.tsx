import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { Loading } from '../components/ui/Loading'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useToast } from '../context/ToastContext'

export default function Waiters() {
  const toast = useToast()
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Waiter | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadWaiters = useCallback(async () => {
    setLoading(true)
    try {
      setWaiters(await window.api.listWaiters())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load waiters')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadWaiters()
  }, [loadWaiters])

  async function addWaiter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const waiterName = name.trim()
    if (!waiterName) {
      toast.error('Waiter name required')
      return
    }

    setSaving(true)
    try {
      const { id } = await window.api.createWaiter(waiterName)
      setWaiters((current) =>
        [...current, { id, name: waiterName }].sort((a, b) => a.name.localeCompare(b.name))
      )
      setName('')
      toast.success('Waiter added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add waiter')
    } finally {
      setSaving(false)
    }
  }

  async function deleteWaiter() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await window.api.deleteWaiter(deleteTarget.id)
      setWaiters((current) => current.filter((waiter) => waiter.id !== deleteTarget.id))
      toast.success(`${deleteTarget.name} removed`)
      setDeleteTarget(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove waiter')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader title="Waiters" subtitle="Add and manage your waiters." />
      <div className="split-2">
        <section className="card">
          <h2>Add a waiter</h2>
          <form onSubmit={(event) => void addWaiter(event)}>
            <label className="field full">
              Waiter name
              <input
                autoComplete="off"
                maxLength={100}
                placeholder="Enter waiter name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Plus size={16} />
              {saving ? 'Adding...' : 'Add Waiter'}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Waiter list</h2>
          {loading ? (
            <Loading label="Loading waiters..." />
          ) : waiters.length === 0 ? (
            <EmptyState title="No waiters added" hint="Add a waiter using the form." />
          ) : (
            <ul className="waiter-list">
              {waiters.map((waiter, index) => (
                <li key={waiter.id} className="waiter-row">
                  <span className="waiter-number">{index + 1}</span>
                  <strong>{waiter.name}</strong>
                  <button
                    type="button"
                    className="btn btn-danger waiter-delete-button"
                    aria-label={`Remove ${waiter.name}`}
                    title={`Remove ${waiter.name}`}
                    onClick={() => setDeleteTarget(waiter)}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {deleteTarget && (
        <ConfirmDialog
          title="Remove waiter"
          message={`Remove ${deleteTarget.name} from the waiter list?`}
          confirmLabel={deleting ? 'Removing...' : 'Remove waiter'}
          danger
          onClose={() => {
            if (!deleting) setDeleteTarget(null)
          }}
          onConfirm={() => void deleteWaiter()}
        />
      )}
    </>
  )
}
