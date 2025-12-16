local M = {}
local subs = {}

function M.on(topic, fn)
  if not subs[topic] then subs[topic] = {} end
  table.insert(subs[topic], fn)
  return function()
    local arr = subs[topic]
    if not arr then return end
    for i = #arr, 1, -1 do
      if arr[i] == fn then table.remove(arr, i) end
    end
  end
end

function M.emit(topic, ...)
  local arr = subs[topic]
  if not arr then return end
  for i = 1, #arr do arr[i](...) end
end

return M
