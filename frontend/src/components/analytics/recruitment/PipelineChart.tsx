import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  COLORS,
  flowLabel,
  Link,
  number,
  SOURCE_DEFINITIONS,
  STAGES,
} from "./types";

const SOURCES = ["New entrants", "List additions"];
const ORDER = [...SOURCES, ...STAGES, "Archived"];
const MIN_WIDTH = 880;
const TOP = 64; // room for node labels
const BAND = 180; // height of the busiest node, in px
const NODE = 12;
const DROP_GAP = 16; // space between a node and its archive drop
const RIGHT_PAD = 110; // room for the last stage's label and drop

type Node = {
  name: string;
  x: number;
  y: number;
  h: number;
  incoming: number;
  outgoing: number;
};
type Shape = { link: Link; d: string };

const key = (l: { from: string; to: string }) => `${l.from}→${l.to}`;
const gradientId = (l: Link) =>
  `ra-grad-${ORDER.indexOf(l.from)}-${ORDER.indexOf(l.to)}`;
const colour = (name: string) => COLORS[name] || COLORS["New entrants"];

/**
 * Stage movement Sankey. Flows run left to right through the stages; players
 * archived from a stage drop straight down into the archive bar, so exits
 * never cross the forward path. Moves back a stage and restorations from the
 * archive are listed beneath the chart. Node captions keep the end-date stage
 * total separate from the period's movements.
 */
