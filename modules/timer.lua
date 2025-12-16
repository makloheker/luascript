local bridge = __LS_BRIDGE
local M = {}

function M.setTimeout(ms, fn) return bridge.set_timeout(ms, fn) end
function M.setInterval(ms, fn) return bridge.set_interval(ms, fn) end
function M.clear(id) return bridge.clear_timer(id) end

return M
