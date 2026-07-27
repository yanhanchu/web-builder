import type { CSSProperties, ReactNode } from "react";

/** Direction the main axis flows, same semantics as CSS `flex-direction`. */
export type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse";

/** How items wrap onto multiple lines, same semantics as CSS `flex-wrap`. */
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";

/**
 * Horizontal alignment along the main axis when `direction` is `row` /
 * `row-reverse` (or the cross axis when `direction` is a column variant).
 * Mirrors the values available in a flexbox playground's `justify-content`.
 */
export type FlexJustify =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";

/**
 * Vertical alignment along the cross axis when `direction` is `row` /
 * `row-reverse` (or the main axis when `direction` is a column variant).
 * Mirrors the values available in a flexbox playground's `align-items`.
 */
export type FlexAlign = "start" | "center" | "end" | "stretch" | "baseline";

const justifyMap: Record<FlexJustify, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
  "space-evenly": "space-evenly",
};

const alignMap: Record<FlexAlign, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};

export interface FlexItemProps {
  /** Flex-grow factor: how much this item grows to fill extra space. Defaults to `0`. */
  grow?: number;
  /** Flex-shrink factor: how much this item shrinks when space is tight. Defaults to `1`. */
  shrink?: number;
  /** Flex-basis: the item's starting size before growing/shrinking. Defaults to `auto`. */
  basis?: string | number;
  /** Overrides the container's `align` for this item alone (CSS `align-self`). */
  alignSelf?: FlexAlign;
  /** Content rendered inside this flex item, e.g. sample filler content. */
  children: ReactNode;
}

/**
 * An individual item inside a `Flex` container. Optional — plain elements
 * work as `Flex` children too — but `FlexItem` exposes per-item grow /
 * shrink / basis / align-self, the same controls a flexbox playground gives
 * each item alongside the container-level settings.
 */
export function FlexItem({
  grow = 0,
  shrink = 1,
  basis = "auto",
  alignSelf,
  children,
}: FlexItemProps) {
  return (
    <div
      className="glass rounded-xl px-4 py-3 text-center text-sm font-semibold text-foreground/85"
      style={{
        flexGrow: grow,
        flexShrink: shrink,
        flexBasis: basis,
        alignSelf: alignSelf ? alignMap[alignSelf] : undefined,
      }}
    >
      {children ?? "default item"}
    </div>
  );
}

function DefaultFlexItems() {
  return (
    <>
      <FlexItem>item 1</FlexItem>
      <FlexItem>item 2</FlexItem>
      <FlexItem>item 3</FlexItem>
    </>
  );
}

export interface FlexProps {
  /** Flex-direction: which way the main axis runs. Defaults to `row`. */
  direction?: FlexDirection;
  /**
   * Alignment along the main axis (horizontal for `row`, vertical for
   * `column`) — left / center / right plus the distributed-spacing modes.
   * Defaults to `start`.
   */
  justify?: FlexJustify;
  /**
   * Alignment along the cross axis (vertical for `row`, horizontal for
   * `column`) — top / center / bottom / stretch / baseline.
   * Defaults to `stretch`.
   */
  align?: FlexAlign;
  /** Whether items wrap onto additional lines. Defaults to `nowrap`. */
  wrap?: FlexWrap;
  /** Gap between items in pixels. Defaults to `12`. */
  gap?: number;
  /** Minimum height in pixels, useful for previewing alignment on an otherwise short container. */
  minHeight?: number;
  /** Child elements laid out by this flex container. */
  children: ReactNode;
}

/**
 * A configurable flexbox container for arranging its children, exposing the
 * same knobs as a typical flexbox playground: direction, wrap, main-axis
 * justification (start / center / end / space-between / space-around /
 * space-evenly) and cross-axis alignment (start / center / end / stretch /
 * baseline).
 *
 * Purely a layout primitive — it renders no visual chrome of its own beyond
 * spacing, so it composes with any children dropped into its `children` slot.
 */
export function Flex({
  direction = "row",
  justify = "start",
  align = "stretch",
  wrap = "nowrap",
  gap = 12,
  minHeight,
  children,
}: FlexProps) {
  return (
    <div
      className="w-full"
      style={{
        display: "flex",
        flexDirection: direction,
        flexWrap: wrap,
        justifyContent: justifyMap[justify],
        alignItems: alignMap[align],
        gap,
        minHeight,
      }}
    >
      {children ?? <DefaultFlexItems />}
    </div>
  );
}
