import get from 'lodash.get';
import * as ts from 'typescript';
import { createResolverContext } from './createResolverContext';
import { findAllNodes } from './findAllNodes';
import { getClearCSSCode } from './utils';

export const processTemplateExpression = (
  context: ts.TransformationContext,
  sourceFile: ts.SourceFile,
  templateExpression: ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral,
  wrapClass?: string,
  watcherCallback?: (filename: string) => void
) => {
  if (ts.isNoSubstitutionTemplateLiteral(templateExpression)) {
    if (typeof wrapClass === 'string') {
      const rawText = templateExpression.getText(sourceFile);
      const clearRawText = getClearCSSCode(rawText);
      const wrappedText = `\n.${wrapClass} {\n${clearRawText}\n}`;

      return ts.createNoSubstitutionTemplateLiteral(wrappedText, wrappedText);
    }

    return templateExpression;
  }

  const visit: ts.Visitor = node => {
    if (typeof wrapClass === 'string') {
      if (ts.isTemplateHead(node)) {
        const rawText = node.getText(sourceFile);
        const clearRawText = getClearTemplateHead(rawText);
        const wrappedText = `\n.${wrapClass} {\n${clearRawText}`;

        return ts.createTemplateHead(wrappedText, wrappedText);
      }

      if (ts.isTemplateTail(node)) {
        const rawText = node.getText(sourceFile);
        const clearRawText = getClearCSSCode(rawText);
        const wrappedText = `${clearRawText}\n}\n`;

        return ts.createTemplateTail(wrappedText, wrappedText);
      }
    }

    if (ts.isPropertyAccessExpression(node)) {
      const identifierName = node.getText(sourceFile);
      const parts = identifierName.split('.');

      if (parts.length === 1) {
        return node;
      }

      const importNodes = findAllNodes(sourceFile, node => {
        if (ts.isImportDeclaration(node)) {
          return (
            findAllNodes(node, n2 => {
              if (ts.isIdentifier(n2)) {
                return n2.getText(sourceFile) === parts[0];
              }

              return false;
            }).length > 0
          );
        }

        return false;
      });

      if (importNodes.length > 0) {
        const importNode = importNodes[0];

        const literals = findAllNodes(importNode, node =>
          ts.isStringLiteral(node)
        );

        if (literals.length > 0) {
          const literal = literals[0];

          const importPath = literal.getText(sourceFile);

          const clearImportPath = importPath
            .substring(0, importPath.length - 1)
            .substring(1);

          const moduleExports = createResolverContext(
            watcherCallback
          ).resolverRequire(sourceFile.fileName, clearImportPath);

          const value = get(moduleExports, identifierName);

          return ts.createStringLiteral(String(value));
        }
      }
    }

    return ts.visitEachChild(node, visit, context);
  };

  return ts.visitNode(templateExpression, visit);
};

const getClearTemplateHead = (templateHead: string) => {
  return templateHead.substring(0, templateHead.length - 2).substring(1);
};
