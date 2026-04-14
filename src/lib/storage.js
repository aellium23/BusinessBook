import { supabase } from './supabase'

// ── File validation ──────────────────────────────────────────────────────────
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/webp',
]

const EXT_BY_MIME = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function validateFile(file) {
  if (!file) return 'No file selected'
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File exceeds the 25 MB limit (${formatBytes(file.size)})`
  }
  // Some browsers omit mime type — fall back to extension check.
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    return `File type "${file.type}" is not allowed`
  }
  return null
}

export function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function iconForMime(mime) {
  if (!mime) return '📄'
  if (mime === 'application/pdf') return '📕'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.includes('word'))     return '📘'
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📗'
  if (mime.includes('powerpoint') || mime.includes('presentation')) return '📙'
  return '📄'
}

// ── Storage helpers ──────────────────────────────────────────────────────────
function buildStoragePath(entityType, entityId, file) {
  const ext = EXT_BY_MIME[file.type] || (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'bin')
  const stamp = Date.now()
  const rand  = Math.random().toString(36).slice(2, 8)
  return `${entityType}/${entityId}/${stamp}-${rand}.${ext}`
}

// Uploads a file to Supabase Storage and inserts a row in the attachments table.
// Returns { data, error }.
export async function uploadAttachment({ entityType, entityId, file }) {
  const invalid = validateFile(file)
  if (invalid) return { error: { message: invalid } }

  const { data: authData } = await supabase.auth.getUser()
  const userId = authData?.user?.id
  if (!userId) return { error: { message: 'Not authenticated' } }

  const path = buildStoragePath(entityType, entityId, file)

  const { error: upErr } = await supabase.storage
    .from('attachments')
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (upErr) return { error: upErr }

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      entity_type:  entityType,
      entity_id:    entityId,
      storage_path: path,
      file_name:    file.name,
      size_bytes:   file.size,
      mime_type:    file.type || null,
      uploaded_by:  userId,
    })
    .select()
    .single()

  // If metadata insert fails, clean up the uploaded blob so we don't leak orphans.
  if (error) {
    await supabase.storage.from('attachments').remove([path]).catch(() => {})
    return { error }
  }
  return { data }
}

export async function listAttachments(entityType, entityId) {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
  return { data: data ?? [], error }
}

export async function deleteAttachment(attachment) {
  const { error: dbErr } = await supabase
    .from('attachments').delete().eq('id', attachment.id)
  if (dbErr) return { error: dbErr }
  // Best-effort removal from storage. The metadata row is the source of truth.
  await supabase.storage.from('attachments').remove([attachment.storage_path]).catch(() => {})
  return { error: null }
}

// Short-lived signed URL so the browser can download a private object.
export async function getDownloadUrl(storagePath, expiresInSeconds = 60) {
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(storagePath, expiresInSeconds, { download: true })
  return { url: data?.signedUrl ?? null, error }
}
