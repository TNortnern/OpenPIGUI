import {
  useCallback,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { CloseIcon, MaximizeIcon, MinimizeIcon } from "./icons";
import {
  clampRightRailWidth,
  rightRailPanels,
  type RightRailMode,
} from "./right-rail-model";

export interface RightRailProps {
  readonly mode: RightRailMode;
  readonly width: number;
  readonly takeover: boolean;
  readonly onModeChange: (mode: RightRailMode) => void;
  readonly onClose: () => void;
  readonly onWidthChange: (width: number) => void;
  readonly onToggleTakeover: () => void;
  readonly children: ReactNode;
}

export function RightRail({
  mode,
  width,
  takeover,
  onModeChange,
  onClose,
  onWidthChange,
  onToggleTakeover,
  children,
}: RightRailProps) {
  const dragRef = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startWidth: number;
  } | null>(null);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || takeover) {
        return;
      }
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: width,
      };
    },
    [takeover, width],
  );

  const handleResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      // Drag left increases width.
      const nextWidth = clampRightRailWidth(
        drag.startWidth + (drag.startX - event.clientX),
        window.innerWidth,
      );
      onWidthChange(nextWidth);
    },
    [onWidthChange],
  );

  const endResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const className = ["right-rail", takeover ? "right-rail--takeover" : ""]
    .filter(Boolean)
    .join(" ");

  const style = {
    "--right-rail-width": `${width}px`,
    width: takeover ? undefined : `${width}px`,
  } as CSSProperties;

  return (
    <aside className={className} data-testid="right-rail" style={style}>
      {!takeover ? (
        <div
          className="right-rail__resize-handle"
          data-testid="right-rail-resize-handle"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />
      ) : null}
      <div className="right-rail__header">
        <div className="right-rail__modes" role="tablist" aria-label="Right rail panels">
          {rightRailPanels.map((panel) => {
            const active = panel.id === mode;
            return (
              <button
                key={panel.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`right-rail__mode${active ? " right-rail__mode--active" : ""}`}
                data-testid={panel.testId}
                onClick={() => onModeChange(panel.id)}
              >
                {panel.label}
              </button>
            );
          })}
        </div>
        <div className="right-rail__actions">
          <button
            type="button"
            className="icon-button right-rail__action"
            title={takeover ? "Restore panel" : "Maximize panel"}
            aria-label={takeover ? "Restore panel" : "Maximize panel"}
            data-testid="right-rail-takeover"
            onClick={onToggleTakeover}
          >
            {takeover ? <MinimizeIcon /> : <MaximizeIcon />}
          </button>
          <button
            type="button"
            className="icon-button right-rail__action"
            title="Close panel"
            aria-label="Close panel"
            data-testid="right-rail-close"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="right-rail__body">{children}</div>
    </aside>
  );
}
