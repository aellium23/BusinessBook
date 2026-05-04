// Supabase Edge Function: invite-user
// Deploy via: Supabase Dashboard > Edge Functions > New Function > "invite-user"
// Or via CLI: supabase functions deploy invite-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization')

    const { data: { user: caller } } = await createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    ).auth.getUser(authHeader.replace('Bearer ', ''))

    if (!caller) throw new Error('Invalid token')

    // Fetch profile with permission_set to check admin status
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, permission_set_id')
      .eq('id', caller.id)
      .single()

    let isAdmin = callerProfile?.role === 'admin'

    // Also check permission_set-based admin (mirrors frontend useAuth logic)
    if (!isAdmin && callerProfile?.permission_set_id) {
      const { data: permSet } = await supabaseAdmin
        .from('permission_sets')
        .select('see_all_bu, can_delete')
        .eq('id', callerProfile.permission_set_id)
        .single()
      if (permSet?.see_all_bu === true && permSet?.can_delete === true) {
        isAdmin = true
      }
    }

    if (!isAdmin) {
      throw new Error('Only admins can invite users')
    }

    const body = await req.json()
    const { email, role, company_id, sales_owner_id, sales_owner_name, bu, display_name } = body

    if (!email) throw new Error('Email is required')

    // Create auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      email_confirm: true,
      user_metadata: { full_name: display_name || email.split('@')[0] },
    })

    if (authError) {
      // User may already exist
      if (authError.message?.includes('already been registered')) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
        const existing = users?.find(u => u.email === email.toLowerCase().trim())
        if (existing) {
          // Update profile
          await supabaseAdmin.from('profiles').upsert({
            id: existing.id,
            email: email.toLowerCase().trim(),
            full_name: display_name || null,
            role: role || 'viewer',
            bu: bu || null,
            company_id: company_id || null,
            sales_owner_name: sales_owner_name || null,
            active: true,
          }, { onConflict: 'id' })

          return new Response(
            JSON.stringify({ success: true, userId: existing.id, message: `User ${email} updated` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      throw authError
    }

    // Create profile
    await supabaseAdmin.from('profiles').upsert({
      id: authUser.user.id,
      email: email.toLowerCase().trim(),
      full_name: display_name || null,
      role: role || 'viewer',
      bu: bu || null,
      company_id: company_id || null,
      sales_owner_name: sales_owner_name || null,
      active: true,
    }, { onConflict: 'id' })

    return new Response(
      JSON.stringify({ success: true, userId: authUser.user.id, message: `User ${email} created` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
