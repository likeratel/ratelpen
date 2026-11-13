import {
  Circle,
  ClipboardCopy,
  Eraser,
  Flashlight,
  GripVertical,
  Highlighter,
  ImageDown,
  LogOut,
  Minus,
  MoveUpRight,
  Pen,
  Plus,
  Presentation,
  Redo2,
  Settings as SettingsIcon,
  Slash,
  Square,
  Timer,
  Trash,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useRef, type CSSProperties } from "react";
import { TOOLS, type Platform, type Session, type Tool } from "../bridge";
import { t } from "../i18n";
import { KEY_LABELS, commandShortcuts, type UiAction } from "./actions";
import { TOOL_SHORTCUT } from "./shortcuts";
import {
  ICON_SIZE,
  ICON_STROKE,
  ToolbarButton,
  ToolbarDivider,
} from "./ToolbarButton";
import { useToolbarDrag } from "./useToolbarDrag";

const TOOL_ICONS: Readonly<Record<Tool, LucideIcon>> = {
  pen: Pen,
  highlighter: Highlighter,
  line: Slash,
  arrow: MoveUpRight,
  rect: Square,
  ellipse: Circle,
  text: Type,
  eraser: Eraser,
};

interface ToolbarProps {
  readonly session: Session;
  readonly palette: readonly string[];
  readonly platform: Platform;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** True while the pointer is down on the canvas. */
  readonly drawing: boolean;
  /** True while a screenshot is being taken. */
  readonly hidden: boolean;
  readonly onAction: (action: UiAction) => void;
}

type Dispatch = (action: UiAction) => void;

function Icon({ icon: Component }: { readonly icon: LucideIcon }) {
  return <Component size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />;
}

function ToolButtons({ tool, onAction }: { tool: Tool; onAction: Dispatch }) {
  return (
    <div className="tb-group" role="group">
      {TOOLS.map((item) => (
        <ToolbarButton
          key={item}
          label={t(`tool.${item}`)}
          shortcut={TOOL_SHORTCUT[item]}
          pressed={tool === item}
          onClick={() => onAction({ type: "tool", tool: item })}
        >
          <Icon icon={TOOL_ICONS[item]} />
        </ToolbarButton>
      ))}
    </div>
  );
}

function PaletteButtons(props: {
  palette: readonly string[];
  color: string;
  onAction: Dispatch;
}) {
  return (
    <div className="tb-group" role="group">
      {props.palette.map((color, index) => {
        const label = t("toolbar.color", { index: index + 1 });
        return (
          <button
            key={`${index}-${color}`}
            type="button"
            className="tb-swatch"
            aria-label={label}
            aria-pressed={props.color.toLowerCase() === color.toLowerCase()}
            title={t("common.withShortcut", { label, shortcut: index + 1 })}
            style={{ "--swatch": color } as CSSProperties}
            onClick={() => props.onAction({ type: "color", index })}
          />
        );
      })}
    </div>
  );
}

function WidthControls({
  width,
  onAction,
}: {
  width: number;
  onAction: Dispatch;
}) {
  return (
    <div className="tb-group" role="group">
      <ToolbarButton
        label={t("toolbar.thinner")}
        shortcut={KEY_LABELS.thinner}
        onClick={() => onAction({ type: "width", direction: -1 })}
      >
        <Icon icon={Minus} />
      </ToolbarButton>
      <output className="tb-width" aria-label={t("toolbar.width", { width })}>
        {width}
      </output>
      <ToolbarButton
        label={t("toolbar.thicker")}
        shortcut={KEY_LABELS.thicker}
        onClick={() => onAction({ type: "width", direction: 1 })}
      >
        <Icon icon={Plus} />
      </ToolbarButton>
    </div>
  );
}

