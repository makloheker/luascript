local bridge = __LS_BRIDGE
local json = require("json")
local ls = require("luascript")

local M = {}
local lastUrl = nil

local function assertBridge(name)
  if not (bridge and bridge[name]) then
    error("pdf.lua: missing __LS_BRIDGE." .. name)
  end
end

function M.create()
  assertBridge("pdf_create")
  return bridge.pdf_create()
end

function M.page()
  assertBridge("pdf_add_page")
  bridge.pdf_add_page()
end

function M.text(x, y, text, size)
  assertBridge("pdf_text")
  bridge.pdf_text(tostring(x), tostring(y), tostring(text or ""), tostring(size or 12))
end

function M.table(x, y, headers, rows)
  assertBridge("pdf_table")
  bridge.pdf_table(
    tostring(x),
    tostring(y),
    json.encode(headers or {}),
    json.encode(rows or {})
  )
end

function M.save(filename)
  assertBridge("pdf_save")
  bridge.pdf_save(tostring(filename or "output.pdf"))
end

function M.blobUrl()
  assertBridge("pdf_blob_url")
  local url = bridge.pdf_blob_url()
  return url
end

function M.revoke(url)
  if bridge and bridge.pdf_revoke and url then
    bridge.pdf_revoke(url)
  end
end

function M.preview(selector)
  local url = M.blobUrl()
  if not url then error("pdf.preview: failed to create blob url") end

  if lastUrl then M.revoke(lastUrl) end
  lastUrl = url

  ls.attr(selector, "src", url)
  return url
end

return M
