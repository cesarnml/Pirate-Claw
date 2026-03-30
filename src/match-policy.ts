export function matchesAllowedQuality(
  resolution: string | undefined,
  codec: string | undefined,
  resolutions: string[],
  codecs: string[],
): boolean {
  return (
    resolution !== undefined &&
    codec !== undefined &&
    resolutions.includes(resolution) &&
    codecs.includes(codec)
  );
}

export function scoreQualityPreference(
  resolution: string,
  codec: string,
  resolutions: string[],
  codecs: string[],
): number {
  const resolutionIndex = resolutions.indexOf(resolution);
  const codecIndex = codecs.indexOf(codec);

  return (
    scoreResolution(resolutions.length, resolutionIndex) +
    scoreCodec(codecs.length, codecIndex)
  );
}

function scoreResolution(length: number, index: number): number {
  return (length - index) * 100;
}

function scoreCodec(length: number, index: number): number {
  return length - index - 1;
}
