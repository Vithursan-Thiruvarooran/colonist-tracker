import type { CSSProperties, ReactNode } from "react";

const HEXAGON_CLIP = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";

/** A flat-top hexagon tile -- the recurring identity mark across this app and
 * the capture extension (one Catan board tile = one unit of data: a brand
 * mark, a player, a captured game). `background` accepts anything CSS does,
 * including a per-player categorical color from chartTheme. */
export default function Hex({
  size = 28,
  background,
  color = "#efe7d8",
  children,
  className = "",
}: {
  size?: number;
  background: string;
  color?: string;
  children?: ReactNode;
  className?: string;
}) {
  const style: CSSProperties = {
    width: size,
    height: size * 0.866,
    clipPath: HEXAGON_CLIP,
    background,
    color,
  };

  return (
    <div
      className={`flex flex-none items-center justify-center text-[10px] font-semibold ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
