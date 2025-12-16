local bridge = __LS_BRIDGE
local M = {}

local function assertBridge(name)
  if not (bridge and bridge[name]) then
    error("crypto.lua: missing __LS_BRIDGE." .. name)
  end
end

function M.sha256(text, cb)
  assertBridge("crypto_sha256")
  return bridge.crypto_sha256(tostring(text), cb)
end

function M.pbkdf2(password, salt, iterations, bits, cb)
  assertBridge("crypto_pbkdf2")
  iterations = tonumber(iterations) or 100000
  bits = tonumber(bits) or 256
  return bridge.crypto_pbkdf2(tostring(password), tostring(salt), iterations, bits, cb)
end

function M.randomBytes(n)
  assertBridge("crypto_random_bytes")
  return bridge.crypto_random_bytes(tonumber(n) or 16)
end

return M
