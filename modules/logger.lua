local ls = require("luascript")

local M = {}
local prefix = "[Lua]"

function M.setPrefix(p) prefix = p end

local function joinArgs(...)
  local t = {}
  for i = 1, select("#", ...) do
    t[#t+1] = tostring(select(i, ...))
  end
  return table.concat(t, " ")
end

function M.info(...)  ls.display(prefix .. " " .. joinArgs(...)) end
function M.warn(...)  ls.display(prefix .. " [WARN] " .. joinArgs(...)) end
function M.error(...) ls.display(prefix .. " [ERROR] " .. joinArgs(...)) end

return M
