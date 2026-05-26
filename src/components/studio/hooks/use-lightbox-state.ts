import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ImageRecord } from "@/lib/types";
import type { LightboxDragState, LightboxImageSize, LightboxMode, LightboxPoint } from "../lightbox";

const LIGHTBOX_MIN_SCALE = 0.25;
const LIGHTBOX_MAX_SCALE = 5;
const LIGHTBOX_WHEEL_ZOOM_IN = 1.12;
const LIGHTBOX_WHEEL_ZOOM_OUT = 0.88;
const LIGHTBOX_DOUBLE_CLICK_SCALE = 2;

function clampLightboxScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(LIGHTBOX_MAX_SCALE, Math.max(LIGHTBOX_MIN_SCALE, value));
}

function getLightboxZoomLabel(scale: number) {
  return `${Math.round(scale * 100)}%`;
}

function formatFileBytes(bytes: number | null) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = unitIndex === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

export function useLightboxState(records: ImageRecord[]) {
  const [recordId, setRecordId] = useState("");
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [mode, setMode] = useState<LightboxMode>("detail");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<LightboxPoint>({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<LightboxImageSize>({ width: 0, height: 0 });
  const [fileBytes, setFileBytes] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<LightboxDragState | null>(null);
  const pointersRef = useRef(new Map<number, LightboxPoint>());
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startMidpoint: LightboxPoint;
    originX: number;
    originY: number;
  } | null>(null);

  const record = useMemo(
    () => records.find((item) => item.id === recordId),
    [recordId, records]
  );
  const scopedRecordIds = useMemo(() => {
    const recordIds = new Set(records.map((item) => item.id));
    const ids = scopeIds.length > 0 ? scopeIds : records.map((item) => item.id);
    const normalized = ids.filter((id, index) => recordIds.has(id) && ids.indexOf(id) === index);

    if (recordId && recordIds.has(recordId) && !normalized.includes(recordId)) {
      return [recordId, ...normalized];
    }

    return normalized;
  }, [recordId, records, scopeIds]);
  const currentIndex = scopedRecordIds.indexOf(recordId);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < scopedRecordIds.length - 1;
  const positionLabel = currentIndex >= 0 && scopedRecordIds.length > 1
    ? `${currentIndex + 1} / ${scopedRecordIds.length}`
    : "";
  const zoomLabel = getLightboxZoomLabel(scale);
  const dimensionLabel = naturalSize.width > 0 && naturalSize.height > 0
    ? `${naturalSize.width} x ${naturalSize.height}`
    : "";
  const inspectorMeta = [formatFileBytes(fileBytes), dimensionLabel].filter(Boolean).join(" - ");

  const resetTransform = useCallback(() => {
    dragRef.current = null;
    pinchRef.current = null;
    pointersRef.current.clear();
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
  }, []);

  const clampOffset = useCallback((nextOffset: LightboxPoint, nextScale = scale) => {
    const stage = stageRef.current;
    if (!stage || nextScale <= 1) return { x: 0, y: 0 };

    const rect = stage.getBoundingClientRect();
    const maxX = Math.max(80, (rect.width * (nextScale - 1)) / 2 + 80);
    const maxY = Math.max(80, (rect.height * (nextScale - 1)) / 2 + 80);

    return {
      x: Math.max(-maxX, Math.min(maxX, nextOffset.x)),
      y: Math.max(-maxY, Math.min(maxY, nextOffset.y))
    };
  }, [scale]);

  function getStagePoint(clientX: number, clientY: number) {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };

    const rect = stage.getBoundingClientRect();
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2
    };
  }

  function getPointerDistance(left: LightboxPoint, right: LightboxPoint) {
    return Math.hypot(right.x - left.x, right.y - left.y);
  }

  function getPointerMidpoint(left: LightboxPoint, right: LightboxPoint) {
    return {
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2
    };
  }

  function open(nextRecordId: string, nextScopeIds?: string[]) {
    if (nextScopeIds) {
      setScopeIds(nextScopeIds);
    } else if (scopeIds.length === 0) {
      setScopeIds(records.map((item) => item.id));
    }
    setRecordId(nextRecordId);
    setMode("detail");
    setNaturalSize({ width: 0, height: 0 });
    setFileBytes(null);
    resetTransform();
  }

  function close() {
    setRecordId("");
    setScopeIds([]);
    setMode("detail");
    setNaturalSize({ width: 0, height: 0 });
    setFileBytes(null);
    resetTransform();
  }

  function enterInspector() {
    setMode("inspect");
    resetTransform();
  }

  function leaveInspector() {
    setMode("detail");
    resetTransform();
  }

  const goToRecord = useCallback((nextRecordId: string) => {
    if (!nextRecordId || nextRecordId === recordId) return;

    setRecordId(nextRecordId);
    setNaturalSize({ width: 0, height: 0 });
    setFileBytes(null);
    resetTransform();
  }, [recordId, resetTransform]);

  const goPrevious = useCallback(() => {
    if (!hasPrevious) return;
    goToRecord(scopedRecordIds[currentIndex - 1]);
  }, [currentIndex, goToRecord, hasPrevious, scopedRecordIds]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    goToRecord(scopedRecordIds[currentIndex + 1]);
  }, [currentIndex, goToRecord, hasNext, scopedRecordIds]);

  function handleImageLoad(image: HTMLImageElement) {
    setNaturalSize({
      width: image.naturalWidth,
      height: image.naturalHeight
    });
  }

  function updateScale(nextValue: number, anchor?: LightboxPoint) {
    const currentScale = scale || 1;
    const nextScale = clampLightboxScale(nextValue);
    if (nextScale === currentScale) return;

    setScale(nextScale);
    if (anchor) {
      const factor = nextScale / currentScale;
      setOffset((current) => ({
        ...clampOffset({
          x: anchor.x - (anchor.x - current.x) * factor,
          y: anchor.y - (anchor.y - current.y) * factor
        }, nextScale)
      }));
    } else if (nextScale <= 1) {
      setOffset({ x: 0, y: 0 });
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "inspect" || (event.pointerType === "mouse" && event.button !== 0)) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, getStagePoint(event.clientX, event.clientY));

    if (pointersRef.current.size >= 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      const startDistance = getPointerDistance(first, second);
      if (startDistance > 0) {
        dragRef.current = null;
        pinchRef.current = {
          startDistance,
          startScale: scale || 1,
          startMidpoint: getPointerMidpoint(first, second),
          originX: offset.x,
          originY: offset.y
        };
        setDragging(true);
      }
      return;
    }

    if (scale <= 1) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y
    };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, getStagePoint(event.clientX, event.clientY));
    }

    if (pinchRef.current && pointersRef.current.size >= 2) {
      event.preventDefault();

      const [first, second] = Array.from(pointersRef.current.values());
      const currentDistance = getPointerDistance(first, second);
      if (currentDistance <= 0) return;

      const currentMidpoint = getPointerMidpoint(first, second);
      const nextScale = clampLightboxScale(pinchRef.current.startScale * (currentDistance / pinchRef.current.startDistance));
      const factor = nextScale / pinchRef.current.startScale;
      const nextOffset = clampOffset({
        x: currentMidpoint.x - (pinchRef.current.startMidpoint.x - pinchRef.current.originX) * factor,
        y: currentMidpoint.y - (pinchRef.current.startMidpoint.y - pinchRef.current.originY) * factor
      }, nextScale);

      setScale(nextScale);
      setOffset(nextOffset);
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    setOffset(clampOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    }));
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);

    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      dragRef.current = null;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointersRef.current.size === 0) {
      setDragging(false);
    }
  }

  function handleStageDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (mode !== "inspect") return;

    event.preventDefault();
    const nextScale = scale > 1 ? 1 : LIGHTBOX_DOUBLE_CLICK_SCALE;
    updateScale(nextScale, getStagePoint(event.clientX, event.clientY));
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (mode !== "inspect" || !stage) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const rect = stage.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2
      };
      const factor = event.deltaY < 0 ? LIGHTBOX_WHEEL_ZOOM_IN : LIGHTBOX_WHEEL_ZOOM_OUT;
      const currentScale = scale || 1;
      const nextScale = clampLightboxScale(currentScale * factor);
      if (nextScale === currentScale) return;

      setScale(nextScale);
      const offsetFactor = nextScale / currentScale;
      setOffset((current) => ({
        ...clampOffset({
          x: anchor.x - (anchor.x - current.x) * offsetFactor,
          y: anchor.y - (anchor.y - current.y) * offsetFactor
        }, nextScale)
      }));
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [clampOffset, mode, scale]);

  useEffect(() => {
    if (!record) {
      setFileBytes(null);
      setNaturalSize({ width: 0, height: 0 });
      return;
    }

    let cancelled = false;
    setFileBytes(null);

    void fetch(record.imageUrl, { method: "HEAD" })
      .then((response) => {
        if (cancelled || !response.ok) return;

        const contentLength = response.headers.get("content-length");
        const bytes = contentLength ? Number(contentLength) : Number.NaN;
        if (Number.isFinite(bytes) && bytes > 0) {
          setFileBytes(bytes);
        }
      })
      .catch(() => {
        // File size is only a viewer enhancement; ignore metadata failures.
      });

    return () => {
      cancelled = true;
    };
  }, [record]);

  useEffect(() => {
    if (!recordId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resetTransform();

        if (mode === "inspect") {
          setMode("detail");
          return;
        }

        setRecordId("");
        setMode("detail");
        setFileBytes(null);
        setNaturalSize({ width: 0, height: 0 });
        return;
      }

      if (event.key === "ArrowLeft" && hasPrevious) {
        event.preventDefault();
        goPrevious();
        return;
      }

      if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        goNext();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious, hasNext, hasPrevious, mode, recordId, resetTransform, scopedRecordIds]);

  return {
    recordId,
    record,
    mode,
    hasPrevious,
    hasNext,
    positionLabel,
    scale,
    offset,
    dragging,
    stageRef,
    zoomLabel,
    inspectorMeta,
    open,
    close,
    resetTransform,
    enterInspector,
    leaveInspector,
    goPrevious,
    goNext,
    handleImageLoad,
    updateScale,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handleStageDoubleClick
  };
}
