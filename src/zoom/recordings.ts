import { db } from '@/lib/supabase'

export const REC_BUCKET = 'meeting-recordings'

/** a meeting's / webinar date's recording: Zoom's cloud recording (copied into our storage) or one added by hand */
export type Recording = {
  id: string
  tenant_id: string
  meeting_id: string | null
  event_id: string | null
  source: 'zoom' | 'manual'
  title: string | null
  recorded_at: string | null
  duration_sec: number | null
  video_path: string | null
  video_size: number | null
  audio_path: string | null
  audio_size: number | null
  link_url: string | null
  copy_status: 'waiting' | 'done' | 'error'
  copy_error: string | null
  transcript: string | null
  summary: string | null
  ai_status: 'waiting' | 'done' | 'error' | 'skipped'
  ai_error: string | null
  ai_at: string | null
  created_at: string
}
export type RecTarget = { kind: 'meeting' | 'event'; id: string }

export async function listRecordings(t: RecTarget): Promise<Recording[]> {
  const { data, error } = await db()
    .from('meeting_recordings')
    .select('*')
    .eq(t.kind === 'meeting' ? 'meeting_id' : 'event_id', t.id)
    .order('recorded_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Recording[]
}

/** a 1-hour link to our copy */
export async function recordingUrl(path: string) {
  const { data, error } = await db().storage.from(REC_BUCKET).createSignedUrl(path, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

/** add a recording by hand: an audio / video file (uploaded to our storage) or a link */
export async function addRecording(tenantId: string, t: RecTarget, input: { title: string; file: File | null; link: string }) {
  let path: string | null = null
  if (input.file) {
    const d = new Date()
    const safe = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
    path = `${tenantId}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}-${safe}`
    const { error } = await db().storage.from(REC_BUCKET).upload(path, input.file, { contentType: input.file.type || undefined, upsert: false })
    if (error) throw new Error(/exceeded|too large|maximum/i.test(error.message) ? 'The file is bigger than the storage upload limit.' : error.message)
  }
  const isAudio = !!input.file && input.file.type.startsWith('audio/')
  const { error } = await db()
    .from('meeting_recordings')
    .insert({
      tenant_id: tenantId,
      meeting_id: t.kind === 'meeting' ? t.id : null,
      event_id: t.kind === 'event' ? t.id : null,
      source: 'manual',
      title: input.title.trim() || input.file?.name || 'Recording',
      recorded_at: new Date().toISOString(),
      video_path: path && !isAudio ? path : null,
      video_size: path && !isAudio ? input.file!.size : null,
      audio_path: path && isAudio ? path : null,
      audio_size: path && isAudio ? input.file!.size : null,
      link_url: input.link.trim() || null,
      copy_status: 'done',
      // a file: transcript and summary by the worker (every minute); a link only: nothing to read
      ai_status: path ? 'waiting' : 'skipped',
      ai_error: path ? null : 'Added as a link: upload the file for a transcript and summary.',
    })
  if (error) throw new Error(error.message)
}

export async function removeRecording(r: Recording) {
  const { error } = await db().from('meeting_recordings').delete().eq('id', r.id)
  if (error) throw new Error(error.message)
}

/** make the transcript / summary again (copy = copy the files from Zoom again too) */
export async function redoRecording(id: string, copy = false) {
  const { data, error } = await db().functions.invoke('zoom', { body: { action: 'rec_ai', id, copy } })
  const why = data?.error ?? (error ? error.message : null)
  if (why) throw new Error(String(why))
}
