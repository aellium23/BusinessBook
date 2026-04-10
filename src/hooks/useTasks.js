import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// ── useTasks ──────────────────────────────────────────────────────────────────
export function useTasks() {
  const { user } = useAuth()
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          deal:deal_id ( id, client, bu ),
          tender:tender_id ( id, title ),
          assignee:assigned_to ( id, full_name, email ),
          owner:owner_id ( id, full_name, email )
        `)
        .order('deadline', { ascending: true, nullsFirst: false })
      if (!error) setTasks(data ?? [])
    } catch (e) {
      console.warn('tasks table not ready yet:', e.message)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const myTasks      = tasks.filter(t => t.owner_id === user?.id && !t.assigned_to)
  const assignedToMe = tasks.filter(t => t.assigned_to === user?.id)
  const assignedByMe = tasks.filter(t => t.owner_id === user?.id && t.assigned_to && t.assigned_to !== user?.id)
  const overdueCount = tasks.filter(t =>
    t.status === 'open' && t.deadline && new Date(t.deadline) < new Date()
  ).length

  return { tasks, myTasks, assignedToMe, assignedByMe, overdueCount, loading, refetch: fetch }
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
  const [unread, setUnread]               = useState(0)

  const fetch = useCallback(async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (!error) {
        setNotifications(data ?? [])
        setUnread((data ?? []).filter(n => !n.read).length)
      }
    } catch (e) {
      console.warn('notifications table not ready yet:', e.message)
    }
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  async function markRead(id) {
    try {
      await supabase.from('notifications').update({ read: true }).eq('id', id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnread(u => Math.max(0, u - 1))
    } catch (e) { /* table not ready */ }
  }

  async function markAllRead() {
    try {
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnread(0)
    } catch (e) { /* table not ready */ }
  }

  async function pushNotification({ userId, type, title, body, linkType, linkId }) {
    try {
      await supabase.from('notifications').insert({
        user_id:   userId,
        type, title, body,
        link_type: linkType,
        link_id:   linkId,
      })
    } catch (e) { /* table not ready */ }
  }

  return { notifications, unread, loading: false, markRead, markAllRead, pushNotification, refetch: fetch }
}

// ── useTenders ────────────────────────────────────────────────────────────────
export function useTenders(dealId = null) {
  const { user } = useAuth()
  const [tenders, setTenders] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
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
      const { data, error } = await q
      if (!error) setTenders(data ?? [])
    } catch (e) {
      console.warn('tenders table not ready yet:', e.message)
    }
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

