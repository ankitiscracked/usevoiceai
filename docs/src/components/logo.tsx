import React, { useMemo } from "react";

interface LogoProps {
  size?: number;
  color1?: string; // Primary (e.g., Black)
  color2?: string; // Secondary (e.g., Dark Gray)
  className?: string;
}

const UseVoiceAILogo: React.FC<LogoProps> = ({
  size = 256,
  color1 = "black",
  color2 = "#555555",
  className = "",
}) => {
  // --- Configuration Constants ---
  const VIEWBOX_SIZE = 100;
  const U_BAR_W = 2.5;
  const U_BAR_H = 14.0;
  const STEP = 3.8;
  const CENTER_X = 45.0;
  const CENTER_Y = 50.0;
  const RADIUS = 36.0;

  // --- Geometry Calculation ---
  const { outerBars, innerBars } = useMemo(() => {
    const outer = [];

    // 1. Top Straight Arm (Right to Left)
    // Starts at 93.15 + half_width (1.25) = 94.4
    const topStraightCenters: number[] = [];
    let currX = 94.4;
    // We stop around x=48.8 to leave room for the bridge/curve
    while (currX >= 48.8 - 0.1) {
      topStraightCenters.push(currX);
      currX -= STEP;
    }

    // Add Top Straight Bars
    topStraightCenters.forEach((x) => {
      outer.push({ x, y: 14.0, rot: 0, type: "straight" });
    });

    // 2. Top Bridge (Connection point to arc)
    outer.push({ x: 45.0, y: 14.0, rot: 0, type: "bridge_top" });

    // 3. The Arc (0 to 180 degrees)
    // We generated 29 intervals (30 points) in Python.
    // Excluding the 0 and 180 points which serve as bridges.
    const numArcPoints = 30;
    for (let i = 1; i < numArcPoints - 1; i++) {
      const thetaDeg = (i / (numArcPoints - 1)) * 180;
      const thetaRad = (thetaDeg * Math.PI) / 180;

      // Calculate position based on rotation around (45, 50)
      // x = cx - r * sin(theta)
      // y = cy - r * cos(theta)
      const bx = CENTER_X - RADIUS * Math.sin(thetaRad);
      const by = CENTER_Y - RADIUS * Math.cos(thetaRad);

      outer.push({ x: bx, y: by, rot: -thetaDeg, type: "arc" });
    }

    // 4. Bottom Bridge
    outer.push({ x: 45.0, y: 86.0, rot: -180, type: "bridge_bot" });

    // 5. Bottom Straight Arm (Left to Right)
    // Mirror the top centers
    [...topStraightCenters].reverse().forEach((x) => {
      outer.push({ x, y: 86.0, rot: 0, type: "straight" });
    });

    // --- Color Assignment for Outer ---
    const outerWithColors = outer.map((bar, index) => ({
      ...bar,
      color: index % 2 === 0 ? color1 : color2,
    }));

    // --- Inner V Calculation ---
    // Generate Grid X positions
    const gridX: number[] = [];

    // Right side (from center outwards)
    let gx = 45.0;
    while (gx <= 94.4 + 0.1) {
      gridX.push(gx);
      gx += STEP;
    }

    // Left side (Deep start inside curve)
    gx = 45.0 - STEP;
    while (gx >= 20.0) {
      gridX.unshift(gx);
      gx -= STEP;
    }

    // Heights and Colors
    const V_MIN_H = 6.0;
    const V_MAX_H = 52.0;

    // Find the reference color to align phases.
    // We look for the Bottom Straight bar at x=48.8 (approx).
    const refOuterIndex = outerWithColors.findIndex(
      (b) => b.type === "straight" && b.y === 86.0 && Math.abs(b.x - 48.8) < 0.1
    );
    const refColor =
      refOuterIndex !== -1 ? outerWithColors[refOuterIndex].color : color1;

    // Find the Inner bar index at x=48.8
    const refInnerIndex = gridX.findIndex((x) => Math.abs(x - 48.8) < 0.1);

    const inner = gridX.map((x, index) => {
      // Linear Height Growth
      const t = index / (gridX.length - 1);
      const h = V_MIN_H + (V_MAX_H - V_MIN_H) * t;

      // Color Alignment Logic
      let barColor = color1;

      if (refInnerIndex !== -1) {
        // Calculate distance from reference index to determine color phase
        const dist = Math.abs(index - refInnerIndex);
        // If dist is even, same color. If odd, swap.
        const isSamePhase = dist % 2 === 0;

        if (refColor === color1) {
          barColor = isSamePhase ? color1 : color2;
        } else {
          barColor = isSamePhase ? color2 : color1;
        }
      } else {
        // Fallback default alternation
        barColor = index % 2 === 0 ? color1 : color2;
      }

      return { x, y: 50.0, h, color: barColor };
    });

    return { outerBars: outerWithColors, innerBars: inner };
  }, [color1, color2]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="UseVoiceAI Logo"
    >
      {/* Render Outer U-Shape */}
      {outerBars.map((bar, i) => (
        <rect
          key={`outer-${i}`}
          x={(bar.x - U_BAR_W / 2).toFixed(2)}
          y={(bar.y - U_BAR_H / 2).toFixed(2)}
          width={U_BAR_W}
          height={U_BAR_H}
          rx={U_BAR_W / 2}
          fill={bar.color}
          transform={
            bar.rot
              ? `rotate(${bar.rot.toFixed(2)} ${bar.x.toFixed(2)} ${bar.y.toFixed(2)})`
              : undefined
          }
        />
      ))}

      {/* Render Inner V-Shape */}
      {innerBars.map((bar, i) => (
        <rect
          key={`inner-${i}`}
          x={(bar.x - U_BAR_W / 2).toFixed(2)}
          y={(bar.y - bar.h / 2).toFixed(2)}
          width={U_BAR_W}
          height={bar.h.toFixed(2)}
          rx={U_BAR_W / 2}
          fill={bar.color}
        />
      ))}
    </svg>
  );
};

export default UseVoiceAILogo;
