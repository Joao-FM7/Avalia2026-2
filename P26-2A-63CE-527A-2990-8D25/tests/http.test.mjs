import test from "node:test";
import assert from "node:assert/strict";

import { getCookie, readJson } from "../functions/_lib/http.js";

function withCookie(header) {
  return new Request("http://localhost/", { headers: header === undefined ? {} : { cookie: header } });
}

function post(body) {
  return new Request("http://localhost/api/sessions", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

test("getCookie encontra o valor exato e ignora prefixos parecidos", () => {
  const request = withCookie("outro=1; pomodoro_session=abc.def; pomodoro_session_x=zzz");
  assert.equal(getCookie(request, "pomodoro_session"), "abc.def");
  assert.equal(getCookie(request, "outro"), "1");
  assert.equal(getCookie(request, "inexistente"), "");
});

test("getCookie tolera ausência de header, espaços e '=' no valor", () => {
  assert.equal(getCookie(withCookie(undefined), "pomodoro_session"), "");
  assert.equal(getCookie(withCookie("  pomodoro_session = x  "), "pomodoro_session"), "x");
  assert.equal(getCookie(withCookie("a=b=c"), "a"), "b=c");
  assert.equal(getCookie(withCookie("lixo"), "a"), "");
});

test("readJson aceita objeto e corpo vazio vira {}", async () => {
  const objeto = await readJson(post('{"subjectId":1}'));
  assert.equal(objeto.ok, true);
  assert.equal(objeto.value.subjectId, 1);

  const vazio = await readJson(post(""));
  assert.equal(vazio.ok, true);
  assert.deepEqual(vazio.value, {});
});

test("readJson recusa JSON inválido com 400", async () => {
  for (const body of ["{", "nada", "[]", "null", '"texto"', "123"]) {
    const result = await readJson(post(body));
    assert.equal(result.ok, false, `body=${body}`);
    assert.equal(result.status, 400, `body=${body}`);
  }
});

test("readJson recusa corpo acima do limite com 413", async () => {
  const grande = JSON.stringify({ name: "x".repeat(200) });
  const result = await readJson(post(grande), 50);
  assert.equal(result.ok, false);
  assert.equal(result.status, 413);
});

test("readJson respeita o Content-Length declarado", async () => {
  const request = post('{"a":1}');
  request.headers.set("content-length", "999999");
  const result = await readJson(request, 4096);
  assert.equal(result.ok, false);
  assert.equal(result.status, 413);
});
