/* =========================================================
   LuaScript Runtime (fengari-web)
   - Auto-hide lua blocks (no per-project CSS needed)
   - Config-relative module path resolution (CDN + local mix)
   ========================================================= */

/* --- HARD-HIDE ASAP (prevents flash-of-lua-text) --- */
(() => {
	if (document.getElementById("luascript-hide-style")) return;

	const style = document.createElement("style");
	style.id = "luascript-hide-style";
	style.textContent = `
    lua-script,
    script[type="lua"] {
      display: none !important;
    }
  `;
	(document.head || document.documentElement).appendChild(style);

	try {
		document.querySelectorAll("lua-script, script[type='lua']").forEach((el) => {
			el.hidden = true;
		});
	} catch {}
})();

(() => {
	const FENGARI_URL = "https://unpkg.com/fengari-web/dist/fengari-web.js";

	try {
		document.querySelectorAll("lua-script, script[type='lua']").forEach((el) => {
			el.hidden = true;
		});
	} catch {}

	function loadScript(url) {
		return new Promise((resolve, reject) => {
			if ([...document.scripts].some((s) => s.src === url)) return resolve();
			const s = document.createElement("script");
			s.src = url;
			s.onload = resolve;
			s.onerror = () => reject(new Error("Failed to load " + url));
			document.head.appendChild(s);
		});
	}

	async function fetchText(url) {
		const r = await fetch(url);
		if (!r.ok) throw new Error(`${url} (${r.status})`);
		return r.text();
	}

	function makeOutput(afterEl) {
		const pre = document.createElement("pre");
		afterEl.insertAdjacentElement("afterend", pre);
		return (line) => {
			pre.textContent += line + "\n";
		};
	}

	async function boot() {
		await loadScript(FENGARI_URL);

		const { lua, lauxlib, lualib, to_luastring, to_jsstring } = window.fengari;

		const L = lauxlib.luaL_newstate();
		lualib.luaL_openlibs(L);

		let currentWrite = () => {};
		let debugEnabled = false;
		const globalDebug = document.currentScript?.getAttribute("debug") === "true";

		function debug(msg) {
			if (debugEnabled) currentWrite("[LuaDebug] " + msg);
		}

		function luaValueToString(idx) {
			lauxlib.luaL_tolstring(L, idx);
			const u8 = lua.lua_tostring(L, -1);
			const s = u8 ? to_jsstring(u8) : "";
			lua.lua_pop(L, 1);
			return s;
		}

		function pushTracebackFunc() {
			lua.lua_getglobal(L, to_luastring("debug"));
			lua.lua_getfield(L, -1, to_luastring("traceback"));
			lua.lua_remove(L, -2);
		}

		pushTracebackFunc();
		const tracebackRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);

		function pcallWithTraceback(nargs, nresults) {
			const base = lua.lua_gettop(L) - nargs;
			lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, tracebackRef);
			lua.lua_insert(L, base);
			const status = lua.lua_pcall(L, nargs, nresults, base);
			lua.lua_remove(L, base);
			return status;
		}

		function reportLuaError(stage) {
			if (!debugEnabled) {
				lua.lua_pop(L, 1);
				return;
			}
			const msg = luaValueToString(-1);
			lua.lua_pop(L, 1);
			currentWrite(`[LuaError] ${stage}: ${msg}`);
		}

		lua.lua_pushcfunction(L, function (L) {
			const n = lua.lua_gettop(L);
			const out = [];
			for (let i = 1; i <= n; i++) {
				lauxlib.luaL_tolstring(L, i);
				const u8 = lua.lua_tostring(L, -1);
				out.push(u8 ? to_jsstring(u8) : "");
				lua.lua_pop(L, 1);
			}
			currentWrite(out.join("\t"));
			return 0;
		});
		lua.lua_setglobal(L, to_luastring("print"));

		function pushJsValue(val) {
			if (val === null || val === undefined) {
				lua.lua_pushnil(L);
				return;
			}
			if (typeof val === "number") {
				lua.lua_pushnumber(L, val);
				return;
			}
			if (typeof val === "boolean") {
				lua.lua_pushboolean(L, val ? 1 : 0);
				return;
			}
			lua.lua_pushstring(L, to_luastring(String(val)));
		}

		function callLuaByName(funcName, ...args) {
			lua.lua_getglobal(L, to_luastring(funcName));
			if (!lua.lua_isfunction(L, -1)) {
				lua.lua_pop(L, 1);
				debug(`callback not found: ${funcName}`);
				return;
			}
			for (const a of args) pushJsValue(a);
			const st = pcallWithTraceback(args.length, 0);
			if (st !== lua.LUA_OK) reportLuaError("callback");
		}

		function callLuaByRef(ref, ...args) {
			lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
			if (!lua.lua_isfunction(L, -1)) {
				lua.lua_pop(L, 1);
				debug(`callback ref not a function: ${ref}`);
				return;
			}
			for (const a of args) pushJsValue(a);
			const st = pcallWithTraceback(args.length, 0);
			if (st !== lua.LUA_OK) reportLuaError("callback");
		}

		function registerModule(name, sourceLua) {
			lua.lua_getglobal(L, to_luastring("package"));
			lua.lua_getfield(L, -1, to_luastring("preload"));

			lua.lua_pushstring(L, to_luastring(sourceLua));
			lua.lua_pushcclosure(
				L,
				function (L) {
					const srcU8 = lua.lua_tostring(L, lua.lua_upvalueindex(1));
					const src = srcU8 ? to_jsstring(srcU8) : "";

					if (lauxlib.luaL_loadstring(L, to_luastring(src)) !== lua.LUA_OK) return lua.lua_error(L);
					if (lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0) !== lua.LUA_OK) return lua.lua_error(L);

					if (lua.lua_gettop(L) === 0) {
						lua.lua_pushboolean(L, 1);
						return 1;
					}
					return 1;
				},
				1
			);

			lua.lua_setfield(L, -2, to_luastring(name));
			lua.lua_pop(L, 2);
		}

		function resolveUrl(path, baseUrl) {
			try {
				return new URL(path, baseUrl).href;
			} catch {
				return path;
			}
		}

		const loadedConfigs = new Set();
		async function applyConfig(configUrl) {
			if (!configUrl) return;

			const absConfigUrl = resolveUrl(configUrl, window.location.href);
			if (loadedConfigs.has(absConfigUrl)) return;

			const cfgText = await fetchText(absConfigUrl);
			const cfg = JSON.parse(cfgText);

			if (cfg?.modules) {
				for (const [name, path] of Object.entries(cfg.modules)) {
					const absModuleUrl = resolveUrl(path, absConfigUrl);
					const src = await fetchText(absModuleUrl);
					registerModule(name, src);
					debug(`config module loaded: ${name} <- ${absModuleUrl}`);
				}
			}

			loadedConfigs.add(absConfigUrl);
		}

		// =========================================================
		// luascript bridge
		// =========================================================
		const eventHandlers = new Map();
		const eventBound = new Set();

		function bindDelegatedEvent(eventName) {
			if (eventBound.has(eventName)) return;
			eventBound.add(eventName);

			document.addEventListener(
				eventName,
				(e) => {
					for (const [key, handlers] of eventHandlers.entries()) {
						const sep = key.indexOf("|");
						const ev = key.slice(0, sep);
						const selector = key.slice(sep + 1);
						if (ev !== eventName) continue;

						const t = e.target?.closest ? e.target.closest(selector) : null;
						if (!t) continue;

						const payload = [e.type, selector, t.id || "", typeof t.className === "string" ? t.className : ""];

						for (const h of handlers) {
							if (h.kind === "name") callLuaByName(h.value, ...payload);
							else callLuaByRef(h.value, ...payload);
						}
					}
				},
				true
			);

			debug(`bound DOM event: ${eventName}`);
		}

		lua.lua_newtable(L);
		lua.lua_setglobal(L, to_luastring("__LS_BRIDGE"));

		function setBridgeFunc(name, cfn) {
			lua.lua_getglobal(L, to_luastring("__LS_BRIDGE"));
			lua.lua_pushcfunction(L, cfn);
			lua.lua_setfield(L, -2, to_luastring(name));
			lua.lua_pop(L, 1);
		}

		// helpers for bridge args/callbacks
		function argString(i) {
			const u8 = lua.lua_tostring(L, i);
			return u8 ? to_jsstring(u8) : "";
		}
		function getCallback(i) {
			const t = lua.lua_type(L, i);
			if (t === lua.LUA_TFUNCTION) {
				lua.lua_pushvalue(L, i);
				const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
				return { kind: "ref", value: ref };
			}
			// else treat as name string
			const nameU8 = lua.lua_tostring(L, i);
			return { kind: "name", value: nameU8 ? to_jsstring(nameU8) : "" };
		}
		function fireCallback(cb, ...args) {
			if (!cb) return;
			if (cb.kind === "name") callLuaByName(cb.value, ...args);
			else callLuaByRef(cb.value, ...args);
		}

		setBridgeFunc("display", (L) => {
			const n = lua.lua_gettop(L);
			const parts = [];
			for (let i = 1; i <= n; i++) {
				lauxlib.luaL_tolstring(L, i);
				const u8 = lua.lua_tostring(L, -1);
				parts.push(u8 ? to_jsstring(u8) : "");
				lua.lua_pop(L, 1);
			}
			currentWrite(parts.join(" "));
			return 0;
		});

		function qs(sel) {
			return document.querySelector(sel);
		}

		setBridgeFunc("text", (L) => {
			const sel = argString(1);
			const el = qs(sel);
			if (!el) {
				lua.lua_pushnil(L);
				return 1;
			}
			if (lua.lua_gettop(L) >= 2) {
				el.textContent = argString(2);
				return 0;
			}
			lua.lua_pushstring(L, to_luastring(el.textContent ?? ""));
			return 1;
		});

		setBridgeFunc("html", (L) => {
			const sel = argString(1);
			const el = qs(sel);
			if (!el) {
				lua.lua_pushnil(L);
				return 1;
			}
			if (lua.lua_gettop(L) >= 2) {
				el.innerHTML = argString(2);
				return 0;
			}
			lua.lua_pushstring(L, to_luastring(el.innerHTML ?? ""));
			return 1;
		});

		setBridgeFunc("attr", (L) => {
			const sel = argString(1);
			const name = argString(2);
			const el = qs(sel);
			if (!el) {
				lua.lua_pushnil(L);
				return 1;
			}
			if (lua.lua_gettop(L) >= 3) {
				el.setAttribute(name, argString(3));
				return 0;
			}
			lua.lua_pushstring(L, to_luastring(el.getAttribute(name) ?? ""));
			return 1;
		});

		setBridgeFunc("addClass", (L) => {
			const el = qs(argString(1));
			if (el) el.classList.add(argString(2));
			return 0;
		});

		setBridgeFunc("removeClass", (L) => {
			const el = qs(argString(1));
			if (el) el.classList.remove(argString(2));
			return 0;
		});

		setBridgeFunc("toggleClass", (L) => {
			const el = qs(argString(1));
			if (el) el.classList.toggle(argString(2));
			return 0;
		});

		setBridgeFunc("when", (L) => {
			const ev = argString(1);
			const selector = argString(2);
			const handler = getCallback(3);

			const key = `${ev}|${selector}`;
			if (!eventHandlers.has(key)) eventHandlers.set(key, []);
			eventHandlers.get(key).push(handler);

			bindDelegatedEvent(ev);
			return 0;
		});

		setBridgeFunc("http_get", (L) => {
			const url = argString(1);
			const cb = getCallback(2);

			fetch(url)
				.then(async (r) => {
					const text = await r.text();
					fireCallback(cb, r.status, text);
				})
				.catch((err) => {
					fireCallback(cb, 0, String(err));
				});

			return 0;
		});

		// --- timer bridges (set_timeout, set_interval, clear_timer) ---
		const __timerMap = new Map();
		let __timerNextId = 1;

		setBridgeFunc("set_timeout", (L) => {
			const ms = parseInt(argString(1) || "0", 10);
			const cb = getCallback(2);
			const id = __timerNextId++;

			const handle = setTimeout(() => {
				fireCallback(cb);
				__timerMap.delete(id);
			}, Math.max(0, ms));

			__timerMap.set(id, { kind: "timeout", handle });
			lua.lua_pushnumber(L, id);
			return 1;
		});

		setBridgeFunc("set_interval", (L) => {
			const ms = parseInt(argString(1) || "0", 10);
			const cb = getCallback(2);
			const id = __timerNextId++;

			const handle = setInterval(() => {
				fireCallback(cb);
			}, Math.max(1, ms));

			__timerMap.set(id, { kind: "interval", handle });
			lua.lua_pushnumber(L, id);
			return 1;
		});

		setBridgeFunc("clear_timer", (L) => {
			const id = parseInt(argString(1) || "0", 10);
			const it = __timerMap.get(id);
			if (it) {
				if (it.kind === "timeout") clearTimeout(it.handle);
				else clearInterval(it.handle);
				__timerMap.delete(id);
			}
			lua.lua_pushboolean(L, 1);
			return 1;
		});

		// =========================================================
		// ✅ ADDITIONAL BRIDGES (stable core)
		// storage, crypto, ws, http_request, asset, call_api
		// =========================================================

		// --- storage (localStorage) ---
		setBridgeFunc("storage_get", (L) => {
			const key = argString(1);
			let v = null;
			try {
				v = localStorage.getItem(key);
			} catch {
				v = null;
			}
			if (v === null || v === undefined) {
				lua.lua_pushnil(L);
			} else {
				lua.lua_pushstring(L, to_luastring(String(v)));
			}
			return 1;
		});

		setBridgeFunc("storage_set", (L) => {
			const key = argString(1);
			const val = argString(2);
			try {
				localStorage.setItem(key, val);
			} catch {}
			lua.lua_pushboolean(L, 1);
			return 1;
		});

		setBridgeFunc("storage_remove", (L) => {
			const key = argString(1);
			try {
				localStorage.removeItem(key);
			} catch {}
			lua.lua_pushboolean(L, 1);
			return 1;
		});

		setBridgeFunc("storage_clear", (L) => {
			try {
				localStorage.clear();
			} catch {}
			lua.lua_pushboolean(L, 1);
			return 1;
		});

		setBridgeFunc("storage_keys", (L) => {
			let keys = [];
			try {
				for (let i = 0; i < localStorage.length; i++) {
					const k = localStorage.key(i);
					if (k != null) keys.push(k);
				}
			} catch {}
			lua.lua_pushstring(L, to_luastring(keys.join("\n")));
			return 1;
		});

		// --- crypto (WebCrypto) ---
		function bufToHex(buf) {
			return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
		}

		setBridgeFunc("crypto_random_bytes", (L) => {
			const n = Math.max(1, Math.min(4096, parseInt(argString(1) || "16", 10)));
			const arr = new Uint8Array(n);
			crypto.getRandomValues(arr);
			lua.lua_pushstring(L, to_luastring(bufToHex(arr)));
			return 1;
		});

		setBridgeFunc("crypto_sha256", (L) => {
			const text = argString(1);
			const cb = getCallback(2);

			crypto.subtle
				.digest("SHA-256", new TextEncoder().encode(text))
				.then((buf) => fireCallback(cb, "", bufToHex(buf)))
				.catch((e) => fireCallback(cb, String(e), ""));

			return 0;
		});

		setBridgeFunc("crypto_pbkdf2", (L) => {
			const password = argString(1);
			const salt = argString(2);
			const iterations = parseInt(argString(3) || "100000", 10);
			const bits = parseInt(argString(4) || "256", 10);
			const cb = getCallback(5);

			(async () => {
				try {
					const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
					const derived = await crypto.subtle.deriveBits(
						{
							name: "PBKDF2",
							hash: "SHA-256",
							salt: new TextEncoder().encode(salt),
							iterations: iterations,
						},
						key,
						bits
					);
					fireCallback(cb, "", bufToHex(derived));
				} catch (e) {
					fireCallback(cb, String(e), "");
				}
			})();

			return 0;
		});

		// --- WebSocket ---
		const __wsMap = new Map();
		let __wsNextId = 1;

		setBridgeFunc("ws_connect", (L) => {
			const url = argString(1);
			const onOpen = getCallback(2);
			const onMessage = getCallback(3);
			const onClose = getCallback(4);
			const onError = getCallback(5);

			const id = __wsNextId++;
			let ws;
			try {
				ws = new WebSocket(url);
			} catch (e) {
				fireCallback(onError, "open_failed:" + String(e));
				lua.lua_pushnumber(L, 0);
				return 1;
			}

			ws.onopen = () => fireCallback(onOpen);
			ws.onmessage = (ev) => fireCallback(onMessage, String(ev.data ?? ""));
			ws.onclose = (ev) => fireCallback(onClose, ev.code ?? 0, String(ev.reason ?? ""));
			ws.onerror = () => fireCallback(onError, "ws_error");

			__wsMap.set(id, ws);
			lua.lua_pushnumber(L, id);
			return 1;
		});

		setBridgeFunc("ws_send", (L) => {
			const id = parseInt(argString(1) || "0", 10);
			const text = argString(2);
			const ws = __wsMap.get(id);
			try {
				if (ws && ws.readyState === WebSocket.OPEN) ws.send(text);
			} catch {}
			lua.lua_pushboolean(L, 1);
			return 1;
		});

		setBridgeFunc("ws_close", (L) => {
			const id = parseInt(argString(1) || "0", 10);
			const code = parseInt(argString(2) || "1000", 10);
			const reason = argString(3);
			const ws = __wsMap.get(id);
			try {
				if (ws) ws.close(code, reason);
			} catch {}
			__wsMap.delete(id);
			lua.lua_pushboolean(L, 1);
			return 1;
		});

		// --- http_request (method + headers + body + response headers) ---
		setBridgeFunc("http_request", (L) => {
			const method = argString(1).toUpperCase() || "GET";
			const url = argString(2);
			const headersJson = argString(3) || "{}";
			const body = argString(4) || "";
			const cb = getCallback(5);

			let headers = {};
			try {
				headers = JSON.parse(headersJson || "{}") || {};
			} catch {
				headers = {};
			}

			fetch(url, {
				method,
				headers,
				body: method === "GET" || method === "HEAD" ? undefined : body,
			})
				.then(async (r) => {
					const text = await r.text();
					const h = {};
					try {
						r.headers.forEach((v, k) => (h[k] = v));
					} catch {}
					fireCallback(cb, r.status, text, JSON.stringify(h));
				})
				.catch((err) => {
					fireCallback(cb, 0, String(err), "{}");
				});

			return 0;
		});

		// --- asset loader (image/audio via blob URL) ---
		setBridgeFunc("asset_image", (L) => {
			const url = argString(1);
			const cb = getCallback(2);

			fetch(url)
				.then((r) => r.blob())
				.then((blob) => {
					const objUrl = URL.createObjectURL(blob);
					const img = new Image();
					img.onload = () => fireCallback(cb, true, img.naturalWidth || 0, img.naturalHeight || 0, objUrl);
					img.onerror = () => {
						try {
							URL.revokeObjectURL(objUrl);
						} catch {}
						fireCallback(cb, false, 0, 0, "");
					};
					img.src = objUrl;
				})
				.catch(() => fireCallback(cb, false, 0, 0, ""));

			return 0;
		});

		setBridgeFunc("asset_audio", (L) => {
			const url = argString(1);
			const cb = getCallback(2);

			fetch(url)
				.then((r) => r.blob())
				.then((blob) => {
					const objUrl = URL.createObjectURL(blob);
					// cukup kembalikan src; user bisa set ke <audio src=...>
					fireCallback(cb, true, objUrl);
				})
				.catch(() => fireCallback(cb, false, ""));

			return 0;
		});

		setBridgeFunc("asset_revoke", (L) => {
			const objUrl = argString(1);
			try {
				URL.revokeObjectURL(objUrl);
			} catch {}
			return 0;
		});

		// --- generic extension hook ---
		// User can define:
		// window.LuaScriptAPI = { myFunc: (a,b)=>..., myAsync:(a, cb)=>... }
		setBridgeFunc("call_api", (L) => {
			const name = argString(1);
			const n = lua.lua_gettop(L);

			const api = window.LuaScriptAPI || {};
			const fn = api[name];

			if (typeof fn !== "function") {
				// return nil
				lua.lua_pushnil(L);
				return 1;
			}

			// gather args 2..n
			const args = [];
			for (let i = 2; i <= n; i++) args.push(argString(i));

			try {
				const ret = fn(...args);
				if (ret === undefined || ret === null) lua.lua_pushnil(L);
				else lua.lua_pushstring(L, to_luastring(String(ret)));
				return 1;
			} catch (e) {
				lua.lua_pushstring(L, to_luastring("ERR:" + String(e)));
				return 1;
			}
		});

		// ===================== PDF ENGINE =====================
		let __pdfDoc = null;

		setBridgeFunc("pdf_create", (L) => {
			__pdfDoc = new jspdf.jsPDF({ unit: "mm", format: "a4" });
			lua.lua_pushboolean(L, 1);
			return 1;
		});

		setBridgeFunc("pdf_add_page", (L) => {
			if (!__pdfDoc) return 0;
			__pdfDoc.addPage();
			return 0;
		});

		setBridgeFunc("pdf_text", (L) => {
			if (!__pdfDoc) return 0;
			const x = parseFloat(argString(1));
			const y = parseFloat(argString(2));
			const text = argString(3);
			const size = parseFloat(argString(4) || "12");
			__pdfDoc.setFontSize(size);
			__pdfDoc.text(text, x, y);
			return 0;
		});

		setBridgeFunc("pdf_table", (L) => {
			if (!__pdfDoc) return 0;
			const x = parseFloat(argString(1));
			const y = parseFloat(argString(2));
			const headers = JSON.parse(argString(3));
			const rows = JSON.parse(argString(4));
			__pdfDoc.autoTable({
				startY: y,
				head: [headers],
				body: rows,
				margin: { left: x },
			});
			return 0;
		});

		setBridgeFunc("pdf_save", (L) => {
			if (!__pdfDoc) return 0;
			const name = argString(1) || "output.pdf";
			__pdfDoc.save(name);
			__pdfDoc = null;
			return 0;
		});
		setBridgeFunc("pdf_blob_url", (L) => {
			if (!__pdfDoc) {
				lua.lua_pushnil(L);
				return 1;
			}
			try {
				// jsPDF supports output('blob') or output('bloburl') depending version
				const blob = __pdfDoc.output("blob");
				const url = URL.createObjectURL(blob);
				lua.lua_pushstring(L, to_luastring(url));
				return 1;
			} catch (e) {
				lua.lua_pushnil(L);
				return 1;
			}
		});

		setBridgeFunc("pdf_revoke", (L) => {
			const url = argString(1);
			try {
				URL.revokeObjectURL(url);
			} catch {}
			return 0;
		});

		// Built-in module "luascript" (optional convenience)
		registerModule(
			"luascript",
			`
  local bridge = __LS_BRIDGE
  local M = {}

  function M.display(...) bridge.display(...) end
  function M.when(eventName, selector, handler) bridge.when(eventName, selector, handler) end
  function M.get(url, handler) bridge.http_get(url, handler) end

  function M.text(selector, value) return bridge.text(selector, value) end
  function M.html(selector, value) return bridge.html(selector, value) end
  function M.attr(selector, name, value) return bridge.attr(selector, name, value) end
  function M.addClass(selector, cls) return bridge.addClass(selector, cls) end
  function M.removeClass(selector, cls) return bridge.removeClass(selector, cls) end
  function M.toggleClass(selector, cls) return bridge.toggleClass(selector, cls) end

  return M
      `
		);

		// =========================================================
		// Execute scripts
		// =========================================================
		function runLua(code) {
			if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== lua.LUA_OK) return reportLuaError("syntax");

			const st = pcallWithTraceback(0, lua.LUA_MULTRET);
			if (st !== lua.LUA_OK) reportLuaError("runtime");

			lua.lua_settop(L, 0);
		}

		const nodes = Array.from(document.querySelectorAll("lua-script, script[type='lua']"));

		for (const el of nodes) {
			el.hidden = true;

			currentWrite = makeOutput(el);
			debugEnabled = el.getAttribute("debug") === "true" || globalDebug;

			try {
				await applyConfig(el.getAttribute("config"));
			} catch (e) {
				if (debugEnabled) currentWrite("[LuaError] config: " + e.message);
				continue;
			}

			let code = "";
			if (el.tagName.toLowerCase() === "lua-script") code = el.textContent || "";
			else if (el.getAttribute("src")) code = await fetchText(el.getAttribute("src"));
			else code = el.textContent || "";

			runLua(code);
			debug("LuaScript runtime finished one script node");
		}

		debug("LuaScript runtime ready");
	}

	document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => boot().catch(console.error)) : boot().catch(console.error);
})();
