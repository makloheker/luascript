local ls = require("luascript")

-- UI helpers (pure Lua)
local function say(text)
  local old = ls.text("#story") or ""
  if old ~= "" then old = old .. "\n" end
  ls.text("#story", old .. text)
end

local function clear_choices()
  ls.clear("#choices")
end

local function choice(options, on_pick)
  clear_choices()
  for i,opt in ipairs(options) do
    -- create button and bind click
    local id = "choice_" .. tostring(i)
    ls.button("#choices", id, opt)
    ls.when("click", "#" .. id, function()
      clear_choices()
      on_pick(i, opt)
    end)
  end
end

-- =========================
-- GAME SCRIPT (Coroutine)
-- =========================
local function game()
  say("Kamu terbangun di ruangan gelap.")
  ls.sleep(700)
  say("Ada suara langkah di lorong...")
  ls.sleep(800)

  choice({ "Buka pintu", "Sembunyi di bawah meja" }, function(idx, _)
    if idx == 1 then
      say("Kamu membuka pintu pelan-pelan.")
      ls.sleep(700)
      say("Di depanmu, ada terminal tua menyala.")
      ls.sleep(700)

      choice({ "Dekati terminal", "Tutup pintu dan kabur" }, function(idx2, _)
        if idx2 == 1 then
          say("Terminal menampilkan pesan: 'Masukkan kode akses'.")
          ls.sleep(600)
          say("Kamu mengetik 'LUA-42'.")
          ls.sleep(700)
          say("✅ Pintu rahasia terbuka. Kamu menang!")
        else
          say("Kamu kabur... tapi tersesat di lorong tanpa ujung.")
          ls.sleep(700)
          say("❌ Game over.")
        end
      end)

    else
      say("Kamu bersembunyi. Nafasmu tertahan.")
      ls.sleep(900)
      say("Langkah itu berhenti tepat di depanmu...")
      ls.sleep(800)
      say("Tiba-tiba sunyi.")
      ls.sleep(700)

      choice({ "Keluar perlahan", "Tetap diam" }, function(idx2, _)
        if idx2 == 1 then
          say("Kamu keluar... dan melihat kunci di lantai.")
          ls.sleep(700)
          say("✅ Kamu selamat dan menemukan jalan keluar. Kamu menang!")
        else
          say("Kamu terlalu lama diam. Ruangan jadi semakin dingin...")
          ls.sleep(700)
          say("❌ Game over.")
        end
      end)
    end
  end)
end

-- Jalankan coroutine game (ini bagian yang “susah di JS” tapi mudah di Lua)
ls.run(game)
