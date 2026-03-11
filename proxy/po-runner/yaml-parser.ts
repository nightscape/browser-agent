// Minimal YAML frontmatter parser — handles the subset used in SensAI skill
// definitions. Not a general YAML parser: covers scalars, maps,
// arrays-of-maps, 2-space indent nesting. JSON input falls through to
// JSON.parse. Kept tiny so the runner bundle stays small (no `yaml` dep).

interface ParsedSkill {
  elements?: Record<string, { selector: string }>;
  actions?: Record<string, unknown>;
  [key: string]: unknown;
}

export function parseSkillInput(input: string | object): ParsedSkill {
  if (typeof input === "object" && input !== null) {
    return input as ParsedSkill;
  }
  if (typeof input !== "string") {
    throw new Error("sensaiPageObject: input must be a YAML/MD string or object");
  }
  let text = input.trim();
  if (text[0] === "{") return JSON.parse(text);
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (m) text = m[1]!;
  return parseYaml(text) as ParsedSkill;
}

function parseYaml(text: string): unknown {
  const lines = text.split("\n");
  let i = 0;

  function indent(line: string): number {
    const m = line.match(/^(\s*)/);
    return m ? m[1]!.length : 0;
  }

  function parseVal(str: string): unknown {
    str = str.trim();
    if ((str[0] === '"' && str[str.length - 1] === '"') ||
        (str[0] === "'" && str[str.length - 1] === "'")) {
      return str.slice(1, -1);
    }
    if (str[0] === "[" && str[str.length - 1] === "]") {
      // Inline (flow-style) array: [a, b, "c"]
      const inner = str.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map(s => parseVal(s.trim()));
    }
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);
    if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
    if (str === "true") return true;
    if (str === "false") return false;
    if (str === "null") return null;
    return str;
  }

  function parseBlock(minIndent: number): unknown {
    if (i >= lines.length) return {};
    let line = lines[i]!;
    while (i < lines.length && (!line.trim() || line.trim()[0] === "#")) {
      i++;
      line = lines[i]!;
    }
    if (i >= lines.length) return {};
    if (line.trimStart().startsWith("- ")) return parseArray(minIndent);
    return parseMap(minIndent);
  }

  function parseMap(atIndent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    while (i < lines.length) {
      const line = lines[i]!;
      if (!line.trim() || line.trim()[0] === "#") { i++; continue; }
      const ind = indent(line);
      if (ind < atIndent) break;
      if (ind > atIndent) break;

      const trimmed = line.trim();
      const colon = trimmed.indexOf(": ");
      if (colon === -1 && trimmed.endsWith(":")) {
        const key = trimmed.slice(0, -1);
        i++;
        result[key] = parseBlock(atIndent + 2);
      } else if (colon !== -1) {
        const key = trimmed.slice(0, colon);
        const val = trimmed.slice(colon + 2);
        result[key] = parseVal(val);
        i++;
      } else {
        i++;
      }
    }
    return result;
  }

  function parseArray(atIndent: number): unknown[] {
    const result: unknown[] = [];
    while (i < lines.length) {
      const line = lines[i]!;
      if (!line.trim() || line.trim()[0] === "#") { i++; continue; }
      const ind = indent(line);
      if (ind < atIndent) break;
      const trimmed = line.trim();
      if (!trimmed.startsWith("- ")) break;

      const after = trimmed.slice(2);
      const colon = after.indexOf(": ");
      const item: Record<string, unknown> = {};

      if (colon !== -1) {
        item[after.slice(0, colon)] = parseVal(after.slice(colon + 2));
        i++;
      } else if (after.endsWith(":")) {
        const k = after.slice(0, -1);
        i++;
        item[k] = parseBlock(ind + 4);
      } else {
        result.push(parseVal(after));
        i++;
        continue;
      }

      const contIndent = ind + 2;
      while (i < lines.length) {
        const nl = lines[i]!;
        if (!nl.trim() || nl.trim()[0] === "#") { i++; continue; }
        if (indent(nl) < contIndent) break;
        if (indent(nl) > contIndent) break;
        if (nl.trim().startsWith("- ")) break;
        const nt = nl.trim();
        const nc = nt.indexOf(": ");
        if (nc !== -1) {
          item[nt.slice(0, nc)] = parseVal(nt.slice(nc + 2));
          i++;
        } else if (nt.endsWith(":")) {
          const nk = nt.slice(0, -1);
          i++;
          item[nk] = parseBlock(contIndent + 2);
        } else {
          i++;
        }
      }
      result.push(item);
    }
    return result;
  }

  return parseBlock(0);
}
