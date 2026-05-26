import { useEffect, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Download, ImageOff, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { ImageRecord } from "@/lib/types";
import { RawImage } from "./raw-image";

export type LightboxMode = "detail" | "inspect";
export type LightboxPoint = { x: number; y: number };
export type LightboxImageSize = { width: number; height: number };
export type LightboxDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type StudioLightboxLabels = {
  imagePreview: string;
  closePreview: string;
  download: string;
  preview: string;
  promptUsed: string;
  copied: string;
  copyPrompt: string;
  zoomOut: string;
  resetZoom: string;
  zoomIn: string;
  previousImage: string;
  nextImage: string;
  fitToScreen: string;
  originalSize: string;
  imageLoading: string;
  imageLoadFailed: string;
  openOriginal: string;
};

type StudioLightboxProps = {
  record: ImageRecord;
  mode: LightboxMode;
  isDragging: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  hasPrevious: boolean;
  hasNext: boolean;
  positionLabel: string;
  zoomLabel: string;
  inspectorMeta: string;
  scale: number;
  offset: LightboxPoint;
  providerLabel: string;
  modelLabel: string;
  detailLabel: string;
  copiedPrompt: boolean;
  labels: StudioLightboxLabels;
  onClose: () => void;
  onEnterInspector: () => void;
  onLeaveInspector: () => void;
  onFitToScreen: () => void;
  onOriginalSize: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onCopyPrompt: () => void;
  onImageLoad: (image: HTMLImageElement) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStageDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function StudioLightbox({
  record,
  mode,
  isDragging,
  stageRef,
  hasPrevious,
  hasNext,
  positionLabel,
  zoomLabel,
  inspectorMeta,
  scale,
  offset,
  providerLabel,
  modelLabel,
  detailLabel,
  copiedPrompt,
  labels,
  onClose,
  onEnterInspector,
  onLeaveInspector,
  onFitToScreen,
  onOriginalSize,
  onZoomOut,
  onZoomIn,
  onPrevious,
  onNext,
  onCopyPrompt,
  onImageLoad,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onStageDoubleClick
}: StudioLightboxProps) {
  const [imageState, setImageState] = useState<"loading" | "loaded" | "failed">("loading");

  useEffect(() => {
    setImageState("loading");
  }, [record.id]);

  function handleLoaded(image: HTMLImageElement) {
    setImageState("loaded");
    onImageLoad(image);
  }

  function renderImageStatus() {
    if (imageState === "loaded") return null;

    return (
      <div className={`lightbox-image-state is-${imageState}`} role="status">
        {imageState === "failed" ? <ImageOff size={18} /> : <span className="lightbox-spinner" aria-hidden="true" />}
        <span>{imageState === "failed" ? labels.imageLoadFailed : labels.imageLoading}</span>
        {imageState === "failed" && (
          <a href={record.imageUrl} target="_blank" rel="noreferrer">
            {labels.openOriginal}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`lightbox ${mode === "inspect" ? "is-inspector" : ""}`} role="dialog" aria-modal="true" aria-label={labels.imagePreview}>
      <button className="lightbox-scrim" type="button" aria-label={labels.closePreview} onClick={mode === "inspect" ? onLeaveInspector : onClose} />
      {mode === "inspect" ? (
        <div className={`lightbox-inspector ${isDragging ? "is-dragging" : ""}`} data-testid="lightbox-inspector">
          <div className="lightbox-inspector-toolbar">
            <span className="lightbox-inspector-pill" data-testid="lightbox-zoom-label">{zoomLabel}</span>
            {positionLabel && <span className="lightbox-inspector-pill">{positionLabel}</span>}
            {inspectorMeta && <span className="lightbox-inspector-pill">{inspectorMeta}</span>}
            <div className="lightbox-inspector-actions">
              <button
                className="icon-button"
                type="button"
                title={labels.previousImage}
                aria-label={labels.previousImage}
                disabled={!hasPrevious}
                onClick={onPrevious}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                type="button"
                title={labels.nextImage}
                aria-label={labels.nextImage}
                disabled={!hasNext}
                onClick={onNext}
              >
                <ChevronRight size={17} />
              </button>
              <button
                className="icon-button"
                type="button"
                title={labels.zoomOut}
                aria-label={labels.zoomOut}
                onClick={onZoomOut}
              >
                <Minus size={17} />
              </button>
              <button
                className="icon-button"
                type="button"
                title={labels.fitToScreen}
                aria-label={labels.fitToScreen}
                onClick={onFitToScreen}
              >
                <RotateCcw size={17} />
              </button>
              <button
                className="lightbox-zoom-text"
                data-testid="lightbox-reset-zoom"
                type="button"
                title={labels.originalSize}
                aria-label={labels.originalSize}
                onClick={onOriginalSize}
              >
                100%
              </button>
              <button
                className="icon-button"
                type="button"
                title={labels.zoomIn}
                aria-label={labels.zoomIn}
                onClick={onZoomIn}
              >
                <Plus size={17} />
              </button>
              <a className="icon-button" data-testid="lightbox-download" title={labels.download} aria-label={labels.download} href={record.imageUrl} download>
                <Download size={17} />
              </a>
              <button className="icon-button" type="button" title={labels.closePreview} aria-label={labels.closePreview} onClick={onLeaveInspector}>
                <X size={18} />
              </button>
            </div>
          </div>
          <div
            className="lightbox-inspector-stage"
            data-testid="lightbox-inspector-stage"
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onDoubleClick={onStageDoubleClick}
          >
            <RawImage
              data-testid="lightbox-inspector-image"
              src={record.imageUrl}
              alt={labels.imagePreview}
              fetchPriority="high"
              draggable={false}
              onLoad={(event) => handleLoaded(event.currentTarget)}
              onError={() => setImageState("failed")}
              style={{
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`
              }}
            />
            {renderImageStatus()}
          </div>
          <button className="lightbox-inspector-close" data-testid="lightbox-inspector-close" type="button" onClick={onLeaveInspector}>
            <X size={22} />
          </button>
        </div>
      ) : (
        <div className={`lightbox-panel ${hasPrevious || hasNext ? "has-nav" : ""}`} data-testid="lightbox-detail">
          <div className="lightbox-head">
            <div className="result-meta">
              <span className="tag is-provider">{providerLabel}</span>
              <span className="tag">{modelLabel}</span>
              <span className="tag">{detailLabel}</span>
              {positionLabel && <span className="tag">{positionLabel}</span>}
            </div>
            <button className="icon-button" type="button" title={labels.closePreview} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          {(hasPrevious || hasNext) && (
            <div className="lightbox-nav-strip">
              <button className="text-button tiny" type="button" disabled={!hasPrevious} onClick={onPrevious}>
                <ChevronLeft size={15} />
                {labels.previousImage}
              </button>
              <button className="text-button tiny" type="button" disabled={!hasNext} onClick={onNext}>
                {labels.nextImage}
                <ChevronRight size={15} />
              </button>
            </div>
          )}
          <div className="lightbox-image-wrap" data-testid="lightbox-detail-image">
            <button className="lightbox-image-button" type="button" onClick={onEnterInspector} title={labels.preview}>
              <RawImage
                src={record.imageUrl}
                alt={labels.imagePreview}
                fetchPriority="high"
                onLoad={(event) => handleLoaded(event.currentTarget)}
                onError={() => setImageState("failed")}
              />
            </button>
            {renderImageStatus()}
          </div>
          <details className="lightbox-prompt">
            <summary>
              <span>{labels.promptUsed}</span>
              <button className="text-button tiny" type="button" onClick={onCopyPrompt}>
                {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                {copiedPrompt ? labels.copied : labels.copyPrompt}
              </button>
            </summary>
            <p>{record.prompt}</p>
          </details>
        </div>
      )}
    </div>
  );
}
