// 转换结果接口
// Strategies produce bytes; a consumer's MediaLease owns the object URL.
export interface ConversionResult {
  blob: Blob;
  convertedSize: number;
  format: string;
  originalSize: number;
}

export type OriginalImageReason = "native" | "unhandled" | "unidentified";
export type ImageConversionOutcome =
  | { kind: "original"; reason: OriginalImageReason; blob: Blob }
  | ({ kind: "converted" } & ConversionResult);

// 图像转换策略接口
export interface ImageConverterStrategy {
  /**
   * 检测是否需要转换此格式
   */
  shouldConvert: (blob: Blob) => Promise<boolean>;

  /**
   * 执行转换
   */
  convert: (blob: Blob, originalUrl: string) => Promise<ConversionResult>;

  /**
   * 策略名称，用于日志和调试
   */
  getName: () => string;

  /**
   * 获取支持的格式
   */
  getSupportedFormats: () => string[];
}
