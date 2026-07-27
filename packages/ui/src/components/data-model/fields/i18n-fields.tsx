import type {
  DataSource,
  I18nDataSource,
  I18nPrimitiveValue,
  PrimitiveType,
} from '@workspace/ui/lib/data-model/schema';
import { Labeled, inputStyle } from '../shared';

const PRIMITIVE_TYPES: PrimitiveType[] = ['string', 'number', 'boolean', 'date'];

function coercePrimitive(
  v: I18nPrimitiveValue,
  target: PrimitiveType,
): I18nPrimitiveValue {
  if (target === 'number') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (target === 'boolean') return Boolean(v);
  return String(v ?? '');
}

export function I18nFields({
  source,
  locales,
  onChange,
}: {
  source: I18nDataSource;
  locales: string[];
  onChange: (next: DataSource) => void;
}) {
  const setValueType = (valueType: PrimitiveType) => {
    // 換型別時，把既有值盡量轉換，避免整批清空
    const values: Record<string, I18nPrimitiveValue> = {};
    for (const [l, v] of Object.entries(source.values)) {
      values[l] = coercePrimitive(v, valueType);
    }
    onChange({ ...source, valueType, values });
  };

  const setLocaleValue = (locale: string, raw: I18nPrimitiveValue) => {
    onChange({ ...source, values: { ...source.values, [locale]: raw } });
  };

  return (
    <>
      <Labeled label="valueType（值型別）">
        <select
          value={source.valueType}
          onChange={(e) => setValueType(e.target.value as PrimitiveType)}
          style={inputStyle}
        >
          {PRIMITIVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Labeled>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 8, marginBottom: 2 }}>
        各語系值
      </div>
      {locales.map((locale) => (
        <Labeled key={locale} label={locale} inline>
          <I18nValueInput
            valueType={source.valueType}
            value={source.values[locale]}
            onChange={(v) => setLocaleValue(locale, v)}
          />
        </Labeled>
      ))}
    </>
  );
}

function I18nValueInput({
  valueType,
  value,
  onChange,
}: {
  valueType: PrimitiveType;
  value: I18nPrimitiveValue | undefined;
  onChange: (next: I18nPrimitiveValue) => void;
}) {
  if (valueType === 'number') {
    return (
      <input
        type="number"
        value={Number(value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={inputStyle}
      />
    );
  }
  if (valueType === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle}
    />
  );
}
