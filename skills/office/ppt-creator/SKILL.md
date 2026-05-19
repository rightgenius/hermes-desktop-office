---
name: ppt-creator
description: 创建、编辑和转换 PowerPoint 演示文稿。支持生成幻灯片、添加图表、表格、图片占位符，以及导出为 PDF。
category: office
---

# PowerPoint Creator Skill

使用 Python 的 `python-pptx` 库创建和编辑 PowerPoint 演示文稿。

## 能力

- 创建新的 PPTX 文件
- 添加标题页、内容页、章节页
- 插入文本框、图片占位符、表格
- 设置主题、字体、颜色
- 导出为 PDF（需要系统安装 LibreOffice）

## 使用方式

通过 `scripts/ppt_creator.py` 脚本调用：

```bash
python ppt_creator.py --title "季度报告" --output report.pptx
```

## 依赖

- `python-pptx` (Python 库)
- LibreOffice（可选，用于 PDF 导出）
