// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE

(function(mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../../lib/codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../../lib/codemirror"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function(CodeMirror) {
    "use strict";

    CodeMirror.defineMode('cmd', function() {

        var words = {};

        function define(style, dict) {
            for (var i = 0; i < dict.length; i++) {
                words[dict[i]] = style;
            }
        };

        var commonAtoms = ["true", "false"]
        var commonKeywords = 'goto|call|exit|break|exist|defined|errorlevel|cmdextversion|if|else|for|EQU|NEQ|LSS|LEQ|GTR|GEQ'.split('|')
        var commonCommands = 'assoc|bcdedit|cd|chcp|chdir|cls|color|copy|date|del|dir|echo|endlocal|erase|format|ftype|graftabl|md|mkdir|mklink|mode|more|move|path|pause|popd|prompt|pushd|rd|rem|ren|rename|rmdir|robocopy|set|setlocal|shift|start|time|title|tree|type|ver|verify|vol|wmic'.split("|")

        function cmdHint(editor, options) {
            var cur = editor.getCursor(),
                token = editor.getTokenAt(cur);
            if (token.string == "") return
            // 关键字提示
            var hints = [], tokenstring = token.string.toUpperCase()
            var localCommands = JSON.parse(localStorage['cmdCommands'])
            commonAtoms.concat(commonKeywords, commonCommands, localCommands).forEach(x => {
                if (x.toUpperCase().slice(0, token.string.length) == tokenstring && !hints.includes(x)) hints.push(x)
            })
            // 特殊变量提示
            var specialVars = localStorage['specialVars']
            if (specialVars) specialVars.split(',').forEach(s => {
                if (s.toUpperCase().slice(2, token.string.length + 2) == tokenstring) hints.push(s)
            })
            // 本地单词提示
            var anyword = CodeMirror.hint.anyword(editor, options).list
            anyword.forEach(a => {
                if (!hints.includes(a)) hints.push(a)
            })
            return {
                list: hints,
                from: CodeMirror.Pos(cur.line, token.start),
                to: CodeMirror.Pos(cur.line, token.end)
            };
        }

        CodeMirror.registerHelper("hint", "cmd", cmdHint);

        define('atom', commonAtoms);
        define('keyword', commonKeywords);
        define('builtin', commonCommands);

        function tokenBase(stream, state) {
            if (stream.eatSpace()) return null;

            var sol = stream.sol();
            var ch = stream.next();

            // if (ch === '\\') {
            //   stream.next();
            //   return null;
            // }
            if (ch === '\'' || ch === '"') {
                state.tokens.unshift(tokenString(ch, ch === "`" ? "quote" : "string"));
                return tokenize(stream, state);
            }
            if (ch === ':') {
                //   if (sol && stream.eat('!')) {
                //     stream.skipToEnd();
                //     return 'meta'; // 'comment'?
                //   }
                if (stream.eat(':')) {
                    stream.skipToEnd();
                    return 'comment';
                }
            }
            if (ch === '%') {
                state.tokens.unshift(tokenDollar);
                return tokenize(stream, state);
            }
            if (ch === '+' || ch === '=' || ch === '@') {
                return 'operator';
            }
            if (ch === '-') {
                stream.eat(ch);
                stream.eatWhile(/\w/);
                return 'attribute';
            }
            if (/^[0-9\.]/.test(ch)) {
                stream.eatWhile(/\d/);
                if (stream.eol() || !/\w/.test(stream.peek())) {
                    return 'number';
                }
            }
            stream.eatWhile(/[\w-]/);
            var cur = stream.current();
            if (stream.peek() === '=' && /\w+/.test(cur)) return 'def';
            return words.hasOwnProperty(cur) ? words[cur] : null;
        }

        function tokenString(quote, style) {
            var close = quote == "(" ? ")" : quote == "{" ? "}" : quote
            return function(stream, state) {
                var next, escaped = false;
                while ((next = stream.next()) != null) {
                    if (next === close && !escaped) {
                        state.tokens.shift();
                        break;
                    } else if (next === '$' && !escaped && quote !== "'" && stream.peek() != close) {
                        escaped = true;
                        stream.backUp(1);
                        state.tokens.unshift(tokenDollar);
                        break;
                    } else if (!escaped && quote !== close && next === quote) {
                        state.tokens.unshift(tokenString(quote, style))
                        return tokenize(stream, state)
                    } else if (!escaped && /['"]/.test(next) && !/['"]/.test(quote)) {
                        state.tokens.unshift(tokenStringStart(next, "string"));
                        stream.backUp(1);
                        break;
                    }
                    escaped = !escaped && next === '\\';
                }
                return style;
            };
        };

        function tokenStringStart(quote, style) {
            return function(stream, state) {
                state.tokens[0] = tokenString(quote, style)
                stream.next()
                return tokenize(stream, state)
            }
        }

        var tokenDollar = function(stream, state) {
            if (state.tokens.length > 1) stream.eat('$');
            var ch = stream.next()
            if (/['"({]/.test(ch)) {
                state.tokens[0] = tokenString(ch, ch == "(" ? "quote" : ch == "{" ? "def" : "string");
                return tokenize(stream, state);
            }
            if (!/\d/.test(ch)) stream.eatWhile(/\w/);
            state.tokens.shift();
            return 'def';
        };

        function tokenize(stream, state) {
            return (state.tokens[0] || tokenBase)(stream, state);
        };

        return {
            startState: function() { return { tokens: [] }; },
            token: function(stream, state) {
                return tokenize(stream, state);
            },
            closeBrackets: "()[]{}''\"\"",
            lineComment: '::',
            fold: "brace"
        };
    });

    CodeMirror.defineMIME('text/x-sh', 'cmd');
    // Apache uses a slightly different Media Type for cmd scripts
    // http://svn.apache.org/repos/asf/httpd/httpd/trunk/docs/conf/mime.types
    CodeMirror.defineMIME('application/x-sh', 'cmd');

});
