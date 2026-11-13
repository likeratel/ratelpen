import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bridge,
  type CursorPosition,
  type OverlayCommand,
  type Platform,
  type Session,
  type SessionPatch,
  type Settings,
} from "../bridge";
import { fadeDurationMs } from "../drawing/fade";
import { t, type MessageKey } from "../i18n";
import { describeError } from "../shared/errors";
import { useBridgeEvent } from "../shared/useBridgeEvent";
import {
  useToast,
  type ToastKind,
  type ToastMessage,
} from "../shared/useToast";
import { DrawingSurface } from "./DrawingSurface";
import { BoardLayer, SpotlightLayer, Toast } from "./Layers";
import { TextEditor } from "./TextEditor";
import { Toolbar } from "./Toolbar";
import { useCapture } from "./useCapture";
import { useDrawingDocument } from "./useDrawingDocument";
import { useInkInput } from "./useInkInput";
import { useOverlayActions } from "./useOverlayActions";
import { useOverlayKeyboard } from "./useOverlayKeyboard";
import { useOverlayState } from "./useOverlayState";
import { useReportContent } from "./useReportContent";
import { useSelection } from "./useSelection";
import { useViewport } from "./useViewport";

type ErrorReporter = (summary: MessageKey) => (error: unknown) => void;

const onCursor = (listener: (cursor: CursorPosition) => void) =>
  bridge.onCursor(listener);
const onOverlayCommand = (listener: (command: OverlayCommand) => void) =>
  bridge.onOverlayCommand(listener);

function useNoContextMenu(): void {
  useEffect(() => {
    const block = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);
}

export function OverlayApp() {
  const { toast, showToast } = useToast();
  const reportError: ErrorReporter = useCallback(
    (summary) => (error) => {
      console.error(t(summary), error);
      showToast(describeError(summary, error), "error");
    },
    [showToast],
  );
  const onSessionError = useMemo(
    () => reportError("error.session"),
    [reportError],
  );
  const { state, patchSession } = useOverlayState(onSessionError);
  useNoContextMenu();

  if (state.status === "loading") return null;
  if (state.status === "error")
    return (
      <div className="toast toast-error" role="alert">
        {describeError("error.bootstrap", state.error)}
      </div>
    );
  return (
    <ReadyOverlay
      session={state.session}
      settings={state.settings}
      platform={state.platform}
      patchSession={patchSession}
      reportError={reportError}
      toast={toast}
      showToast={showToast}
    />
  );
}

interface ReadyOverlayProps {
  readonly session: Session;
  readonly settings: Settings;
  readonly platform: Platform;
  readonly patchSession: (patch: SessionPatch) => void;
  readonly reportError: ErrorReporter;
  readonly toast: ToastMessage | null;
  readonly showToast: (text: string, kind?: ToastKind) => void;
}

/** Wires the document, input, bridge events and actions together. */
function useOverlayController(props: ReadyOverlayProps) {
  const { session, settings, reportError } = props;
  const { doc, canUndo, canRedo, actions } = useDrawingDocument();
  const [drawing, setDrawing] = useState(false);
  const [cursor, setCursor] = useState<CursorPosition>(null);
  const { capturing, capture } = useCapture(props.showToast);
  const ink = useInkInput(session, actions);
  const onReportError = useMemo(
    () => reportError("error.report"),
    [reportError],
  );
  const onActionError = useMemo(
    () => reportError("error.action"),
    [reportError],
  );

  useReportContent(doc.shapes.length > 0, onReportError);
  useBridgeEvent(onCursor, setCursor);
  useBridgeEvent(onOverlayCommand, (command) => {
    if (command.type !== "clear") return;
    ink.text.cancel();
    actions.clear();
  });

  const dispatch = useOverlayActions({
    session,
    settings,
    patchSession: props.patchSession,
    documentActions: actions,
    capture,
    onError: onActionError,
  });
  // Space would type into the text box, so selecting waits until it closes.
  const selection = useSelection({
    active: session.active && !ink.text.draft,
    shapes: doc.shapes,
    erase: actions.erase,
    dispatch,
  });
  useOverlayKeyboard(session.active, selection.onKeyAction);

  return {
    doc,
    canUndo,
    canRedo,
    actions,
    drawing,
    setDrawing,
    cursor,
    capturing,
    ink,
    dispatch,
    selection,
  };
}

function ReadyOverlay(props: ReadyOverlayProps) {
  const { session, settings } = props;
  const viewport = useViewport();
  const c = useOverlayController(props);
  const { text } = c.ink;

  return (
    <div className={`overlay ${session.active ? "is-active" : "is-passive"}`}>
      <BoardLayer board={session.board} />
      <DrawingSurface
        viewport={viewport}
        shapes={c.doc.shapes}
        fadeMs={fadeDurationMs(settings.fadeSeconds)}
        active={session.active}
        tool={session.tool}
        style={c.ink.style}
        selecting={c.selection.selecting}
        selection={c.selection.selection}
        onSelect={c.selection.select}
        onMove={c.actions.move}
        onDraftEnd={c.ink.onDraftEnd}
        onErase={c.actions.erase}
        onExpire={c.actions.expire}
        onTextRequest={c.ink.onTextRequest}
        onDrawingChange={c.setDrawing}
      />
      <SpotlightLayer
        enabled={session.spotlight}
        cursor={c.cursor}
        style={settings.spotlightStyle}
        radius={settings.spotlightRadius}
      />
      {session.active && text.draft && !c.capturing && (
        <TextEditor
          draft={text.draft}
          onChange={text.change}
          onCommit={text.commit}
          onCancel={text.cancel}
        />
      )}
      {session.active && (
        <Toolbar
          session={session}
          palette={settings.palette}
          platform={props.platform}
          canUndo={c.canUndo}
          canRedo={c.canRedo}
          drawing={c.drawing}
          hidden={c.capturing}
          onAction={c.dispatch}
        />
      )}
      {!c.capturing && <Toast toast={props.toast} />}
    </div>
  );
}
