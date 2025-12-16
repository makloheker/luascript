local ls = require("luascript")

math.randomseed(os.time())

local score = 0

local function setScore(v)
  score = v
  ls.text("#score", tostring(score))
end

local function moveTarget()
  local arenaW = 600
  local arenaH = 360
  local size = 48

  local x = math.random(0, arenaW - size)
  local y = math.random(0, arenaH - size)

  ls.attr("#target", "style",
    "left:"..x.."px;top:"..y.."px;width:"..size.."px;height:"..size.."px;"
  )
end

-- Klik target → skor +1 → pindah posisi
ls.when("click", "#target", function()
  setScore(score + 1)
  moveTarget()
end)

-- Reset
ls.when("click", "#resetBtn", function()
  setScore(0)
  moveTarget()
end)

-- Init
setScore(0)
moveTarget()
ls.display("Lua game ready!")
