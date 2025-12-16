local bridge = __LS_BRIDGE
local M = {}

local function assertBridge(name)
  if not (bridge and bridge[name]) then
    error("http.lua: missing __LS_BRIDGE." .. name)
  end
end

local function decodeJsonHeaders(s)
  if not s or s == "" then return nil end
  local json = require("json")
  if json and json.decode then
    local ok, obj = pcall(json.decode, s)
    if ok then return obj end
  end
  return nil
end

function M.request(method, url, opts, cb)
  assertBridge("http_request")
  method = tostring(method or "GET"):upper()
  url = tostring(url or "")
  opts = opts or {}

  local headers = opts.headers or {}
  local body = opts.body or ""

  if opts.json ~= nil then
    local json = require("json")
    if not (json and json.encode) then error("http.lua: json.encode required") end
    body = json.encode(opts.json)
    if headers["Content-Type"] == nil then headers["Content-Type"] = "application/json" end
  end

  local json = require("json")
  local headersJson = (json and json.encode) and json.encode(headers) or "{}"

  bridge.http_request(method, url, headersJson, body, function(status, text, headersJson2)
    cb(tonumber(status) or 0, text, decodeJsonHeaders(headersJson2))
  end)
end

function M.get(url, cb)
  return M.request("GET", url, {}, cb)
end

function M.post(url, body, cb)
  return M.request("POST", url, { body = body }, cb)
end

function M.getJSON(url, cb)
  local json = require("json")
  if not (json and json.decode) then error("http.lua: json.decode required") end
  return M.get(url, function(status, text, headers)
    if status ~= 200 then cb(status, nil, headers, "HTTP " .. tostring(status)); return end
    local ok, obj = pcall(json.decode, text)
    if not ok then cb(status, nil, headers, "JSON parse error"); return end
    cb(status, obj, headers, nil)
  end)
end

return M
