import postcss from "postcss";
import ts from "typescript";

export interface StyleSource {
  path: string;
  content: string;
}

export interface StyleDiagnostic {
  path: string;
  line: number;
  message: string;
}

// Strings and comments are data, not var() calls or selector classes.
const withoutCssStrings = (value: string) =>
  value.replaceAll(
    /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    " ",
  );

const recipeNames = (value: string) =>
  value
    .split(/\s+/)
    .filter((token) => /^af-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(token));

/** Only static className values, their local constants and clsx-style branches
 * are checked. Runtime expressions and interpolated class names are skipped. */
function findRecipeUses(source: StyleSource) {
  const file = ts.createSourceFile(
    source.path,
    source.content,
    ts.ScriptTarget.Latest,
    true,
    source.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const constants = new Map<string, ts.Expression | undefined>();
  const uses: Array<{ name: string; line: number }> = [];
  const recordBinding = (name: ts.BindingName, initializer?: ts.Expression) => {
    if (ts.isIdentifier(name)) {
      constants.set(
        name.text,
        constants.has(name.text) ? undefined : initializer,
      );
    } else {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) recordBinding(element.name);
      }
    }
  };
  const visitConstants = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      // Reused/shadowed names are deliberately unresolved; this is a syntax
      // check, not a second TypeScript symbol resolver.
      recordBinding(node.name, node.initializer);
    }
    ts.forEachChild(node, visitConstants);
  };
  visitConstants(file);

  const collect = (node: ts.Node, seen = new Set<string>()) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const line =
        file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      for (const name of recipeNames(node.text)) uses.push({ name, line });
    } else if (ts.isTemplateExpression(node)) {
      // A sentinel keeps either side of an interpolation from becoming a
      // falsely complete class, e.g. `af-card-${size}` or `af-${kind}`.
      const value =
        node.head.text +
        node.templateSpans.map((span) => `\0${span.literal.text}`).join("");
      const line =
        file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      for (const name of recipeNames(value)) uses.push({ name, line });
    } else if (ts.isIdentifier(node)) {
      const initializer = constants.get(node.text);
      if (initializer && !seen.has(node.text)) {
        collect(initializer, new Set([...seen, node.text]));
      }
    } else if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        ["clsx", "clsxm", "cn"].includes(node.expression.text)
      ) {
        for (const argument of node.arguments) collect(argument, seen);
      }
    } else if (ts.isConditionalExpression(node)) {
      collect(node.whenTrue, seen);
      collect(node.whenFalse, seen);
    } else if (ts.isBinaryExpression(node)) {
      if (
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind)
      ) {
        collect(node.left, seen);
        collect(node.right, seen);
      }
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) collect(property.name, seen);
      }
    } else if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) collect(element, seen);
    } else if (ts.isJsxExpression(node) && node.expression) {
      collect(node.expression, seen);
    } else if (ts.isParenthesizedExpression(node)) {
      collect(node.expression, seen);
    }
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) === "className" &&
      node.initializer
    ) {
      collect(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return uses;
}

export function validateStyleSources(
  cssSources: StyleSource[],
  componentSources: StyleSource[] = [],
): StyleDiagnostic[] {
  const diagnostics: StyleDiagnostic[] = [];
  const definitions = new Set<string>();
  for (const source of cssSources) {
    let root: postcss.Root;
    try {
      root = postcss.parse(source.content, { from: source.path });
    } catch (error) {
      diagnostics.push({
        path: source.path,
        line: error instanceof postcss.CssSyntaxError ? (error.line ?? 1) : 1,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    root.walkRules((rule) => {
      for (const match of withoutCssStrings(rule.selector).matchAll(
        /\.(af-[a-z0-9]+(?:-[a-z0-9]+)*)\b/g,
      )) {
        definitions.add(match[1]);
      }
    });
    root.walkDecls((declaration) => {
      const value = withoutCssStrings(declaration.value);
      const report = (message: string) =>
        diagnostics.push({
          path: source.path,
          line: declaration.source?.start?.line ?? 1,
          message,
        });
      if (declaration.prop.startsWith("--")) {
        for (const match of value.matchAll(
          /\bvar\(\s*(--[\w-]+)\s*(?=[,)])/g,
        )) {
          if (match[1] === declaration.prop) {
            report(
              `${declaration.prop} directly references itself; use a different fallback token.`,
            );
            break;
          }
        }
      }
      if (
        /^(?:-webkit-)?transition(?:-property)?$/i.test(declaration.prop) &&
        postcss.list
          .comma(value)
          .some((part) =>
            postcss.list
              .space(part)
              .some((word) => word.toLowerCase() === "all"),
          )
      ) {
        report(
          "Name transition properties explicitly instead of transitioning all properties.",
        );
      }
    });
  }
  for (const source of componentSources) {
    const reported = new Set<string>();
    for (const use of findRecipeUses(source)) {
      if (!definitions.has(use.name) && !reported.has(use.name)) {
        diagnostics.push({
          path: source.path,
          line: use.line,
          message: `Undefined recipe .${use.name}; define it in owned CSS or fix the className.`,
        });
        reported.add(use.name);
      }
    }
  }
  return diagnostics;
}

// Representative public contracts, not a snapshot of every utility or value.
export const PUBLIC_STYLE_UTILITIES = {
  "text-ui": "color",
  "text-ui-secondary": "color",
  "border-ui-border": "border-color",
  "bg-ui-subtle": "background-color",
  "cursor-menu": "cursor",
  "cursor-button": "cursor",
} as const;

export function validateCompiledUtilities(css: string): string[] {
  const root = postcss.parse(css);
  return Object.entries(PUBLIC_STYLE_UTILITIES).flatMap(([name, property]) => {
    let generated = false;
    root.walkRules((rule) => {
      if (rule.selectors.includes(`.${name}`)) {
        rule.walkDecls(property, () => {
          generated = true;
        });
      }
    });
    return generated
      ? []
      : [`.${name} did not generate a ${property} declaration.`];
  });
}
