interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const count = await db.prepare("SELECT count(*) as count FROM sessions").first("count");
  return new Response(JSON.stringify({ status: "ok", sessionCount: count }), {
    headers: { "Content-Type": "application/json" },
  });
};
