import { Star } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  hexToHsv,
  hsvToHex,
  parseColorInput,
  rgbLabel,
  type Hsv,
} from "../drawing/color";
import { t } from "../i18n";
import { ColorWheel } from "./ColorWheel";
import {
  addFavorite,
  loadFavorites,
  removeFavorite,
  saveFavorites,
} from "./favoriteColors";

const BRIGHTNESS_STEPS = 100;

interface ColorPickerProps {
  readonly color: string;
  readonly onPick: (color: string) => void;
  readonly onClose: () => void;
}

/** Favourites that survive relaunches; falls back to memory when storage fails. */
function useFavorites() {
  const [favorites, setFavorites] = useState(loadFavorites);
  const update = (next: readonly string[]) => {
    setFavorites(next);
    saveFavorites(next);
  };
  return {
    favorites,
    add: (color: string) => update(addFavorite(favorites, color)),
    remove: (color: string) => update(removeFavorite(favorites, color)),
  };
}

/** How many of our own recent picks to recognise when they echo back. */
const ECHO_MEMORY = 64;

/**
 * The wheel position cannot be recovered from a grey or black hex, so the
 * picker keeps its own HSV and follows `color` only when it changed elsewhere
 * (a palette key, another display). Picks are sent at most once per frame, and
 * their echoes from the core are recognised so a drag is never pulled back.
 */
function usePickerHsv(color: string, onPick: (color: string) => void) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color));
  const [text, setText] = useState(color);
  const sent = useRef<readonly string[]>([color]);
  const pending = useRef<string | null>(null);
  const frame = useRef(0);
  const latestOnPick = useRef(onPick);
  useEffect(() => {
    latestOnPick.current = onPick;
  });

  useEffect(() => {
    if (pending.current !== null || sent.current.includes(color)) return;
    sent.current = [color];
    setHsv(hexToHsv(color));
    setText(color);
  }, [color]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const flush = () => {
    frame.current = 0;
    const hex = pending.current;
    pending.current = null;
    if (hex === null) return;
    sent.current = [...sent.current, hex].slice(-ECHO_MEMORY);
    latestOnPick.current(hex);
  };

  const pickHsv = (next: Hsv) => {
    const hex = hsvToHex(next);
    setHsv(next);
    setText(hex);
    pending.current = hex;
    if (frame.current === 0) frame.current = requestAnimationFrame(flush);
  };
  const pickHex = (hex: string) => pickHsv(hexToHsv(hex));

  return { hsv, text, setText, pickHsv, pickHex };
}

function Favorites(props: {
  readonly favorites: readonly string[];
  readonly color: string;
  readonly onPick: (color: string) => void;
}) {
  if (props.favorites.length === 0)
    return <p className="color-empty">{t("color.noFavorites")}</p>;
  return (
    <div className="color-favorites" role="group">
      {props.favorites.map((favorite) => (
        <button
          key={favorite}
          type="button"
          className="tb-swatch"
          aria-label={t("color.useFavorite", { color: favorite })}
          aria-pressed={favorite === props.color}
          title={favorite}
          style={{ "--swatch": favorite } as CSSProperties}
          onClick={() => props.onPick(favorite)}
        />
      ))}
    </div>
  );
}

/** Colour wheel, brightness, typed hex or RGB, and the user's favourites. */
export function ColorPicker({ color, onPick, onClose }: ColorPickerProps) {
  const { hsv, text, setText, pickHsv, pickHex } = usePickerHsv(color, onPick);
  const { favorites, add, remove } = useFavorites();
  const typed = parseColorInput(text);
  const current = hsvToHex(hsv);
  const isFavorite = favorites.includes(current);

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") onClose();
    if (event.key === "Enter" && typed) pickHex(typed);
  };
  const favoriteLabel = t(isFavorite ? "color.unfavorite" : "color.favorite");

  return (
    <div className="color-picker" role="dialog" aria-label={t("color.picker")}>
      <ColorWheel hsv={hsv} onChange={pickHsv} />
      <label className="color-row">
        <span>{t("color.brightness")}</span>
        <input
          type="range"
          min={0}
          max={BRIGHTNESS_STEPS}
          value={Math.round(hsv.v * BRIGHTNESS_STEPS)}
          onChange={(event) =>
            pickHsv({
              ...hsv,
              v: Number(event.target.value) / BRIGHTNESS_STEPS,
            })
          }
        />
      </label>
      <div className="color-row">
        <span
          className="color-preview"
          style={{ background: current }}
          aria-hidden="true"
        />
        <input
          className="color-code"
          aria-label={t("color.code")}
          aria-invalid={typed === null ? true : undefined}
          spellCheck={false}
          value={text}
          placeholder="#rrggbb / 255, 0, 0"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onInputKey}
          onBlur={() => (typed ? pickHex(typed) : setText(current))}
        />
        <button
          type="button"
          className="tb-button"
          aria-label={favoriteLabel}
          aria-pressed={isFavorite}
          title={favoriteLabel}
          onClick={() => (isFavorite ? remove(current) : add(current))}
        >
          <Star
            size={16}
            aria-hidden
            fill={isFavorite ? "currentColor" : "none"}
          />
        </button>
      </div>
      <p className="color-rgb">RGB {rgbLabel(current)}</p>
      <h3 className="color-heading">{t("color.favorites")}</h3>
      <Favorites favorites={favorites} color={current} onPick={pickHex} />
    </div>
  );
}
