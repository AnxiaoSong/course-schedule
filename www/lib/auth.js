"use strict";
// 教师页授权：教师机自动获取 token（本机直连 / 域名出口 IP 识别），不在 URL 中暴露
var TeacherAuth = (function () {
  var TOK = "";
  try { TOK = localStorage.getItem("t-token") || ""; } catch (e) { }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, { "X-Token": TOK });
    return fetch(path, opts);
  }

  function tryFetchToken(base) {
    return fetch((base || "") + "/api/auth", { cache: "no-store", credentials: "include" })
      .then(function (r) {
        if (r.ok && !((base || "").indexOf("localhost") >= 0 || (base || "").indexOf("127.0.0.1") >= 0)) {
          // 同域成功，Set-Cookie 已由服务器种下
        }
        return r.json();
      })
      .then(function (j) {
        if (j && j.token) {
          TOK = j.token;
          try { localStorage.setItem("t-token", TOK); } catch (e) { }
          return true;
        }
        return false;
      })
      .catch(function () { return false; });
  }

  function ensureAuth(base) {
    if (TOK) return Promise.resolve(true);
    // 1) 当前访问地址（本地服务器/教师出口 IP 自动放行）
    return tryFetchToken(base).then(function (ok) {
      if (ok) return true;
      // 2) 教师本机 localhost 兜底（Chrome 允许 https 页面访问 localhost）
      return tryFetchToken("http://localhost:8080").then(function (ok2) {
        if (ok2) return true;
        // 3) 最后手段：输入一次 token（存浏览器）
        var t = prompt("教师验证：请输入教师电脑 secret.json 中的 token（教师机访问会自动获取）");
        if (t && t.trim()) {
          TOK = t.trim();
          try { localStorage.setItem("t-token", TOK); } catch (e) { }
          return true;
        }
        return false;
      });
    });
  }

  return { api: api, ensureAuth: ensureAuth, token: function () { return TOK; } };
})();
