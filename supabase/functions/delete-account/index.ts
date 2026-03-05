import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user with their JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uid = user.id;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Delete user data in dependency order
    // 1. invoice-related child tables (agent_log, invoice_threads)
    const { data: invoiceIds } = await admin.from("invoices").select("id").eq("user_id", uid);
    const ids = (invoiceIds ?? []).map((r: any) => r.id);
    if (ids.length > 0) {
      await admin.from("agent_log").delete().in("invoice_id", ids);
      await admin.from("invoice_threads").delete().in("invoice_id", ids);
    }

    // 2. project-related child tables
    const { data: projectIds } = await admin.from("projects").select("id").eq("user_id", uid);
    const pids = (projectIds ?? []).map((r: any) => r.id);
    if (pids.length > 0) {
      await admin.from("project_categories").delete().in("project_id", pids);
      await admin.from("project_documents").delete().in("project_id", pids);
    }

    // 3. Top-level user tables
    await admin.from("invoices").delete().eq("user_id", uid);
    await admin.from("projects").delete().eq("user_id", uid);
    await admin.from("chat_messages").delete().eq("user_id", uid);
    await admin.from("email_contacts").delete().eq("user_id", uid);
    await admin.from("user_settings").delete().eq("id", uid);

    // 4. Delete storage files
    const buckets = ["invoices-bucket", "project-documents-bucket"];
    for (const bucket of buckets) {
      const { data: files } = await admin.storage.from(bucket).list(uid);
      if (files && files.length > 0) {
        const paths = files.map((f: any) => `${uid}/${f.name}`);
        await admin.storage.from(bucket).remove(paths);
      }
    }

    // 5. Delete auth user
    const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
