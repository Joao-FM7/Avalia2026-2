/**
 * GET /api/me → perfil da sessão atual (user_id, nome e avatar importados do Discord).
 */
import { fail, json, methodNotAllowed } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return fail(401, "unauthorized", "Faça login com o Discord.");

  return json({
    ok: true,
    user: {
      id: user.u,
      username: user.n,
      avatar: user.a || "https://cdn.discordapp.com/embed/avatars/0.png",
    },
  });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return methodNotAllowed(["GET"]);
}
