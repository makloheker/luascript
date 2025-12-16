local M = {}

local function skip_ws(s, i)
  while true do
    local c = s:sub(i,i)
    if c == " " or c == "\n" or c == "\r" or c == "\t" then i = i + 1 else break end
  end
  return i
end

local function parse_string(s, i)
  i = i + 1
  local out = {}
  while i <= #s do
    local c = s:sub(i,i)
    if c == '"' then return table.concat(out), i + 1 end
    if c == "\\" then
      local n = s:sub(i+1,i+1)
      if n == '"' or n == "\\" or n == "/" then out[#out+1] = n; i = i + 2
      elseif n == "n" then out[#out+1] = "\n"; i = i + 2
      elseif n == "r" then out[#out+1] = "\r"; i = i + 2
      elseif n == "t" then out[#out+1] = "\t"; i = i + 2
      else error("json: bad escape") end
    else
      out[#out+1] = c
      i = i + 1
    end
  end
  error("json: unterminated string")
end

local function parse_number(s, i)
  local j = i
  while j <= #s do
    local c = s:sub(j,j)
    if c:match("[%d%+%-%.eE]") then j = j + 1 else break end
  end
  local n = tonumber(s:sub(i, j-1))
  if n == nil then error("json: bad number") end
  return n, j
end

local parse_value

local function parse_array(s, i)
  i = i + 1
  local arr = {}
  i = skip_ws(s, i)
  if s:sub(i,i) == "]" then return arr, i + 1 end
  while true do
    local v; v, i = parse_value(s, i)
    arr[#arr+1] = v
    i = skip_ws(s, i)
    local c = s:sub(i,i)
    if c == "," then i = skip_ws(s, i + 1)
    elseif c == "]" then return arr, i + 1
    else error("json: expected , or ]") end
  end
end

local function parse_object(s, i)
  i = i + 1
  local obj = {}
  i = skip_ws(s, i)
  if s:sub(i,i) == "}" then return obj, i + 1 end
  while true do
    if s:sub(i,i) ~= '"' then error("json: expected string key") end
    local k; k, i = parse_string(s, i)
    i = skip_ws(s, i)
    if s:sub(i,i) ~= ":" then error("json: expected :") end
    i = skip_ws(s, i + 1)
    local v; v, i = parse_value(s, i)
    obj[k] = v
    i = skip_ws(s, i)
    local c = s:sub(i,i)
    if c == "," then i = skip_ws(s, i + 1)
    elseif c == "}" then return obj, i + 1
    else error("json: expected , or }") end
  end
end

parse_value = function(s, i)
  i = skip_ws(s, i)
  local c = s:sub(i,i)
  if c == '"' then return parse_string(s, i)
  elseif c == "{" then return parse_object(s, i)
  elseif c == "[" then return parse_array(s, i)
  elseif c == "-" or c:match("%d") then return parse_number(s, i)
  elseif s:sub(i,i+3) == "true" then return true, i + 4
  elseif s:sub(i,i+4) == "false" then return false, i + 5
  elseif s:sub(i,i+3) == "null" then return nil, i + 4
  else error("json: unexpected token at " .. i) end
end

function M.decode(s)
  local v, i = parse_value(s, 1)
  i = skip_ws(s, i)
  return v
end


local function is_array(t)
  local n = 0
  for k,_ in pairs(t) do
    if type(k) ~= "number" then return false end
    if k > n then n = k end
  end
  for i = 1, n do
    if rawget(t, i) == nil then return false end
  end
  return true
end

local function esc_str(s)
  s = s:gsub("\\", "\\\\")
  s = s:gsub('"', '\\"')
  s = s:gsub("\n", "\\n")
  s = s:gsub("\r", "\\r")
  s = s:gsub("\t", "\\t")
  return '"' .. s .. '"'
end

local function encode_val(v)
  local tv = type(v)
  if v == nil then return "null" end
  if tv == "string" then return esc_str(v) end
  if tv == "number" then return tostring(v) end
  if tv == "boolean" then return v and "true" or "false" end
  if tv == "table" then
    if is_array(v) then
      local out = {}
      for i = 1, #v do out[#out+1] = encode_val(v[i]) end
      return "[" .. table.concat(out, ",") .. "]"
    else
      local out = {}
      for k,val in pairs(v) do
        out[#out+1] = esc_str(tostring(k)) .. ":" .. encode_val(val)
      end
      return "{" .. table.concat(out, ",") .. "}"
    end
  end
  return esc_str(tostring(v))
end

function M.encode(v)
  return encode_val(v)
end

return M
