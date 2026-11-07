import catalog from './neovim-themes.json' with { type: 'json' };

const families = ['Neovim', 'Lvim', 'Mini', 'Tokyo Night'];
const themes = new Map(catalog.map((theme) => [theme.name, theme]));

function rgb(hex) {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

function color(values) {
  return `#${values.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

function mix(first, second, amount) {
  const start = rgb(first);
  const end = rgb(second);
  return color(start.map((channel, index) => channel + (end[index] - channel) * amount));
}

function luminance(hex) {
  const components = rgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
}

export function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function readable(foreground, backgrounds, minimum) {
  if (backgrounds.every((background) => contrast(foreground, background) >= minimum)) return foreground;
  const score = (candidate) => Math.min(...backgrounds.map((background) => contrast(candidate, background)));
  const end = score('#000000') > score('#ffffff') ? '#000000' : '#ffffff';
  let lower = 0;
  let upper = 1;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const amount = (lower + upper) / 2;
    const candidate = mix(foreground, end, amount);
    if (score(candidate) >= minimum) upper = amount;
    else lower = amount;
  }
  return mix(foreground, end, upper);
}

function subtleSurface(source, background, foreground) {
  const direction = contrast(source, background) < 1.05 ? mix(background, foreground, 0.1) : source;
  if (contrast(direction, background) <= 1.22) return direction;
  let lower = 0;
  let upper = 1;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const amount = (lower + upper) / 2;
    if (contrast(mix(background, direction, amount), background) <= 1.22) lower = amount;
    else upper = amount;
  }
  return mix(background, direction, lower);
}

export function getTheme(name) {
  const theme = themes.get(name) || themes.get('default');
  const raw = theme.colors;
  const background = raw.background;
  const activeLine = subtleSurface(raw.activeLine, background, raw.foreground);
  const selection = subtleSurface(raw.selection, background, raw.foreground);
  const editingSurfaces = [background, activeLine, selection];
  const foreground = readable(raw.foreground, editingSurfaces, 4.5);
  const gutterBackground = raw.gutterBackground;
  let gutterActiveLine = subtleSurface(raw.activeLine, gutterBackground, raw.gutterForeground);
  const gutterSurfaces = [gutterBackground, gutterActiveLine];
  const bestGutterContrast = Math.max(...['#000000', '#ffffff'].map((candidate) =>
    Math.min(...gutterSurfaces.map((surface) => contrast(candidate, surface)))));
  if (bestGutterContrast < 4.5) gutterActiveLine = gutterBackground;
  const statusBackground = raw.statusBackground;
  const site = {
    page: background,
    shell: mix(background, foreground, 0.035),
    header: mix(background, foreground, 0.1),
    panel: mix(background, foreground, 0.055),
    heading: mix(background, foreground, 0.13),
    field: mix(background, foreground, 0.025),
    status: mix(background, foreground, 0.09),
    button: mix(background, foreground, 0.16),
    buttonHover: mix(background, foreground, 0.23),
    buttonActive: mix(background, foreground, 0.29),
  };
  const siteSurfaces = Object.values(site);
  const light = luminance(background) > 0.4;
  site.foreground = readable(raw.foreground, siteSurfaces, 4.5);
  site.muted = readable(mix(raw.foreground, background, 0.25), siteSurfaces, 4.5);
  site.accent = readable(raw.command, siteSurfaces, 4.5);
  site.error = readable(light ? '#a40000' : '#ff8585', siteSurfaces, 4.5);
  site.border = readable(light ? '#555555' : '#aaaaaa', siteSurfaces, 3);
  site.bevelLight = mix(site.panel, '#ffffff', light ? 0.7 : 0.26);
  site.bevelDark = mix(site.panel, '#000000', light ? 0.42 : 0.45);
  return {
    name: theme.name,
    family: theme.family,
    site,
    colors: {
      ...raw,
      activeLine,
      gutterActiveLine,
      selection,
      foreground,
      gutterForeground: readable(raw.gutterForeground, [gutterBackground, gutterActiveLine], 4.5),
      statusForeground: readable(raw.statusForeground, [statusBackground], 4.5),
      cursor: readable(raw.cursor, editingSurfaces, 4.5),
      command: readable(raw.command, editingSurfaces, 4.5),
      environment: readable(raw.environment, editingSurfaces, 4.5),
      text: readable(raw.text, editingSurfaces, 4.5),
      comment: readable(raw.comment, editingSurfaces, 4.5),
      delimiter: readable(raw.delimiter, editingSurfaces, 4.5),
      operator: readable(raw.operator, editingSurfaces, 4.5),
      number: readable(raw.number, editingSurfaces, 4.5),
    },
  };
}

export function fillThemePicker(select) {
  for (const family of families) {
    const group = document.createElement('optgroup');
    group.label = family;
    for (const theme of catalog.filter((entry) => entry.family === family)) {
      const option = document.createElement('option');
      option.value = theme.name;
      option.textContent = theme.name;
      group.append(option);
    }
    select.append(group);
  }
}

export function applyTheme(shell, theme) {
  const colors = theme.colors;
  const variables = {
    bg: colors.background,
    fg: colors.foreground,
    gutterBg: colors.gutterBackground,
    gutterFg: colors.gutterForeground,
    gutterActiveLine: colors.gutterActiveLine,
    activeLine: colors.activeLine,
    selection: colors.selection,
    statusBg: colors.statusBackground,
    statusFg: colors.statusForeground,
    cursor: colors.cursor,
    ...Object.fromEntries(Object.entries(theme.site).map(([key, value]) => [`site${key[0].toUpperCase()}${key.slice(1)}`, value])),
  };
  for (const [key, value] of Object.entries(variables)) {
    shell.style.setProperty(`--vim-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value);
  }
  shell.dataset.theme = theme.name;
}
