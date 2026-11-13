import { useEffect, useState } from "react";

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

function readViewport(): Viewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
  };
}

/** Window size in CSS px and the current devicePixelRatio. */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const update = () => setViewport(readViewport());
    window.addEventListener("resize", update);
    // A monitor change can alter devicePixelRatio without a resize.
    const query = window.matchMedia(`(resolution: ${viewport.pixelRatio}dppx)`);
    query.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      query.removeEventListener("change", update);
    };
  }, [viewport.pixelRatio]);

  return viewport;
}
