local M = {}

function M.seed(x)
  math.randomseed(tonumber(x) or os.time())
end

function M.rint(a, b)
  a, b = tonumber(a) or 0, tonumber(b) or 0
  if a > b then a, b = b, a end
  return math.random(a, b)
end

function M.rfloat(a, b)
  a, b = tonumber(a) or 0, tonumber(b) or 1
  if a > b then a, b = b, a end
  return a + (b - a) * math.random()
end

function M.clamp(x, lo, hi)
  x, lo, hi = tonumber(x) or 0, tonumber(lo) or 0, tonumber(hi) or 0
  if x < lo then return lo end
  if x > hi then return hi end
  return x
end

function M.lerp(a, b, t)
  a, b, t = tonumber(a) or 0, tonumber(b) or 0, tonumber(t) or 0
  return a + (b - a) * t
end

function M.dist(x1, y1, x2, y2)
  local dx = (tonumber(x2) or 0) - (tonumber(x1) or 0)
  local dy = (tonumber(y2) or 0) - (tonumber(y1) or 0)
  return math.sqrt(dx*dx + dy*dy)
end

return M
