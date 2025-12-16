local bridge = __LS_BRIDGE
local M = {}

local function assertBridge(name)
  if not (bridge and bridge[name]) then
    error("timer.lua: missing __LS_BRIDGE." .. name)
  end
end

function M.setTimeout(ms, fn)
  assertBridge("set_timeout")
  return bridge.set_timeout(ms, fn)
end

function M.setInterval(ms, fn)
  assertBridge("set_interval")
  return bridge.set_interval(ms, fn)
end

function M.clear(id)
  assertBridge("clear_timer")
  return bridge.clear_timer(id)
end

return M
