import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";

interface SignaturePreviewProps {
  /** SVG path data string (multiple paths separated by space, each starting with M) */
  pathData: string;
  /** Width of the preview container */
  width?: number;
  /** Height of the preview container */
  height?: number;
  /** Stroke color */
  strokeColor?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Background color */
  backgroundColor?: string;
}

/**
 * Renders a captured signature from SVG path data.
 * The signature modal stores paths as "M10,20 L30,40 M50,60 L70,80"
 * where each "M" starts a new stroke segment.
 */
export function SignaturePreview({
  pathData,
  width = 280,
  height = 80,
  strokeColor = "#1A1A2E",
  strokeWidth = 2,
  backgroundColor = "#FFFFFF",
}: SignaturePreviewProps) {
  if (!pathData || pathData.trim().length === 0) return null;

  // Split into individual path segments (each starts with M)
  const segments = pathData
    .split(/(?=M)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (segments.length === 0) return null;

  // Calculate bounding box to scale the signature to fit the preview
  const bounds = calculateBounds(segments);
  if (!bounds) return null;

  // Add padding around the signature
  const padding = 8;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;

  const sigWidth = bounds.maxX - bounds.minX || 1;
  const sigHeight = bounds.maxY - bounds.minY || 1;

  // Scale to fit while maintaining aspect ratio
  const scaleX = availableWidth / sigWidth;
  const scaleY = availableHeight / sigHeight;
  const scale = Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x to avoid over-scaling small signatures

  const offsetX = padding + (availableWidth - sigWidth * scale) / 2 - bounds.minX * scale;
  const offsetY = padding + (availableHeight - sigHeight * scale) / 2 - bounds.minY * scale;

  return (
    <View style={[st.container, { width, height, backgroundColor }]}>
      <Svg width={width} height={height}>
        {segments.map((d, i) => (
          <Path
            key={i}
            d={d}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}
          />
        ))}
      </Svg>
    </View>
  );
}

/**
 * Parse SVG path segments to find bounding box coordinates.
 */
function calculateBounds(segments: string[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasPoints = false;

  for (const segment of segments) {
    // Extract all coordinate pairs from M and L commands
    const matches = segment.matchAll(/[ML]\s*([\d.]+)\s*,\s*([\d.]+)/g);
    for (const match of matches) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      if (!isNaN(x) && !isNaN(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        hasPoints = true;
      }
    }
  }

  if (!hasPoints) return null;
  return { minX, minY, maxX, maxY };
}

const st = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: "hidden",
  },
});
