local ls = require("luascript")
local log = require("logger")
local bus = require("eventbus")
local dom = require("dom")
local fetch = require("fetch")

log.setPrefix("[Demo]")

-- Subscribe event
bus.on("hello", function(name)
  dom.setText("#out", "Hello, " .. name .. "!\n(EventBus OK)")
  log.info("Event hello diterima untuk:", name)
end)

-- Button: emit event
ls.when("click", "#btnHello", function()
  bus.emit("hello", "Angga")
end)

-- Button: fetch JSON
ls.when("click", "#btnFetch", function()
  dom.setText("#out", "Fetching JSON...")
  fetch.json("https://jsonplaceholder.typicode.com/todos/1", function(status, data)
    if type(data) == "string" then
      dom.setText("#out", "Error: " .. data .. " (status " .. tostring(status) .. ")")
      log.error("Fetch failed:", status, data)
      return
    end

    -- data adalah table Lua hasil JSON decode
    local txt = "Fetch OK!\n"
      .. "id: " .. tostring(data.id) .. "\n"
      .. "title: " .. tostring(data.title) .. "\n"
      .. "completed: " .. tostring(data.completed)

    dom.setText("#out", txt)
    log.info("Fetch JSON success:", "id=" .. tostring(data.id))
  end)
end)

ls.display("Demo ready. Klik tombol.")
