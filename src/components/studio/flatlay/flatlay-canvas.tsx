"use client";

import { useEffect, useRef } from "react";
import {
  Stage,
  Layer,
  Rect,
  Image as KonvaImage,
  Transformer,
  Group,
} from "react-konva";
import type Konva from "konva";
import type {
  FlatlayBackgroundStyle,
  FlatlayItem,
} from "@/lib/flatlay/types";

interface FlatlayCanvasProps {
  items: FlatlayItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeItem: (id: string, updates: Partial<FlatlayItem>) => void;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundStyle: FlatlayBackgroundStyle;
  images: Record<string, HTMLImageElement>;
  scale: number;
  stageRef?: React.RefObject<Konva.Stage | null>;
}

export function FlatlayCanvas({
  items,
  selectedId,
  onSelect,
  onChangeItem,
  canvasWidth,
  canvasHeight,
  backgroundColor,
  backgroundStyle,
  images,
  scale,
  stageRef,
}: FlatlayCanvasProps) {
  const trRef = useRef<Konva.Transformer | null>(null);
  const itemRefs = useRef<Record<string, Konva.Group | null>>({});

  // Attach transformer to selected item node
  useEffect(() => {
    if (!trRef.current) return;
    if (selectedId && itemRefs.current[selectedId]) {
      trRef.current.nodes([itemRefs.current[selectedId]!]);
      trRef.current.getLayer()?.batchDraw();
    } else {
      trRef.current.nodes([]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId, items]);

  const handleStagePointerDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // If clicking on background rect or stage itself, deselect
    if (e.target === e.target.getStage() || e.target.name() === "background") {
      onSelect(null);
    }
  };

  const sortedItems = [...items].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <Stage
      ref={stageRef}
      width={canvasWidth * scale}
      height={canvasHeight * scale}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={handleStagePointerDown}
      onTouchStart={handleStagePointerDown}
      className="touch-none select-none"
    >
      {/* Background Layer */}
      <Layer>
        <Rect
          name="background"
          x={0}
          y={0}
          width={canvasWidth}
          height={canvasHeight}
          fill={backgroundColor}
        />

        {backgroundStyle === "editorial_frame" && (
          <>
            {/* Outer editorial frame */}
            <Rect
              x={36}
              y={36}
              width={canvasWidth - 72}
              height={canvasHeight - 72}
              stroke="#cfc6b8"
              strokeWidth={2}
              listening={false}
            />
            {/* Inner hairline */}
            <Rect
              x={48}
              y={48}
              width={canvasWidth - 96}
              height={canvasHeight - 96}
              stroke="#e4ddd2"
              strokeWidth={1}
              listening={false}
            />
          </>
        )}
      </Layer>

      {/* Garments Content Layer */}
      <Layer>
        {sortedItems.map((item) => {
          if (item.hidden) return null;
          const htmlImg = images[item.imagePath];

          return (
            <Group
              key={item.id}
              ref={(node) => {
                itemRefs.current[item.id] = node;
              }}
              x={item.x}
              y={item.y}
              rotation={item.rotation}
              scaleX={item.scaleX}
              scaleY={item.scaleY}
              draggable={!item.locked}
              onClick={() => onSelect(item.id)}
              onTap={() => onSelect(item.id)}
              onDragEnd={(e) => {
                onChangeItem(item.id, {
                  x: Math.round(e.target.x()),
                  y: Math.round(e.target.y()),
                });
              }}
              onTransformEnd={(e) => {
                const node = e.target;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();

                onChangeItem(item.id, {
                  x: Math.round(node.x()),
                  y: Math.round(node.y()),
                  scaleX: Number(scaleX.toFixed(3)),
                  scaleY: Number(scaleY.toFixed(3)),
                  rotation: Number(node.rotation().toFixed(1)),
                });
              }}
            >
              {htmlImg ? (
                <KonvaImage
                  image={htmlImg}
                  width={item.width}
                  height={item.height}
                  offsetX={item.width / 2}
                  offsetY={item.height / 2}
                  shadowColor={item.shadow !== false ? "rgba(35, 25, 15, 0.20)" : undefined}
                  shadowBlur={item.shadow !== false ? 28 : 0}
                  shadowOffsetX={item.shadow !== false ? 10 : 0}
                  shadowOffsetY={item.shadow !== false ? 18 : 0}
                />
              ) : (
                // Fallback placeholder rectangle while image is loading
                <Rect
                  width={item.width}
                  height={item.height}
                  offsetX={item.width / 2}
                  offsetY={item.height / 2}
                  fill="#e4ddd2"
                  cornerRadius={12}
                  stroke="#cfc6b8"
                  strokeWidth={1}
                />
              )}
            </Group>
          );
        })}

        {/* Interactive Selection Transformer */}
        <Transformer
          ref={trRef}
          keepRatio={true}
          rotateEnabled={true}
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          borderStroke="#9a4a2f"
          borderStrokeWidth={2}
          anchorStroke="#9a4a2f"
          anchorFill="#ffffff"
          anchorSize={14}
          anchorCornerRadius={7}
          boundBoxFunc={(oldBox, newBox) => {
            // Prevent inverted or tiny bounds
            if (Math.abs(newBox.width) < 30 || Math.abs(newBox.height) < 30) {
              return oldBox;
            }
            return newBox;
          }}
        />
      </Layer>
    </Stage>
  );
}
