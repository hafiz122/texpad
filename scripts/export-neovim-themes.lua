-- Run with: nvim --headless -u NONE -i NONE -c 'luafile scripts/export-neovim-themes.lua' +qa
vim.opt.termguicolors = true
for _, package in ipairs({ 'lvim-utils', 'lvim-colorscheme', 'mini.nvim', 'tokyonight.nvim' }) do
  vim.cmd.packadd(package)
end

local function hex(value)
  return value and string.format('#%06x', value) or nil
end

local function group(name)
  return vim.api.nvim_get_hl(0, { name = name, link = false })
end

local function color(name, field, fallback)
  return hex(group(name)[field]) or fallback
end

local function family(name)
  if name:match('^lvim%-') then return 'Lvim' end
  if name:match('^mini') or name == 'randomhue' then return 'Mini' end
  if name:match('^tokyonight') then return 'Tokyo Night' end
  return 'Neovim'
end

local catalog = {}
for _, name in ipairs(vim.fn.getcompletion('', 'color')) do
  vim.o.background = 'dark'
  vim.cmd.colorscheme(name)
  local light = vim.o.background == 'light'
  local baseBackground = light and '#ffffff' or '#14161b'
  local baseForeground = light and '#202020' or '#e0e2ea'
  local background = color('Normal', 'bg', baseBackground)
  local foreground = color('Normal', 'fg', baseForeground)
  local accent = color('Statement', 'fg', color('Type', 'fg', foreground))
  catalog[#catalog + 1] = {
    name = name,
    family = family(name),
    colors = {
      background = background,
      foreground = foreground,
      gutterBackground = color('SignColumn', 'bg', background),
      gutterForeground = color('LineNr', 'fg', foreground),
      activeLine = color('CursorLine', 'bg', background),
      selection = color('Visual', 'bg', accent),
      statusBackground = color('StatusLine', 'bg', background),
      statusForeground = color('StatusLine', 'fg', foreground),
      cursor = color('Cursor', 'bg', accent),
      command = color('Statement', 'fg', accent),
      environment = color('Type', 'fg', accent),
      text = color('String', 'fg', foreground),
      comment = color('Comment', 'fg', foreground),
      delimiter = color('Delimiter', 'fg', foreground),
      operator = color('Operator', 'fg', foreground),
      number = color('Number', 'fg', foreground),
    },
  }
end

assert(#catalog == 88, 'Expected 88 colorschemes, got ' .. #catalog)
vim.fn.writefile({ vim.json.encode(catalog) }, 'src/neovim-themes.json')
print('Exported ' .. #catalog .. ' Neovim colorschemes')
