local bridge = __LS_BRIDGE
local M = {}

local function assertBridge(name)
  if not (bridge and bridge[name]) then
    error("storage.lua: missing __LS_BRIDGE." .. name)
  end
end

function M.get(key)
  assertBridge("storage_get")
  return bridge.storage_get(tostring(key))
end

function M.set(key, value)
  assertBridge("storage_set")
  return bridge.storage_set(tostring(key), tostring(value))
end

function M.remove(key)
  assertBridge("storage_remove")
  return bridge.storage_remove(tostring(key))
end

function M.clear()
  assertBridge("storage_clear")
  return bridge.storage_clear()
end

function M.keys()
  assertBridge("storage_keys")
  local s = bridge.storage_keys()
  local out = {}
  if not s or s == "" then return out end
  for k in tostring(s):gmatch("([^\n]+)") do out[#out+1] = k end
  return out
end

return M
