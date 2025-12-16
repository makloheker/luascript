local bridge = __LS_BRIDGE
local M = {}

local function assertBridge(name)
  if not (bridge and bridge[name]) then
    error("ws.lua: missing __LS_BRIDGE." .. name)
  end
end

local WS = {}
WS.__index = WS

function WS:send(text)
  assertBridge("ws_send")
  return bridge.ws_send(self.id, tostring(text))
end

function WS:close(code, reason)
  assertBridge("ws_close")
  return bridge.ws_close(self.id, tonumber(code) or 1000, tostring(reason or ""))
end

function M.connect(url, opts)
  assertBridge("ws_connect")
  opts = opts or {}
  local id = bridge.ws_connect(tostring(url), opts.onOpen, opts.onMessage, opts.onClose, opts.onError)
  return setmetatable({ id = id, url = url }, WS)
end

return M
