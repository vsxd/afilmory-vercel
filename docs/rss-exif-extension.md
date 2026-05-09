# Afilmory RSS EXIF Extension Specification

## 概述

本规范定义了在 RSS 2.0 feeds 中包含摄影 EXIF 数据的标准方法，专为照片画廊网站设计。该扩展允许 RSS 阅读器和其他应用程序访问详细的摄影技术参数，并支持不同类型的图片展示。

## 协议版本

**当前版本**: `1.1`  
**协议标识**: `afilmory-rss-exif`

## 协议元数据

### `<exif:version>`

**描述**: 协议版本号  
**位置**: `<channel>` 元素内  
**格式**: 语义化版本号  
**示例**: `<exif:version>1.1</exif:version>`  
**必需**: 是

### `<exif:protocol>`

**描述**: 协议标识符  
**位置**: `<channel>` 元素内  
**格式**: 字符串标识符  
**示例**: `<exif:protocol>afilmory-rss-exif</exif:protocol>`  
**必需**: 是

## EXIF 标签定义

### 相机设置参数 (basic)

#### `<exif:aperture>`

**描述**: 光圈值  
**格式**: `f/{数值}`  
**示例**: `<exif:aperture>f/1.4</exif:aperture>`  
**映射**: EXIF FNumber 字段

#### `<exif:shutterSpeed>`

**描述**: 快门速度  
**格式**:

- 长曝光: `{秒数}s`
- 短曝光: `1/{分母}s`  
  **示例**:
- `<exif:shutterSpeed>1/250s</exif:shutterSpeed>`
- `<exif:shutterSpeed>2s</exif:shutterSpeed>`  
  **映射**: EXIF ExposureTime 字段

#### `<exif:iso>`

**描述**: ISO 感光度  
**格式**: 整数  
**示例**: `<exif:iso>1000</exif:iso>`  
**映射**: EXIF ISOSpeedRatings 字段

#### `<exif:exposureCompensation>`

**描述**: 曝光补偿  
**格式**: `{±数值} EV`  
**示例**:

- `<exif:exposureCompensation>+0.7 EV</exif:exposureCompensation>`
- `<exif:exposureCompensation>-1.3 EV</exif:exposureCompensation>`  
  **映射**: EXIF ExposureBiasValue 字段

### 镜头参数 (lens)

#### `<exif:focalLength>`

**描述**: 实际焦距  
**格式**: `{数值}mm`  
**示例**: `<exif:focalLength>50mm</exif:focalLength>`  
**映射**: EXIF FocalLength 字段

#### `<exif:focalLength35mm>`

**描述**: 等效35mm焦距  
**格式**: `{数值}mm`  
**示例**: `<exif:focalLength35mm>75mm</exif:focalLength35mm>`  
**映射**: EXIF FocalLengthIn35mmFilm 字段

#### `<exif:lens>`

**描述**: 镜头型号  
**格式**: CDATA 包装的字符串  
**示例**: `<exif:lens><![CDATA[BS-Optics FX 50mm F1.4]]></exif:lens>`  
**映射**: EXIF LensModel 字段

#### `<exif:maxAperture>`

**描述**: 镜头最大光圈  
**格式**: `f/{数值}`  
**示例**: `<exif:maxAperture>f/1.4</exif:maxAperture>`  
**映射**: EXIF MaxApertureValue 字段

### 设备信息 (basic)

#### `<exif:camera>`

**描述**: 相机品牌和型号  
**格式**: CDATA 包装的字符串  
**示例**: `<exif:camera><![CDATA[FUJIFILM X-T5]]></exif:camera>`  
**映射**: EXIF Make + Model 字段组合

### 图像属性 (basic)

#### `<exif:imageWidth>`

**描述**: 图像宽度（像素）  
**格式**: 整数  
**示例**: `<exif:imageWidth>7728</exif:imageWidth>`  
**映射**: 来自图像处理系统的实际宽度

#### `<exif:imageHeight>`

**描述**: 图像高度（像素）  
**格式**: 整数  
**示例**: `<exif:imageHeight>5152</exif:imageHeight>`  
**映射**: 来自图像处理系统的实际高度

#### `<exif:dateTaken>`

