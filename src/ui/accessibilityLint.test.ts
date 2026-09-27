import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Static lint (ADR-HEARTH-180): every icon-only Pressable/TouchableOpacity under src/ui must
 * carry a real accessibilityLabel, since VoiceOver/TalkBack would otherwise announce only a bare,
 * unnamed "button" for it. A touchable that already renders a visible <Text> sibling is exempt —
 * that text is itself readable, even without an explicit label.
 */

const INTERACTIVE_TAGS = ["Pressable", "TouchableOpacity"];

interface JsxElement {
  openTag: string;
  children: string;
}

function listTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsxFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * Finds every `<tagName ...>...</tagName>` or self-closing `<tagName .../>` in `source`, tolerating
 * nested `{}` expressions/strings inside the opening tag and same-named tags nested in the body.
 * Not a real JSX parser — a pragmatic scanner good enough for this codebase's own formatting.
 */
function findElements(source: string, tagName: string): JsxElement[] {
  const results: JsxElement[] = [];
  const openStart = new RegExp(`<${tagName}(?=[\\s/>])`, "g");
  let match: RegExpExecArray | null;
  while ((match = openStart.exec(source))) {
    const start = match.index;
    let i = start + tagName.length + 1;
    let braceDepth = 0;
    let inString: string | null = null;
    let selfClosing = false;
    let openTagEnd = -1;
    for (; i < source.length; i++) {
      const c = source[i];
      if (inString) {
        if (c === inString && source[i - 1] !== "\\") inString = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inString = c;
        continue;
      }
      if (c === "{") {
        braceDepth++;
        continue;
      }
      if (c === "}") {
        braceDepth--;
        continue;
      }
      if (braceDepth === 0 && c === "/" && source[i + 1] === ">") {
        selfClosing = true;
        openTagEnd = i + 2;
        break;
      }
      if (braceDepth === 0 && c === ">") {
        openTagEnd = i + 1;
        break;
      }
    }
    if (openTagEnd === -1) {
      openStart.lastIndex = start + 1;
      continue;
    }
    const openTag = source.slice(start, openTagEnd);
    let children = "";
    let resumeAt = openTagEnd;
    if (!selfClosing) {
      const closeTagStr = `</${tagName}>`;
      let depth = 1;
      let pos = openTagEnd;
      while (depth > 0) {
        const nextOpen = source.indexOf(`<${tagName}`, pos);
        const nextClose = source.indexOf(closeTagStr, pos);
        if (nextClose === -1) {
          pos = source.length;
          break;
        }
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          pos = nextOpen + tagName.length + 1;
        } else {
          depth--;
          pos = nextClose + closeTagStr.length;
        }
      }
      children = source.slice(openTagEnd, Math.max(openTagEnd, pos - closeTagStr.length));
      resumeAt = pos;
    }
    results.push({ openTag, children });
    openStart.lastIndex = Math.max(resumeAt, openTagEnd);
  }
  return results;
}

function findIconOnlyViolations(source: string): string[] {
  const violations: string[] = [];
  for (const tag of INTERACTIVE_TAGS) {
    for (const element of findElements(source, tag)) {
      const hasLabel = /accessibilityLabel/.test(element.openTag);
      const hasVisibleText = /<Text[\s>]/.test(element.children);
      const hasIcon = /<Ionicons[\s>]/.test(element.children);
      if (hasIcon && !hasVisibleText && !hasLabel) {
        violations.push(element.openTag.replace(/\s+/g, " ").trim().slice(0, 160));
      }
    }
  }
  return violations;
}

describe("icon-only touchables have an accessibilityLabel", () => {
  const files = listTsxFiles(__dirname);

  it.each(files)("%s", (file) => {
    const source = readFileSync(file, "utf8");
    expect(findIconOnlyViolations(source)).toEqual([]);
  });
});
