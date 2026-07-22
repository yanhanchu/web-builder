import { allComponentTypes } from "@workspace/ui/lib/generator/component-registry";
import type {
  ComponentDoc,
  ComponentTypeDoc,
  ComponentTypeFieldDoc,
} from "@workspace/ui/types/generator/component-types";
import {
  classifySimpleType,
  getArrayElementType,
  type ManagedType,
  type ParsedField,
} from "@/types/data-manager-types";

const THIRD_PARTY_TYPES = new Set([
  "ReactNode", "ReactElement", "JSX.Element", "React.ReactNode",
  "React.ReactElement", "CSSProperties", "React.CSSProperties",
  "MouseEvent", "KeyboardEvent", "ChangeEvent", "SyntheticEvent",
  "HTMLElement", "HTMLDivElement", "HTMLButtonElement", "HTMLInputElement",
  "RefObject", "MutableRefObject", "Ref",
  "FC", "FunctionComponent", "ComponentType", "ComponentProps",
  "EventHandler", "Dispatch", "SetStateAction",
  "Date", "RegExp", "Map", "Set", "WeakMap", "WeakSet",
  "Promise", "Observable", "Symbol",
]);

function isThirdPartyType(typeStr: string): boolean {
  const t = typeStr.trim();
  if (THIRD_PARTY_TYPES.has(t)) return true;
  if (t.includes("=>")) return true;
  if (/^React\./.test(t)) return true;
  return false;
}

function parseInlineObjectType(typeStr: string): ComponentTypeFieldDoc[] | null {
  const t = typeStr.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  const inner = t.slice(1, -1).trim();
  if (!inner) return [];
  const parts = inner.split(";").map((s) => s.trim()).filter(Boolean);
  const fields: ComponentTypeFieldDoc[] = [];
  for (const part of parts) {
    const match = part.match(/^(\w+)(\?)?:\s*(.+)$/);
    if (!match) continue;
    fields.push({ name: match[1], required: !match[2], type: match[3].trim(), description: "" });
  }
  return fields.length > 0 ? fields : null;
}

export function parseField(field: ComponentTypeFieldDoc): ParsedField {
  const arrayElem = getArrayElementType(field.type);
  const isArray = arrayElem !== null;
  const coreType = isArray ? arrayElem : field.type;

  if (isThirdPartyType(coreType)) {
    return { kind: "unsupported", name: field.name, required: field.required, description: field.description, rawType: field.type };
  }

  const simpleKind = classifySimpleType(coreType);
  if (simpleKind) {
    return { kind: simpleKind, name: field.name, required: field.required, description: field.description, isArray } as ParsedField;
  }

  const inlineFields = parseInlineObjectType(coreType);
  if (inlineFields) {
    const children = inlineFields.map(parseField);
    return { kind: "object", name: field.name, required: field.required, description: field.description, isArray, children } as ParsedField;
  }

  const isStringUnion = /^("[^"]*"(\s*\|\s*"[^"]*")*)$/.test(coreType);
  if (isStringUnion) {
    return { kind: "string", name: field.name, required: field.required, description: field.description, isArray } as ParsedField;
  }

  return { kind: "unsupported", name: field.name, required: field.required, description: field.description, rawType: field.type };
}

function isPropsType(typeName: string): boolean {
  return typeName.endsWith("Props");
}

function hasThirdPartyField(typeDoc: ComponentTypeDoc): boolean {
  return typeDoc.fields.some((f) => {
    const arrayElem = getArrayElementType(f.type);
    const core = arrayElem ?? f.type;
    return isThirdPartyType(core);
  });
}

export function getManagedTypes(component: ComponentDoc): ManagedType[] {
  if (!component.relatedTypeNames?.length) return [];

  const typeMap = new Map<string, ComponentTypeDoc>(
    allComponentTypes.map((t) => [t.name, t])
  );

  const propsTypeName = component.relatedTypeNames.find(
    (n) => n.endsWith("Props") && typeMap.has(n)
  );
  const propsTypeDoc = propsTypeName ? typeMap.get(propsTypeName) : undefined;

  const propTypeStrMap = new Map<string, string>();
  if (propsTypeDoc) {
    for (const f of propsTypeDoc.fields) propTypeStrMap.set(f.name, f.type);
  } else {
    for (const p of component.props) propTypeStrMap.set(p.name, p.type);
  }

  const result: ManagedType[] = [];

  for (const typeName of component.relatedTypeNames) {
    const typeDoc = typeMap.get(typeName);
    if (!typeDoc) continue;
    if (typeDoc.aliasOf) continue;
    if (isPropsType(typeName)) continue;
    if (hasThirdPartyField(typeDoc)) continue;
    if (typeDoc.fields.length === 0) continue;

    let isArrayType = false;
    for (const [, typeStr] of propTypeStrMap.entries()) {
      const elem = getArrayElementType(typeStr);
      const core = elem ?? typeStr;
      if (core === typeName) { isArrayType = elem !== null; break; }
    }

    result.push({ typeId: typeDoc.id, typeName: typeDoc.name, isArrayType, fields: typeDoc.fields.map(parseField) });
  }

  return result;
}
