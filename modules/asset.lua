local bridge = __LS_BRIDGE
local http = require("http")
local M = {}

local cache = { text = {}, json = {}, image = {}, audio = {} }

local function assertBridge(name)
  if not (bridge and bridge[name]) then
    error("asset.lua: missing __LS_BRIDGE." .. name)
  end
end

function M.text(url, cb)
  if cache.text[url] then cb(true, cache.text[url]); return end
  http.get(url, function(status, body)
    if status ~= 200 then cb(false, "HTTP " .. tostring(status)); return end
    cache.text[url] = body
    cb(true, body)
  end)
end

function M.json(url, cb)
  local json = require("json")
  if not (json and json.decode) then error("asset.json: json.decode required") end
  if cache.json[url] then cb(true, cache.json[url]); return end
  M.text(url, function(ok, bodyOrErr)
    if not ok then cb(false, bodyOrErr); return end
    local ok2, obj = pcall(json.decode, bodyOrErr)
    if not ok2 then cb(false, "JSON parse error"); return end
    cache.json[url] = obj
    cb(true, obj)
  end)
end

function M.image(url, cb)
  assertBridge("asset_image")
  if cache.image[url] then cb(true, cache.image[url]); return end
  bridge.asset_image(url, function(ok, w, h, src)
    if not ok then cb(false, "load image failed"); return end
    local info = { src = src, w = tonumber(w) or 0, h = tonumber(h) or 0 }
    cache.image[url] = info
    cb(true, info)
  end)
end

function M.audio(url, cb)
  assertBridge("asset_audio")
  if cache.audio[url] then cb(true, cache.audio[url]); return end
  bridge.asset_audio(url, function(ok, src)
    if not ok then cb(false, "load audio failed"); return end
    cache.audio[url] = src
    cb(true, src)
  end)
end

function M.revoke(src)
  if bridge and bridge.asset_revoke then bridge.asset_revoke(tostring(src)) end
end

function M.clear()
  cache.text, cache.json, cache.image, cache.audio = {}, {}, {}, {}
end

return M