export default function PipelineChart({
  links,
  stageCounts,
  selected,
  onSelect,
  onSelectStage,
}: {
  links: Link[];
  stageCounts: Record<string, number>;
  selected?: { from: string; to: string };
  onSelect: (link: Link) => void;
  onSelectStage: (stage: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  // Lay the chart out at its real rendered width so labels stay at true size.
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(MIN_WIDTH, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    const col = (n: string) =>
      SOURCES.includes(n) ? 0 : STAGES.indexOf(n) + 1;
    const known = (n: string) => SOURCES.includes(n) || STAGES.includes(n);
    const forward = links.filter(
      (l) => known(l.from) && known(l.to) && col(l.to) > col(l.from),
    );
    const drops = links.filter((l) => known(l.from) && l.to === "Archived");
    const other = links.filter(
      (l) => !forward.includes(l) && !drops.includes(l),
    );
    const names = ORDER.filter(
      (n) =>
        STAGES.includes(n) ||
        (SOURCES.includes(n) && links.some((l) => l.from === n)),
    );
    const sum = (list: Link[]) => list.reduce((s, l) => s + l.value, 0);
    const totals = Object.fromEntries(
      names.map((n) => [
        n,
        {
          incoming: sum(forward.filter((l) => l.to === n)),
          outgoing: sum([...forward, ...drops].filter((l) => l.from === n)),
        },
      ]),
    );
    const max = Math.max(
      1,
      ...names.map((n) => Math.max(totals[n].incoming, totals[n].outgoing)),
    );
    const scale = BAND / max;
    const step = (width - 8 - NODE - RIGHT_PAD) / 5;
    const nodes: Record<string, Node> = {};
    let sourceY = TOP;
    names.forEach((n) => {
      const t = totals[n];
      const h = Math.max(3, Math.max(t.incoming, t.outgoing) * scale);
      const c = col(n);
      const y = c === 0 ? sourceY : TOP;
      if (c === 0) sourceY += h + 56;
      nodes[n] = { name: n, x: 4 + c * step, y, h, ...t };
    });
    const w = (l: Link) => Math.max(1.5, l.value * scale);

    // Stack each node's outflows in target order with its archive drop last
    // (at the bottom, next to where it turns down), and inflows in source order.
    const out: Record<string, number> = {};
    const into: Record<string, number> = {};
    const start = new Map<string, number>();
    const end = new Map<string, number>();
    names.forEach((n) => {
      forward
        .filter((l) => l.from === n)
        .sort((a, b) => col(a.to) - col(b.to))
        .concat(drops.filter((l) => l.from === n))
        .forEach((l) => {
          start.set(key(l), nodes[n].y + (out[n] || 0));
          out[n] = (out[n] || 0) + w(l);
        });
      forward
        .filter((l) => l.to === n)
        .sort(
          (a, b) =>
            col(a.from) - col(b.from) || nodes[a.from].y - nodes[b.from].y,
        )
        .forEach((l) => {
          end.set(key(l), nodes[n].y + (into[n] || 0));
          into[n] = (into[n] || 0) + w(l);
        });
    });
    const flows: Shape[] = forward.map((l) => {
      const a = nodes[l.from],
        b = nodes[l.to];
      const sy = start.get(key(l))!,
        ty = end.get(key(l))!,
        sx = a.x + NODE,
        tx = b.x,
        mx = (sx + tx) / 2,
        lw = w(l);
      return {
        link: l,
        d: `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty} L${tx},${ty + lw} C${mx},${ty + lw} ${mx},${sy + lw} ${sx},${sy + lw} Z`,
      };
    });
    const floor = Math.max(
      TOP + BAND,
      ...Object.values(nodes).map((n) => n.y + n.h),
    );
    const trayY = floor + 64;
    const dropShapes = drops.map((l) => {
      const n = nodes[l.from];
      const sy = start.get(key(l))!,
        sx = n.x + NODE,
        lw = w(l),
        ax = sx + DROP_GAP;
      // A band that leaves the node's right edge and bends straight down.
      return {
        link: l,
        x: ax,
        w: lw,
        d: `M${sx},${sy} C${ax + lw},${sy} ${ax + lw},${sy} ${ax + lw},${trayY} L${ax},${trayY} C${ax},${sy + lw} ${ax},${sy + lw} ${sx},${sy + lw} Z`,
      };
    });
    const tray = dropShapes.length
      ? {
          x: Math.min(...dropShapes.map((s) => s.x)) - 8,
          right: Math.max(...dropShapes.map((s) => s.x + s.w)) + 8,
        }
      : null;
    return {
      nodes,
      flows,
      drops: dropShapes,
      tray,
      trayY,
      other,
      archived: sum(drops),
      height: trayY + (tray ? 46 : 8),
    };
  }, [links, width]);

  if (!links.length)
    return (
      <div className="ra-empty">
        No stage moves in these dates. Try a longer period or clear a filter.
      </div>
    );

  const selectedKey = selected ? key(selected) : null;
  const active = hover || selectedKey;
  const lit = (l: Link) =>
    active
      ? key(l) === active
      : hoverNode
        ? l.from === hoverNode || l.to === hoverNode
        : true;
  const focused = !!(active || hoverNode);
  const readout = links.find((l) => key(l) === active);
  const describe = (l: Link) =>
    `${flowLabel(l.from)} to ${l.to}: ${number(l.value)} movement${l.value === 1 ? "" : "s"}. View players.`;
  const press = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
  const caption = (n: Node) =>
    SOURCES.includes(n.name)
      ? `${number(n.outgoing)} movements`
      : `${number(n.incoming)} moves in · ${number(n.outgoing)} out`;
  const flowProps = (l: Link) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": describe(l),
    "aria-pressed": selectedKey === key(l),
    onMouseEnter: () => setHover(key(l)),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(key(l)),
    onBlur: () => setHover(null),
    onClick: () => onSelect(l),
    onKeyDown: press(() => onSelect(l)),
  });
  const state = (l: Link) =>
    `${lit(l) ? " is-lit" : ""}${selectedKey === key(l) ? " is-selected" : ""}`;

  return (
    <div className="ra-sankey-wrap">
      <p className="ra-sankey-readout" aria-live="polite">
        {readout ? (
          <>
            <i style={{ background: colour(readout.to) }} />
            <strong>{flowLabel(readout.from)}</strong> →{" "}
            <strong>{readout.to}</strong>
            <span>{number(readout.value)} movements</span>
            <em>
              {selectedKey === key(readout)
                ? "Players listed below"
                : "Click to see the players"}
            </em>
          </>
        ) : hoverNode && layout.nodes[hoverNode] ? (
          <>
            <i style={{ background: colour(hoverNode) }} />
            <strong>{flowLabel(hoverNode)}</strong>
            {SOURCE_DEFINITIONS[hoverNode] && (
              <span>{SOURCE_DEFINITIONS[hoverNode]}</span>
            )}
            {STAGES.includes(hoverNode) && (
              <span>{number(stageCounts[hoverNode] || 0)} players now ·</span>
            )}
            <span>{caption(layout.nodes[hoverNode])}</span>
            {STAGES.includes(hoverNode) && <em>Click to see its players</em>}
          </>
        ) : null}
      </p>
      <div
        className="ra-chart-scroll"
        ref={frame}
        tabIndex={0}
        role="region"
        aria-label="Stage movement chart"
      >
        <svg
          className={`ra-sankey${focused ? " is-focused" : ""}`}
          viewBox={`0 0 ${width} ${layout.height}`}
          width={width}
          height={layout.height}
          role="group"
          aria-label="Stage movements during the period. Select a flow to see its players."
          onMouseLeave={() => {
            setHover(null);
            setHoverNode(null);
          }}
        >
          <defs>
            {layout.flows.map(({ link }) => (
              <linearGradient key={key(link)} id={gradientId(link)}>
                <stop offset="0%" stopColor={colour(link.from)} />
                <stop offset="100%" stopColor={colour(link.to)} />
              </linearGradient>
            ))}
            {layout.drops.map(({ link }) => (
              <linearGradient
                key={key(link)}
                id={gradientId(link)}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={colour(link.from)} />
                <stop offset="55%" stopColor={colour("Archived")} />
              </linearGradient>
            ))}
          </defs>
          {layout.drops.map(({ link, d }) => (
            <path
              key={key(link)}
              d={d}
              className={`ra-flow is-archive${state(link)}`}
              fill={`url(#${gradientId(link)})`}
              {...flowProps(link)}
            />
          ))}
          {layout.flows.map(({ link, d }) => (
            <path
              key={key(link)}
              d={d}
              className={`ra-flow${state(link)}`}
              fill={`url(#${gradientId(link)})`}
              {...flowProps(link)}
            />
          ))}
          {layout.tray && (
            <g className="ra-tray">
              <rect
                x={layout.tray.x}
                y={layout.trayY}
                width={layout.tray.right - layout.tray.x}
                height={6}
                rx={3}
                fill={colour("Archived")}
              />
              <text
                x={layout.tray.x}
                y={layout.trayY + 26}
                className="ra-node-name"
              >
                Archived
                <tspan className="ra-node-caption" dx={8}>
                  {number(layout.archived)} movements in the period
                </tspan>
              </text>
            </g>
          )}
          {Object.values(layout.nodes).map((n) => {
            const stage = STAGES.includes(n.name);
            const open = () => stage && onSelectStage(n.name);
            return (
              <g
                key={n.name}
                className={`ra-node${stage ? " is-stage" : ""}${hoverNode === n.name ? " is-hover" : ""}`}
                onMouseEnter={() => setHoverNode(n.name)}
                onMouseLeave={() => setHoverNode(null)}
                onClick={open}
                onKeyDown={press(open)}
                role={stage ? "button" : undefined}
                tabIndex={stage ? 0 : undefined}
                aria-label={
                  stage
                    ? `${n.name}: ${number(stageCounts[n.name] || 0)} players on the end date; ${caption(n)}. View players.`
                    : undefined
                }
              >
                <rect
                  x={n.x}
                  y={n.y}
                  width={NODE}
                  height={n.h}
                  rx={3}
                  fill={colour(n.name)}
                />
                {SOURCE_DEFINITIONS[n.name] && (
                  <title>{SOURCE_DEFINITIONS[n.name]}</title>
                )}
                <text x={n.x} y={n.y - 30} className="ra-node-name">
                  {flowLabel(n.name)}
                  {stage && (
                    <tspan className="ra-node-total" dx={8}>
                      {number(stageCounts[n.name] || 0)}
                    </tspan>
                  )}
                </text>
                <text x={n.x} y={n.y - 12} className="ra-node-caption">
                  {caption(n)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {layout.other.length > 0 && (
        <div className="ra-backflows">
          <span>Moved back or restored:</span>
          <ul>
            {layout.other.map((l) => (
              <li key={key(l)}>
                <button
                  type="button"
                  className={selectedKey === key(l) ? "is-selected" : undefined}
                  aria-pressed={selectedKey === key(l)}
                  onClick={() => onSelect(l)}
                  onMouseEnter={() => setHover(key(l))}
                  onMouseLeave={() => setHover(null)}
                >
                  <i style={{ background: colour(l.to) }} />
                  {flowLabel(l.from)} → {l.to}
                  <strong>{number(l.value)}</strong>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