**描述**: 拍摄时间（原始时间戳）  
**格式**: ISO 8601 格式  
**示例**: `<exif:dateTaken>2025-06-05T16:12:43.000Z</exif:dateTaken>`  
**映射**: EXIF DateTimeOriginal 字段

#### `<exif:orientation>`

**描述**: 图像方向  
**格式**: 整数 (1-8)  
**示例**: `<exif:orientation>1</exif:orientation>`  
**映射**: EXIF Orientation 字段

### 位置信息 (location)

#### `<exif:gpsLatitude>`

**描述**: GPS纬度  
**格式**: 十进制度数  
**示例**: `<exif:gpsLatitude>39.9042</exif:gpsLatitude>`  
**映射**: EXIF GPSLatitude 字段

#### `<exif:gpsLongitude>`

**描述**: GPS经度  
**格式**: 十进制度数  
**示例**: `<exif:gpsLongitude>116.4074</exif:gpsLongitude>`  
**映射**: EXIF GPSLongitude 字段

#### `<exif:altitude>`

**描述**: 海拔高度  
**格式**: `{数值}m`  
**示例**: `<exif:altitude>1200m</exif:altitude>`  
**映射**: EXIF GPSAltitude 字段

#### `<exif:location>`

**描述**: 拍摄地点名称  
**格式**: CDATA 包装的字符串  
**示例**: `<exif:location><![CDATA[北京天安门广场]]></exif:location>`  
**映射**: 地理编码或用户标注

### 技术参数 (technical)

#### `<exif:whiteBalance>`

**描述**: 白平衡设置  
**格式**: 枚举值  
**示例**: `<exif:whiteBalance>Auto</exif:whiteBalance>`  
**映射**: EXIF WhiteBalance 字段  
**可选值**: `Auto`, `Daylight`, `Cloudy`, `Tungsten`, `Fluorescent`, `Flash`, `Manual`

#### `<exif:meteringMode>`

**描述**: 测光模式  
**格式**: 枚举值  
**示例**: `<exif:meteringMode>Matrix</exif:meteringMode>`  
**映射**: EXIF MeteringMode 字段  
**可选值**: `Matrix`, `Center-weighted`, `Spot`, `Multi-spot`, `Pattern`

#### `<exif:flashMode>`

**描述**: 闪光灯模式  
**格式**: 枚举值  
**示例**: `<exif:flashMode>Off</exif:flashMode>`  
**映射**: EXIF Flash 字段  
**可选值**: `Off`, `On`, `Auto`, `Red-eye`, `Fill`, `Slow-sync`

#### `<exif:colorSpace>`

**描述**: 色彩空间  
**格式**: 枚举值  
**示例**: `<exif:colorSpace>sRGB</exif:colorSpace>`  
**映射**: EXIF ColorSpace 字段  
**可选值**: `sRGB`, `Adobe RGB`, `ProPhoto RGB`, `DCI-P3`

### 高级参数 (advanced)

#### `<exif:exposureProgram>`

**描述**: 曝光程序  
**格式**: 枚举值  
**示例**: `<exif:exposureProgram>Aperture Priority</exif:exposureProgram>`  
**映射**: EXIF ExposureProgram 字段  
**可选值**: `Manual`, `Program`, `Aperture Priority`, `Shutter Priority`, `Creative`, `Action`, `Portrait`, `Landscape`

#### `<exif:sceneMode>`

**描述**: 场景模式  
**格式**: CDATA 包装的字符串  
**示例**: `<exif:sceneMode><![CDATA[Portrait]]></exif:sceneMode>`  
**映射**: EXIF SceneCaptureType 字段

#### `<exif:contrast>`

**描述**: 对比度设置  
**格式**: 枚举值  
**示例**: `<exif:contrast>Normal</exif:contrast>`  
**映射**: EXIF Contrast 字段  
**可选值**: `Low`, `Normal`, `High`

#### `<exif:saturation>`

**描述**: 饱和度设置  
**格式**: 枚举值  
**示例**: `<exif:saturation>Normal</exif:saturation>`  
**映射**: EXIF Saturation 字段  
**可选值**: `Low`, `Normal`, `High`

#### `<exif:sharpness>`

**描述**: 锐度设置  
**格式**: 枚举值  
**示例**: `<exif:sharpness>Normal</exif:sharpness>`  
**映射**: EXIF Sharpness 字段  
**可选值**: `Soft`, `Normal`, `Hard`

