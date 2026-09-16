"use strict";
// 教师页授权：本地访问自动获取 token；公网访问需输入一次 token（存 localStorage）
var TeacherAuth = (function () {
  var TOK = "";
  try { TOK = localStorage.getItem("t-token") || ""; } catch (e) { }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, { "X-Token": TOK, "Content-Type": "application/json" });
    if (TOK && opts.method && opts.method !== "GET") {
      opts.headers["Content-Type"] = "application/json";
    }
    return fetch(path, opts);
  }

  function ensureAuth(base, onFail) {
    base = base || "";
    if (TOK) return Promise.resolve(true);
    return fetch(base + "/api/auth").then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.token) {
        TOK = j.token;
        try { localStorage.setItem("t-token", TOK); } catch (e) { }
        return true;
      }
      return askToken();
    }).catch(function () { return askToken(); });

    function askToken() {
      var t = prompt("教师验证：请输入教师电脑 server 目录下 secret.json 中的 token");
      if (t && t.trim()) {
        TOK = t.trim();
        try { localStorage.setItem("t-token", TOK); } catch (e) { }
        return true;
      }
      if (onFail) onFail();
      return false;
    }
  }

  return { api: api, ensureAuth: ensureAuth, token: function () { return TOK; } };
})();
