local ls = require("luascript")
local M = {}

function M.text(sel, v) return ls.text(sel, v) end
function M.html(sel, v) return ls.html(sel, v) end
function M.attr(sel, name, v) return ls.attr(sel, name, v) end

function M.addClass(sel, cls) return ls.addClass(sel, cls) end
function M.removeClass(sel, cls) return ls.removeClass(sel, cls) end
function M.toggleClass(sel, cls) return ls.toggleClass(sel, cls) end

function M.show(sel)
  local s = ls.attr(sel, "style") or ""
  s = s:gsub("display%s*:%s*none%s*;?", "")
  ls.attr(sel, "style", s .. ";display:block;")
end

function M.hide(sel)
  local s = ls.attr(sel, "style") or ""
  s = s:gsub("display%s*:%s*block%s*;?", "")
  ls.attr(sel, "style", s .. ";display:none;")
end

return M
