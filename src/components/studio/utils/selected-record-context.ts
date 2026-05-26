import type { CatalogResponse, ImageRecord } from "../../../lib/types";
import { modelSupports } from "./generation-options";

export type SelectedRecordContext = {
  selectedRecord: ImageRecord | undefined;
  selectedRecordModel: CatalogResponse["models"][number] | undefined;
  selectedRecordCanContinue: boolean;
  activeSourceRecords: ImageRecord[];
};

type SelectedRecordContextInput = {
  records: readonly ImageRecord[];
  selectedRecordId: string;
  catalog: CatalogResponse | null;
  sourceImageIds: readonly string[];
};

type ContinueImageCatalog = {
  providers: ReadonlyArray<{ provider: ImageRecord["provider"]; configured: boolean }>;
  models: ReadonlyArray<{ provider: ImageRecord["provider"]; modelId: string; capabilities: string[] }>;
};

export function getSelectedRecordContext(input: SelectedRecordContextInput): SelectedRecordContext {
  const selectedRecord = input.selectedRecordId
    ? input.records.find((record) => record.id === input.selectedRecordId)
    : undefined;
  const selectedRecordModel = selectedRecord
    ? input.catalog?.models.find((item) => item.provider === selectedRecord.provider && item.modelId === selectedRecord.model)
    : undefined;

  return {
    selectedRecord,
    selectedRecordModel,
    selectedRecordCanContinue: selectedRecord ? canContinueImageRecord(selectedRecord, input.catalog) : false,
    activeSourceRecords: input.sourceImageIds
      .map((id) => input.records.find((record) => record.id === id))
      .filter((record): record is ImageRecord => Boolean(record))
  };
}

export function canContinueImageRecord(record: ImageRecord, catalog: ContinueImageCatalog | null) {
  const providerConfigured = Boolean(
    catalog?.providers.find((item) => item.provider === record.provider)?.configured
  );
  const model = catalog?.models.find((item) => item.provider === record.provider && item.modelId === record.model);

  return providerConfigured && modelSupports(model, "continue-edit");
}
