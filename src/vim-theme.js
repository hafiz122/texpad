import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
export { Compartment } from '@codemirror/state';
import { tags } from '@lezer/highlight';
export const latexLanguage = StreamLanguage.define({
  startState: () => ({ textDepth: 0, environment: false }),
  token(stream, state) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^%.*$/)) return 'comment';
    if (stream.match(/^\\(?:begin|end)\b/)) {
      state.environment = true;
      return 'command';
    }
    if (stream.match(/^\\text(?:bf|it|rm|sf)?\b/)) {
      state.textDepth = -1;
      return 'command';
    }
    if (stream.match(/^\\(?:[A-Za-z@]+|.)/)) return state.textDepth > 0 ? 'text' : 'command';
    if (stream.match(/^[{[()\]}]/)) {
      const character = stream.current();
      if (state.textDepth === -1 && character === '{') state.textDepth = 1;
      else if (state.textDepth > 0) {
        if (character === '{') state.textDepth += 1;
        if (character === '}') state.textDepth -= 1;
      }
      if (state.environment && character === '}') state.environment = false;
      return 'delimiter';
    }
    if (state.environment) {
      stream.eatWhile(/[^}]/);
      return 'environment';
    }
    if (state.textDepth > 0) {
      stream.eatWhile(/[^{}\\%]/);
      return 'text';
    }
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number';
    if (stream.match(/^[=+\-*/^_<>|&]+/)) return 'operator';
    stream.next();
    return null;
  },
  tokenTable: {
    command: tags.keyword,
    environment: tags.typeName,
    text: tags.string,
    comment: tags.comment,
    delimiter: tags.bracket,
    operator: tags.operator,
    number: tags.number,
  },
});

export function themeHighlighting(theme) {
  const colors = theme.colors;
  return syntaxHighlighting(HighlightStyle.define([
    { tag: tags.keyword, color: colors.command },
    { tag: tags.typeName, color: colors.environment },
    { tag: tags.string, color: colors.text },
    { tag: tags.comment, color: colors.comment },
    { tag: tags.bracket, color: colors.delimiter },
    { tag: tags.operator, color: colors.operator },
    { tag: tags.number, color: colors.number },
  ]));
}
