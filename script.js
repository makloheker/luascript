(() => {
	const FENGARI_URL = "https://unpkg.com/fengari-web/dist/fengari-web.js";

	function loadScript(url) {
		return new Promise((resolve, reject) => {
			if ([...document.scripts].some((s) => s.src === url)) return resolve();
			const s = document.createElement("script");
			s.src = url;
			s.async = true;
			s.onload = resolve;
			s.onerror = () => reject(new Error("Failed to load " + url));
			document.head.appendChild(s);
		});
	}

	async function fetchText(url) {
		const r = await fetch(url);
		if (!r.ok) throw new Error(`${url} (${r.status})`);
		return await r.text();
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

		let currentWrite = (line) => console.log(line);
		let debugEnabled = false;

		// override print()
		lua.lua_pushcfunction(L, function (L) {
			const n = lua.lua_gettop(L);
			const out = [];
			for (let i = 1; i <= n; i++) {
				lauxlib.luaL_tolstring(L, i);
				out.push(to_jsstring(lua.lua_tostring(L, -1)));
				lua.lua_pop(L, 1);
			}
			currentWrite(out.join("\t"));
			return 0;
		});
		lua.lua_setglobal(L, to_luastring("print"));

		function debug(msg) {
			if (debugEnabled) currentWrite("[LuaDebug] " + msg);
		}

		function luaError(stage) {
			const msg = to_jsstring(lua.lua_tostring(L, -1));
			lua.lua_pop(L, 1);
			currentWrite(`[LuaError] ${stage}: ${msg}`);
		}

		function registerModule(name, sourceLua) {
			lua.lua_getglobal(L, to_luastring("package"));
			lua.lua_getfield(L, -1, to_luastring("preload"));

			lua.lua_pushstring(L, to_luastring(sourceLua));
			lua.lua_pushcclosure(
				L,
				function (L) {
					const src = to_jsstring(lua.lua_tostring(L, lua.lua_upvalueindex(1)));

					const stLoad = lauxlib.luaL_loadstring(L, to_luastring(src));
					if (stLoad !== lua.LUA_OK) return lua.lua_error(L);

					const stCall = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
					if (stCall !== lua.LUA_OK) return lua.lua_error(L);

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

		const configCache = new Set();

		async function applyConfig(configUrl) {
			if (!configUrl || configCache.has(configUrl)) return;

			const cfg = JSON.parse(await fetchText(configUrl));
			if (cfg && cfg.modules) {
				for (const [name, path] of Object.entries(cfg.modules)) {
					const src = await fetchText(path);
					registerModule(name, src);
					debug(`module loaded: ${name} <- ${path}`);
				}
			}
			configCache.add(configUrl);
		}

		function runLua(code) {
			if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== lua.LUA_OK) return luaError("syntax");

			if (lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0) !== lua.LUA_OK) return luaError("runtime");
		}

		const globalDebug = document.currentScript?.getAttribute("debug") === "true";

		const nodes = Array.from(document.querySelectorAll("lua-script, script[type='lua']"));

		for (const el of nodes) {
			if (el.tagName.toLowerCase() === "lua-script") {
				el.style.display = "none";
			}

			currentWrite = makeOutput(el);
			debugEnabled = el.getAttribute("debug") === "true" || globalDebug;

			const configUrl = el.getAttribute("config");
			try {
				await applyConfig(configUrl);
			} catch (e) {
				currentWrite("[LuaError] config: " + e.message);
				continue;
			}

			let code = "";
			if (el.tagName.toLowerCase() === "lua-script") {
				code = el.textContent || "";
			} else if (el.getAttribute("src")) {
				code = await fetchText(el.getAttribute("src"));
			} else {
				code = el.textContent || "";
			}

			runLua(code);
		}
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => boot().catch(console.error));
	} else {
		boot().catch(console.error);
	}
})();
