import { useEffect, useRef, useState } from 'react'
import { Paperclip, Upload, Trash2, Download, AlertCircle } from 'lucide-react'
import {
  listAttachments, uploadAttachment, deleteAttachment, getDownloadUrl,
  validateFile, formatBytes, iconForMime, MAX_FILE_SIZE_BYTES,
} from '../lib/storage'

/**
 * Reusable attachments panel for deals and tenders.
 *
 * Props:
 *   entityType: 'deal' | 'tender'
 *   entityId:   uuid — when absent (new entity), renders a read-only hint.
 *   canEdit:    boolean
 */
export default function AttachmentsList({ entityType, entityId, canEdit = true }) {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError]   = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  async function refresh() {
    if (!entityId) { setItems([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await listAttachments(entityType, entityId)
    if (error) setError(error.message)
    setItems(data)
    setLoading(false)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [entityType, entityId])

  async function handleFiles(fileList) {
    if (!entityId) { setError('Save the record before uploading files.'); return }
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    setError(null)
    setUploading(true)
    for (const file of files) {
      const invalid = validateFile(file)
      if (invalid) { setError(invalid); continue }
      const { error } = await uploadAttachment({ entityType, entityId, file })
      if (error) { setError(error.message); break }
    }
    setUploading(false)
    refresh()
  }

  async function handleDelete(att) {
    if (!confirm(`Delete "${att.file_name}"?`)) return
    const { error } = await deleteAttachment(att)
    if (error) { setError(error.message); return }
    refresh()
  }

  async function handleDownload(att) {
    const { url, error } = await getDownloadUrl(att.storage_path)
    if (error || !url) { setError(error?.message || 'Unable to generate download link'); return }
    // Trigger download in a new tab
    const a = document.createElement('a')
    a.href = url; a.target = '_blank'; a.rel = 'noopener'
    a.download = att.file_name
    a.click()
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    if (!canEdit || !entityId) return
    handleFiles(e.dataTransfer?.files)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label flex items-center gap-1.5">
          <Paperclip size={12}/> Attachments
          {items.length > 0 && (
            <span className="text-micro text-gray-400 font-normal">({items.length})</span>
          )}
        </label>
        {canEdit && entityId && (
          <button type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-xs py-1 px-2 flex items-center gap-1">
            <Upload size={11}/> {uploading ? 'Uploading…' : 'Upload'}
          </button>
        )}
      </div>

      {!entityId && (
        <p className="text-tiny text-gray-400 italic">
          Save the record first to start attaching files.
        </p>
      )}

      {canEdit && entityId && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-navy bg-navy/5' : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
          }`}>
          <p className="text-xs text-gray-500">
            <strong>Drop files</strong> here or click to browse
          </p>
          <p className="text-micro text-gray-400 mt-0.5">
            PDF, Word, Excel, PowerPoint, images · up to {formatBytes(MAX_FILE_SIZE_BYTES)}
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg,image/webp"
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
      />

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12}/> {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : items.length === 0 && entityId ? (
        <p className="text-xs text-gray-400 italic">No files yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {items.map(att => (
            <li key={att.id} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50">
              <span className="text-base shrink-0" aria-hidden>{iconForMime(att.mime_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{att.file_name}</p>
                <p className="text-micro text-gray-400">
                  {formatBytes(att.size_bytes)} · {new Date(att.created_at).toLocaleDateString('pt-PT', { day:'numeric', month:'short', year:'numeric' })}
                </p>
              </div>
              <button type="button" onClick={() => handleDownload(att)}
                className="p-1.5 text-gray-400 hover:text-navy rounded-lg hover:bg-gray-100"
                aria-label={`Download ${att.file_name}`}>
                <Download size={13}/>
              </button>
              {canEdit && (
                <button type="button" onClick={() => handleDelete(att)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                  aria-label={`Delete ${att.file_name}`}>
                  <Trash2 size={13}/>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