function ModeToggles({
  session,
  onAction,
}: {
  session: Session;
  onAction: Dispatch;
}) {
  return (
    <div className="tb-group" role="group">
      <ToolbarButton
        label={t("toolbar.fade")}
        shortcut={KEY_LABELS.fade}
        pressed={session.fadeEnabled}
        onClick={() => onAction({ type: "toggleFade" })}
      >
        <Icon icon={Timer} />
      </ToolbarButton>
      <ToolbarButton
        label={t("toolbar.spotlight")}
        shortcut={KEY_LABELS.spotlight}
        pressed={session.spotlight}
        onClick={() => onAction({ type: "toggleSpotlight" })}
      >
        <Icon icon={Flashlight} />
      </ToolbarButton>
      <ToolbarButton
        label={t("toolbar.board", { board: t(`board.${session.board}`) })}
        shortcut={KEY_LABELS.board}
        pressed={session.board !== "none"}
        onClick={() => onAction({ type: "cycleBoard" })}
      >
        <Icon icon={Presentation} />
      </ToolbarButton>
    </div>
  );
}

function HistoryButtons(props: {
  platform: Platform;
  canUndo: boolean;
  canRedo: boolean;
  onAction: Dispatch;
}) {
  const keys = commandShortcuts(props.platform);
  return (
    <div className="tb-group" role="group">
      <ToolbarButton
        label={t("toolbar.undo")}
        shortcut={keys.undo}
        disabled={!props.canUndo}
        onClick={() => props.onAction({ type: "undo" })}
      >
        <Icon icon={Undo2} />
      </ToolbarButton>
      <ToolbarButton
        label={t("toolbar.redo")}
        shortcut={keys.redo}
        disabled={!props.canRedo}
        onClick={() => props.onAction({ type: "redo" })}
      >
        <Icon icon={Redo2} />
      </ToolbarButton>
      <ToolbarButton
        label={t("toolbar.clear")}
        shortcut={KEY_LABELS.clear}
        onClick={() => props.onAction({ type: "clear" })}
      >
        <Icon icon={Trash} />
      </ToolbarButton>
    </div>
  );
}

function AppButtons({ onAction }: { onAction: Dispatch }) {
  return (
    <div className="tb-group" role="group">
      <ToolbarButton
        label={t("toolbar.captureFile")}
        onClick={() => onAction({ type: "capture", destination: "file" })}
      >
        <Icon icon={ImageDown} />
      </ToolbarButton>
      <ToolbarButton
        label={t("toolbar.captureClipboard")}
        onClick={() => onAction({ type: "capture", destination: "clipboard" })}
      >
        <Icon icon={ClipboardCopy} />
      </ToolbarButton>
      <ToolbarButton
        label={t("toolbar.settings")}
        onClick={() => onAction({ type: "openSettings" })}
      >
        <Icon icon={SettingsIcon} />
      </ToolbarButton>
      <ToolbarButton
        label={t("toolbar.exit")}
        shortcut={KEY_LABELS.exit}
        onClick={() => onAction({ type: "exit" })}
      >
        <Icon icon={LogOut} />
      </ToolbarButton>
    </div>
  );
}

export function Toolbar(props: ToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { position, gripHandlers } = useToolbarDrag(ref);
  const { session, onAction } = props;
  const placement: CSSProperties = position
    ? {
        left: position.x,
        top: position.y,
        right: "auto",
        bottom: "auto",
        marginInline: 0,
      }
    : {};
  const className = [
    "toolbar",
    props.drawing ? "is-passive" : "",
    props.hidden ? "is-hidden" : "",
  ].join(" ");

  return (
    <div
      ref={ref}
      className={className}
      role="toolbar"
      aria-label={t("toolbar.label")}
      style={placement}
    >
      <span
        className="tb-grip"
        title={t("toolbar.move")}
        aria-hidden="true"
        {...gripHandlers}
      >
        <Icon icon={GripVertical} />
      </span>
      <ToolButtons tool={session.tool} onAction={onAction} />
      <ToolbarDivider />
      <PaletteButtons
        palette={props.palette}
        color={session.color}
        onAction={onAction}
      />
      <ToolbarDivider />
      <WidthControls width={session.width} onAction={onAction} />
      <ToolbarDivider />
      <ModeToggles session={session} onAction={onAction} />
      <ToolbarDivider />
      <HistoryButtons
        platform={props.platform}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onAction={onAction}
      />
      <ToolbarDivider />
      <AppButtons onAction={onAction} />
    </div>
  );
}
