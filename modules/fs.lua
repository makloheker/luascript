local M = {}

local function split(path)
  local t = {}
  for part in tostring(path):gmatch("[^/]+") do
    if part ~= "" and part ~= "." then
      if part == ".." then
        if #t > 0 then table.remove(t) end
      else
        table.insert(t, part)
      end
    end
  end
  return t
end

local function norm(path)
  if not path or path == "" then return "/" end
  local abs = path:sub(1,1) == "/"
  local parts = split(path)
  return (abs and "/" or "") .. table.concat(parts, "/")
end

local function join(a, b)
  if a:sub(-1) == "/" then return a .. b end
  return a .. "/" .. b
end

local root = { __type="dir", children={} }
local cwd = "/"

local function getNode(path)
  path = norm(path)
  local parts = split(path)
  local node = root
  for _,p in ipairs(parts) do
    if node.__type ~= "dir" then return nil end
    node = node.children[p]
    if not node then return nil end
  end
  return node
end

local function ensureDir(path)
  path = norm(path)
  if path == "/" then return root end
  local parts = split(path)
  local node = root
  for _,p in ipairs(parts) do
    node.children[p] = node.children[p] or { __type="dir", children={} }
    node = node.children[p]
    if node.__type ~= "dir" then error("fs: path is not dir: "..path) end
  end
  return node
end

local function parentDir(path)
  path = norm(path)
  if path == "/" then return "/", "" end
  local parts = split(path)
  local name = table.remove(parts)
  local p = "/" .. table.concat(parts, "/")
  if p == "" then p = "/" end
  return p, name
end

function M.cwd() return cwd end

function M.cd(path)
  local p = path:sub(1,1) == "/" and path or join(cwd, path)
  p = norm(p)
  local node = getNode(p)
  if not node or node.__type ~= "dir" then error("fs: no such dir: "..p) end
  cwd = p
  return true
end

function M.mkdir(path)
  local p = path:sub(1,1) == "/" and path or join(cwd, path)
  ensureDir(p)
  return true
end

function M.write(path, data)
  local p = path:sub(1,1) == "/" and path or join(cwd, path)
  p = norm(p)
  local dirPath, name = parentDir(p)
  local dir = ensureDir(dirPath)
  dir.children[name] = { __type="file", data=tostring(data or "") }
  return true
end

function M.read(path)
  local p = path:sub(1,1) == "/" and path or join(cwd, path)
  p = norm(p)
  local node = getNode(p)
  if not node or node.__type ~= "file" then return nil end
  return node.data
end

function M.exists(path)
  local p = path:sub(1,1) == "/" and path or join(cwd, path)
  p = norm(p)
  return getNode(p) ~= nil
end

function M.rm(path)
  local p = path:sub(1,1) == "/" and path or join(cwd, path)
  p = norm(p)
  local dirPath, name = parentDir(p)
  local dir = getNode(dirPath)
  if not dir or dir.__type ~= "dir" then return false end
  dir.children[name] = nil
  return true
end

function M.ls(path)
  local p = path and (path:sub(1,1)=="/" and path or join(cwd, path)) or cwd
  p = norm(p)
  local node = getNode(p)
  if not node or node.__type ~= "dir" then error("fs: no such dir: "..p) end
  local out = {}
  for k,v in pairs(node.children) do
    out[#out+1] = { name=k, type=v.__type }
  end
  table.sort(out, function(a,b) return a.name < b.name end)
  return out
end

function M.path(p) return norm(p) end

return M
