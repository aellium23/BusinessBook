import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// ── useTasks ──────────────────────────────────────────────────────────────────
// Returns tasks visible to the current user:
//   - Personal: owned by me, not assigned to anyone else
//   - Assigned to me: assigned_to = my uid
//   - Created by me and assigned to others (director view)
// ─────────────────────────────────────────────────────────────────────────────
export function useTasks(filter = 'all') {
  const { user, profile } = useAuth()
  const [tasks, setTasks]   = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select(`
        *,
        deal:deal_id ( id, client, bu ),
        assignee:assigned_to ( id, full_name, email ),
        owner:owner_id ( id, full_name, email )
      `)
      .order('deadline', { ascending: true, nullsFirst: false })
    setTasks(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  // Derived slices
  const myTasks      = tasks.filter(t => t.owner_id === user?.id && !t.assigned_to)
  const assignedToMe = tasks.filter(t => t.assigned_to === user?.id)
  const assignedByMe = tasks.filter(t => t.owner_id === user?.id && t.assigned_to && t.assigned_to !== user?.id)
  const openCount    = tasks.filter(t => t.status === 'open').length
  const overdueCount = tasks.filter(t =>
    t.status === 'open' && t.deadline && new Date(t.deadline) < new Date()
  ).length

  return { tasks, myTasks, assignedToMe, assignedByMe, openCount, overdueCount, loading, refetch: fetch }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export async function createTask(task) {
  const { data, error } = await supabase
    .from('tasks').insert(task).select().single()
  return { data, error }
}

export async function updateTask(id, updates) {
  const { data, error } = await supabase
    .from('tasks').update(updates).eq('id', id).select().single()
  return { data, error }
}

export async function deleteTask(id) {
  return supabase.from('tasks').delete().eq('id', id)
}

// ── useNotifications ──────────────────────────────────────────────────────────
export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)

  const fetch = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications(data ?? [])
    setUnread((data ?? []).filter(n => !n.read).length)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  // Real-time subscription
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        setNotifications(prev => [payload.new, ...prev])
        setUnread(u => u + 1)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  async function markRead(id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnread(u => Math.max(0, u - 1))
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
  }

  async function pushNotification({ userId, type, title, body, linkType, linkId }) {
    await supabase.from('notifications').insert({
      user_id:   userId,
      type, title, body,
      link_type: linkType,
      link_id:   linkId,
    })
  }

  return { notifications, unread, loading: false, markRead, markAllRead, pushNotification, refetch: fetch }
}

// ── useTenders ────────────────────────────────────────────────────────────────
export function useTenders(dealId = null) {
  const { user } = useAuth()
  const [tenders, setTenders]   = useState([])
  const [loading, setLoading]   = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let q = supabase
      .from('tenders')
      .select(`
        *,
        deal:deal_id ( id, client, bu, country ),
        creator:created_by ( id, full_name, email ),
        collaborators:tender_collaborators ( user_id, role, profile:user_id ( full_name, email ) )
      `)
      .order('submission_deadline', { ascending: true, nullsFirst: false })
    if (dealId) q = q.eq('deal_id', dealId)
    const { data } = await q
    setTenders(data ?? [])
    setLoading(false)
  }, [user, dealId])

  useEffect(() => { fetch() }, [fetch])

  const urgentCount = tenders.filter(t =>
    t.status === 'open' &&
    t.submission_deadline &&
    new Date(t.submission_deadline) <= new Date(Date.now() + 7 * 86400000)
  ).length

  return { tenders, urgentCount, loading, refetch: fetch }
}

export async function createTender(tender) {
  const { data, error } = await supabase
    .from('tenders').insert(tender).select().single()
  return { data, error }
}

export async function updateTender(id, updates) {
  const { data, error } = await supabase
    .from('tenders').update(updates).eq('id', id).select().single()
  return { data, error }
}

export async function deleteTender(id) {
  return supabase.from('tenders').delete().eq('id', id)
}