## 完整示例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" >
  <channel>
    <title><![CDATA[我的风景摄影画廊]]></title>
    <link>https://example.com</link>
    <description><![CDATA[分享我的风景摄影作品]]></description>
    
    <!-- 协议元数据 -->
    <exif:version>1.1</exif:version>
    <exif:protocol>afilmory-rss-exif</exif:protocol>
 
    
    <item>
      <title><![CDATA[夕阳下的城市]]></title>
      <link>https://example.com/photo123</link>
      <guid isPermaLink="true">https://example.com/photo123</guid>
      <description><![CDATA[城市天际线在夕阳下的美丽景象]]></description>
      <pubDate>Thu, 05 Jun 2025 16:12:43 GMT</pubDate>
      <category><![CDATA[风景]]></category>
      <category><![CDATA[城市]]></category>
      <enclosure url="https://example.com/thumbnails/photo123.webp" type="image/webp" length="1024000" />
      
      <!-- 基础 EXIF 数据 -->
      <exif:aperture>f/1.4</exif:aperture>
      <exif:shutterSpeed>1/250s</exif:shutterSpeed>
      <exif:iso>1000</exif:iso>
      <exif:exposureCompensation>0 EV</exif:exposureCompensation>
      <exif:imageWidth>7728</exif:imageWidth>
      <exif:imageHeight>5152</exif:imageHeight>
      <exif:dateTaken>2025-06-05T16:12:43.000Z</exif:dateTaken>
      <exif:camera><![CDATA[FUJIFILM X-T5]]></exif:camera>
      <exif:orientation>1</exif:orientation>
      
      <!-- 镜头信息 -->
      <exif:lens><![CDATA[BS-Optics FX 50mm F1.4]]></exif:lens>
      <exif:focalLength>50mm</exif:focalLength>
      <exif:focalLength35mm>75mm</exif:focalLength35mm>
      <exif:maxAperture>f/1.4</exif:maxAperture>
      
      <!-- 位置信息 -->
      <exif:gpsLatitude>39.9042</exif:gpsLatitude>
      <exif:gpsLongitude>116.4074</exif:gpsLongitude>
      <exif:altitude>50m</exif:altitude>
      <exif:location><![CDATA[北京天安门广场]]></exif:location>
      
      <!-- 技术参数 -->
      <exif:whiteBalance>Auto</exif:whiteBalance>
      <exif:meteringMode>Matrix</exif:meteringMode>
      <exif:flashMode>Off</exif:flashMode>
      <exif:colorSpace>sRGB</exif:colorSpace>
    </item>
  </channel>
</rss>
```

## 兼容性和实现注意事项

### 向后兼容性

- 标准的 RSS 2.0 阅读器将忽略不识别的命名空间元素
- 核心 RSS 功能（标题、链接、描述等）保持完全兼容

### 可选字段

- 除协议版本和图片展类型外，所有 EXIF 标签都是可选的
- 如果某个 EXIF 数据不可用，应省略对应的标签而不是输出空值
- 实现者可以根据 `supportedFields` 声明选择性实现字段集

### 数据验证

- 实现者应验证 EXIF 数据的有效性
- 对于无效或缺失的数据，建议静默跳过而不是输出错误值
- 枚举类型字段应严格验证取值范围

### 性能考虑

- EXIF 数据提取可能影响 RSS 生成性能
- 建议在构建时预处理 EXIF 数据而非实时提取
- 可根据 `supportedFields` 声明优化数据提取范围

### 字段集实现建议

- `basic` 字段集适用于大多数基础应用
- `location` 字段集需要考虑隐私保护
- `advanced` 字段集适用于专业摄影应用
- 实现者可以自定义字段集组合

## 版本历史

- **v1.1** (2025-01-19): 扩展规范

  - 添加协议版本号和标识符
  - 定义图片展类型系统
  - 引入EXIF字段集概念
  - 扩充EXIF字段定义
  - 添加位置信息、技术参数和高级参数字段集

- **v1.0** (2025-01-19): 初始规范发布
  - 定义核心 EXIF 标签集合
  - 建立命名空间约定
  - 提供完整实现示例

## 许可证

本规范基于 Creative Commons Attribution 4.0 International License 发布。
