import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Locale } from "@/components/studio/utils/copy";

type GenerationStudioProps = {
  activeView: "gallery" | "studio";
  loading: boolean;
  locale: Locale;
  isConfigured: boolean;
  children: ReactNode;
  t: (key: string) => string;
  onBackToGallery: () => void;
};

export function GenerationStudio({
  activeView,
  loading,
  locale,
  isConfigured,
  children,
  t,
  onBackToGallery
}: GenerationStudioProps) {
  return (
    <section className="workspace">
      {activeView === "studio" && (
        <div className="studio-stage-head">
          <button className="text-button" type="button" disabled={loading} onClick={onBackToGallery}>
            <ChevronDown size={16} />
            {locale === "zh" ? "返回图库" : "Back to gallery"}
          </button>
          <div>
            <p className="section-label">{locale === "zh" ? "统一生图台" : "Generation studio"}</p>
            <h1>{locale === "zh" ? "生成新图片" : "Create a new image"}</h1>
          </div>
          <span className={`status-pill ${isConfigured ? "is-ready" : ""}`}>
            {isConfigured ? t("providerReady") : t("missingKey")}
          </span>
        </div>
      )}

      {children}
    </section>
  );
}
