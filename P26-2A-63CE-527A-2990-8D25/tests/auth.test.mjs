import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { readSession, requireUser, signSession, SESSION_COOKIE } from "../functions/_lib/auth.js";

const SECRET = "segredo-de-teste-0123456789abcdef";

function requestWith(value) {
  return new Request("http://localhost/api/me", {
    headers: value ? { cookie: `${SESSION_COOKIE}=${value}` } : {},
  });
}

/** Assina um payload arbitrário do lado do teste, sem usar o código de produção. */
function forge(payload, secret = SECRET) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function validPayload(overrides = {}) {
  return { u: "123456789012345678", n: "Estudante", a: "", exp: Date.now() + 60_000, ...overrides };
}

test("sessão emitida por signSession é lida de volta com a identidade original", async () => {
  const token = await signSession({ user_id: "123456789012345678", username: "João", avatar: "a.png" }, SECRET);
  const session = await readSession(requestWith(token), SECRET);
  assert.equal(session.u, "123456789012345678");
  assert.equal(session.n, "João");
  assert.equal(session.a, "a.png");
  assert.ok(session.exp > Date.now());
});

test("assinatura de outro segredo é recusada", async () => {
  const token = forge(validPayload(), "outro-segredo-qualquer-123456");
  assert.equal(await readSession(requestWith(token), SECRET), null);
});

test("payload adulterado invalida a assinatura", async () => {
  const token = forge(validPayload());
  const [data, signature] = token.split(".");
  const trocado = Buffer.from(JSON.stringify(validPayload({ u: "999999999999999999" }))).toString("base64url");
  assert.equal(await readSession(requestWith(`${trocado}.${signature}`), SECRET), null);
  assert.notEqual(trocado, data);
});

test("sessão expirada é recusada mesmo com assinatura válida", async () => {
  const token = forge(validPayload({ exp: Date.now() - 1 }));
  assert.equal(await readSession(requestWith(token), SECRET), null);
});

test("cookie ausente, sem ponto, vazio ou com base64 inválido retorna null", async () => {
  for (const value of ["", "sem-ponto", ".", "abc.", ".abc", "a.b.c", "###.###"]) {
    assert.equal(await readSession(requestWith(value), SECRET), null, `cookie=${value}`);
  }
  assert.equal(await readSession(requestWith(null), SECRET), null);
});

test("payload assinado sem user_id é recusado", async () => {
  for (const payload of [{ n: "x", exp: Date.now() + 60_000 }, { u: "", exp: Date.now() + 60_000 }, { u: 123, exp: Date.now() + 60_000 }]) {
    assert.equal(await readSession(requestWith(forge(payload)), SECRET), null);
  }
});

test("exp não numérico é recusado", async () => {
  assert.equal(await readSession(requestWith(forge(validPayload({ exp: "9999999999999" }))), SECRET), null);
});

test("requireUser devolve null sem SESSION_SECRET (falha fechada)", async () => {
  const token = forge(validPayload());
  assert.equal(await requireUser(requestWith(token), {}), null);
  assert.equal(await requireUser(requestWith(token), { SESSION_SECRET: "curto" }), null);
});

test("requireUser devolve a sessão quando o segredo confere", async () => {
  const token = forge(validPayload());
  const user = await requireUser(requestWith(token), { SESSION_SECRET: SECRET });
  assert.equal(user.u, "123456789012345678");
});
