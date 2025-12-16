local bridge = __LS_BRIDGE
local M = {}

function M.display(...) bridge.display(...) end
function M.when(ev, sel, fn) bridge.when(ev, sel, fn) end

function M.text(sel, v) return bridge.text(sel, v) end
function M.html(sel, v) return bridge.html(sel, v) end
function M.attr(sel, name, v) return bridge.attr(sel, name, v) end

function M.addClass(sel, c) return bridge.addClass(sel, c) end
function M.removeClass(sel, c) return bridge.removeClass(sel, c) end

return M
