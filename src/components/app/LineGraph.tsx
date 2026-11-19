'use client';
import React, { useId, useState } from 'react';
import { cx } from './ui';

interface Point {
  label: string;
  value: number;
  sub?: string;
}

export function LineGraph({
  data,
  strokeColor = '#f97316', // orange default
  fillGradient = true,
  height = 140,
  valuePrefix = '$',
  formatValue,
}: {
  data: Point[];
  strokeColor?: string;
  fillGradient?: boolean;
  height?: number;
  valuePrefix?: string;
  formatValue?: (n: number) => string;
}) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div className="text-xs text-slate-400 py-8 text-center">No trend data available</div>;
  }

  const values = data.map((d) => d.value);
  const maxVal = Math.max(1, ...values);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;

  const paddingX = 24;
  const paddingY = 20;
  const width = 500;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  // Calculate coordinates
  const points = data.map((d, i) => {
    const x = data.length === 1 ? width / 2 : paddingX + (i / (data.length - 1)) * innerWidth;
    const y = height - paddingY - ((d.value - minVal) / range) * innerHeight;
    return { x, y, ...d };
  });

  // Build SVG path
  let pathD = '';
  if (points.length === 1) {
    pathD = `M ${points[0].x - 40} ${points[0].y} L ${points[0].x + 40} ${points[0].y}`;
  } else {
    pathD = points.reduce((acc, p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      // Smooth cubic bezier or straight lines
      const prev = points[i - 1];
      const cp1x = prev.x + (p.x - prev.x) / 2;
      const cp2x = prev.x + (p.x - prev.x) / 2;
      return `${acc} C ${cp1x} ${prev.y}, ${cp2x} ${p.y}, ${p.x} ${p.y}`;
    }, '');
  }

  // Area path for gradient fill
  const areaD =
    points.length > 1
      ? `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
      : '';

  const format = formatValue || ((n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : n.toLocaleString()));

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Base line */}
        <line
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
          stroke="#e2e8f0"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Area Fill */}
        {fillGradient && areaD && <path d={areaD} fill={`url(#${gradientId})`} />}

        {/* Main Line */}
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => {
          const isHovered = hoverIndex === i;
          return (
            <g key={i} className="cursor-pointer" onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex(null)}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? 5.5 : 3.5}
                fill="#ffffff"
                stroke={strokeColor}
                strokeWidth={isHovered ? 2.5 : 2}
                className="transition-all duration-150"
              />
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoverIndex !== null && points[hoverIndex] && (
        <div
          className="absolute z-10 -top-2 bg-slate-900 text-white rounded-lg px-2.5 py-1 text-xs shadow-md pointer-events-none transform -translate-x-1/2 -translate-y-full whitespace-nowrap transition-all"
          style={{ left: `${(points[hoverIndex].x / width) * 100}%` }}
        >
          <div className="font-semibold">
            {points[hoverIndex].label}: {valuePrefix}
            {format(points[hoverIndex].value)}
          </div>
          {points[hoverIndex].sub && <div className="text-[10px] text-slate-300">{points[hoverIndex].sub}</div>}
        </div>
      )}

      {/* Bottom X-axis labels */}
      <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 px-1">
        {data.map((d, i) => (
          <span key={i} className="truncate max-w-[80px]" title={d.label}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
