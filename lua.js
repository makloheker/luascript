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

	// Extra safety for already-parsed nodes
	try {
		document.querySelectorAll("lua-script, script[type='lua']").forEach((el) => {
			el.hidden = true;
		});
	} catch {}
})();

(() => {
	const FENGARI_URL = "https://unpkg.com/fengari-web/dist/fengari-web.js";

	// Hide blocks ASAP (extra safety)
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

		// Safe stringify any Lua value at idx (uses luaL_tolstring)
		function luaValueToString(idx) {
			lauxlib.luaL_tolstring(L, idx);
			const u8 = lua.lua_tostring(L, -1);
			const s = u8 ? to_jsstring(u8) : "";
			lua.lua_pop(L, 1);
			return s;
		}

		// ---- Error handler: debug.traceback ----
		// We'll store debug.traceback in registry and use it as errfunc in every pcall.
		function pushTracebackFunc() {
			lua.lua_getglobal(L, to_luastring("debug"));
			lua.lua_getfield(L, -1, to_luastring("traceback"));
			lua.lua_remove(L, -2); // remove "debug" table, keep traceback on top
		}

		// Save traceback function to registry
		pushTracebackFunc();
		const tracebackRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);

		function pcallWithTraceback(nargs, nresults) {
			// stack: ... func arg1..argN
			const base = lua.lua_gettop(L) - nargs; // index of function
			lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, tracebackRef); // push traceback
			lua.lua_insert(L, base); // put traceback under function
			const status = lua.lua_pcall(L, nargs, nresults, base);
			lua.lua_remove(L, base); // remove traceback
			return status;
		}

		function reportLuaError(stage) {
			if (!debugEnabled) {
				lua.lua_pop(L, 1); // pop error
				return;
			}
			const msg = luaValueToString(-1);
			lua.lua_pop(L, 1);
			currentWrite(`[LuaError] ${stage}: ${msg}`);
		}

		// print(...) -> output
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

		// Call Lua global function by name (safe)
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

		// Call Lua function by registry ref (safe)
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

		// Module preload utility
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

					// Use normal pcall inside module loader; error will be handled by outer require/caller
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

		// =========================================================
		// CONFIG: resolve relative paths based on config URL
		// =========================================================
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

			// Resolve configUrl relative to the page URL
			const absConfigUrl = resolveUrl(configUrl, window.location.href);
			if (loadedConfigs.has(absConfigUrl)) return;

			const cfgText = await fetchText(absConfigUrl);
			const cfg = JSON.parse(cfgText);

			if (cfg?.modules) {
				for (const [name, path] of Object.entries(cfg.modules)) {
					// Resolve module path relative to config.json URL
					const absModuleUrl = resolveUrl(path, absConfigUrl);
					const src = await fetchText(absModuleUrl);
					registerModule(name, src);
					debug(`config module loaded: ${name} <- ${absModuleUrl}`);
				}
			}

			loadedConfigs.add(absConfigUrl);
		}

		// =========================================================
		// luascript bridge (PyScript-like)
		// =========================================================

		// Delegated events store: key "event|selector" -> handlers[]
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

		// Bridge table __LS_BRIDGE
		lua.lua_newtable(L);
		lua.lua_setglobal(L, to_luastring("__LS_BRIDGE"));

		function setBridgeFunc(name, cfn) {
			lua.lua_getglobal(L, to_luastring("__LS_BRIDGE"));
			lua.lua_pushcfunction(L, cfn);
			lua.lua_setfield(L, -2, to_luastring(name));
			lua.lua_pop(L, 1);
		}

		// display(...)
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

		// DOM helpers (selector-based)
		function qs(sel) {
			return document.querySelector(sel);
		}

		setBridgeFunc("text", (L) => {
			const selU8 = lua.lua_tostring(L, 1);
			const sel = selU8 ? to_jsstring(selU8) : "";
			const el = qs(sel);
			if (!el) {
				lua.lua_pushnil(L);
				return 1;
			}
			if (lua.lua_gettop(L) >= 2) {
				const vU8 = lua.lua_tostring(L, 2);
				el.textContent = vU8 ? to_jsstring(vU8) : "";
				return 0;
			}
			lua.lua_pushstring(L, to_luastring(el.textContent ?? ""));
			return 1;
		});

		setBridgeFunc("html", (L) => {
			const selU8 = lua.lua_tostring(L, 1);
			const sel = selU8 ? to_jsstring(selU8) : "";
			const el = qs(sel);
			if (!el) {
				lua.lua_pushnil(L);
				return 1;
			}
			if (lua.lua_gettop(L) >= 2) {
				const vU8 = lua.lua_tostring(L, 2);
				el.innerHTML = vU8 ? to_jsstring(vU8) : "";
				return 0;
			}
			lua.lua_pushstring(L, to_luastring(el.innerHTML ?? ""));
			return 1;
		});

		setBridgeFunc("attr", (L) => {
			const selU8 = lua.lua_tostring(L, 1);
			const nameU8 = lua.lua_tostring(L, 2);
			const sel = selU8 ? to_jsstring(selU8) : "";
			const name = nameU8 ? to_jsstring(nameU8) : "";
			const el = qs(sel);
			if (!el) {
				lua.lua_pushnil(L);
				return 1;
			}
			if (lua.lua_gettop(L) >= 3) {
				const vU8 = lua.lua_tostring(L, 3);
				el.setAttribute(name, vU8 ? to_jsstring(vU8) : "");
				return 0;
			}
			lua.lua_pushstring(L, to_luastring(el.getAttribute(name) ?? ""));
			return 1;
		});

		setBridgeFunc("addClass", (L) => {
			const selU8 = lua.lua_tostring(L, 1);
			const clsU8 = lua.lua_tostring(L, 2);
			const el = qs(selU8 ? to_jsstring(selU8) : "");
			if (el) el.classList.add(clsU8 ? to_jsstring(clsU8) : "");
			return 0;
		});

		setBridgeFunc("removeClass", (L) => {
			const selU8 = lua.lua_tostring(L, 1);
			const clsU8 = lua.lua_tostring(L, 2);
			const el = qs(selU8 ? to_jsstring(selU8) : "");
			if (el) el.classList.remove(clsU8 ? to_jsstring(clsU8) : "");
			return 0;
		});

		setBridgeFunc("toggleClass", (L) => {
			const selU8 = lua.lua_tostring(L, 1);
			const clsU8 = lua.lua_tostring(L, 2);
			const el = qs(selU8 ? to_jsstring(selU8) : "");
			if (el) el.classList.toggle(clsU8 ? to_jsstring(clsU8) : "");
			return 0;
		});

		// when(event, selector, handler)
		setBridgeFunc("when", (L) => {
			const evU8 = lua.lua_tostring(L, 1);
			const selU8 = lua.lua_tostring(L, 2);
			const ev = evU8 ? to_jsstring(evU8) : "";
			const selector = selU8 ? to_jsstring(selU8) : "";

			const t = lua.lua_type(L, 3);
			let handler;
			if (t === lua.LUA_TFUNCTION) {
				lua.lua_pushvalue(L, 3);
				const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
				handler = { kind: "ref", value: ref };
			} else {
				const nameU8 = lua.lua_tostring(L, 3);
				handler = { kind: "name", value: nameU8 ? to_jsstring(nameU8) : "" };
			}

			const key = `${ev}|${selector}`;
			if (!eventHandlers.has(key)) eventHandlers.set(key, []);
			eventHandlers.get(key).push(handler);

			bindDelegatedEvent(ev);
			return 0;
		});

		// http.get(url, handler) async
		setBridgeFunc("http_get", (L) => {
			const urlU8 = lua.lua_tostring(L, 1);
			const url = urlU8 ? to_jsstring(urlU8) : "";

			const t = lua.lua_type(L, 2);
			let handler;
			if (t === lua.LUA_TFUNCTION) {
				lua.lua_pushvalue(L, 2);
				const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
				handler = { kind: "ref", value: ref };
			} else {
				const nameU8 = lua.lua_tostring(L, 2);
				handler = { kind: "name", value: nameU8 ? to_jsstring(nameU8) : "" };
			}

			fetch(url)
				.then(async (r) => {
					const text = await r.text();
					if (handler.kind === "name") callLuaByName(handler.value, r.status, text);
					else callLuaByRef(handler.value, r.status, text);
				})
				.catch((err) => {
					if (handler.kind === "name") callLuaByName(handler.value, 0, String(err));
					else callLuaByRef(handler.value, 0, String(err));
				});

			return 0;
		});

		// Built-in module "luascript" (optional convenience)
		// NOTE: You can remove this block if you want "framework mode" strictly (modules only via config).
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

			// clear any returned values (keep stack clean)
			lua.lua_settop(L, 0);
		}

		const nodes = Array.from(document.querySelectorAll("lua-script, script[type='lua']"));

		for (const el of nodes) {
			// keep hidden always
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
