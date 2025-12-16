local http = require("http")
local M = {}

function M.text(url, cb)
  http.get(url, function(status, body)
    cb(status, body)
  end)
end

function M.json(url, cb)
  http.getJSON(url, function(status, obj, headers, err)
    if err then cb(status, err) else cb(status, obj) end
  end)
end

function M.request(method, url, opts, cb)
  http.request(method, url, opts, function(status, body, headers)
    cb(status, body, headers)
  end)
end

return M
