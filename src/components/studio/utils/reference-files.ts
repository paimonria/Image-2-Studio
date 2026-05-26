export const MAX_REFERENCE_FILES = 4;

type ReferenceFileInput = ArrayLike<File> | Iterable<File>;

export function mergeReferenceFiles(
  currentFiles: readonly File[],
  nextFiles: ReferenceFileInput,
  limit = MAX_REFERENCE_FILES
) {
  return [...currentFiles, ...Array.from(nextFiles)].slice(0, limit);
}

export function shouldSwitchToImageMode(referenceFiles: readonly File[], canUseImageMode: boolean) {
  return referenceFiles.length > 0 && canUseImageMode;
}
